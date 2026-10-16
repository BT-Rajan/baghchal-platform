"""Application factory."""

import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import structlog
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from sqlalchemy import text
from starlette.middleware.cors import CORSMiddleware

from baghchal_server.accounts.routes import router as accounts_router
from baghchal_server.config import Settings
from baghchal_server.db import create_engine, session_factory
from baghchal_server.deps import AppState, State
from baghchal_server.errors import install_handlers
from baghchal_server.lobby import models as _lobby_models  # noqa: F401  (registers tables)
from baghchal_server.lobby.routes import router as lobby_router
from baghchal_server.mail import Mailer, make_mailer
from baghchal_server.middleware import BodyLimit, CrossSiteGuard, RequestContext, SecurityHeaders
from baghchal_server.ratelimit import MemoryRateLimiter, RateLimiter, RedisRateLimiter
from baghchal_server.realtime.hub import Hub, MemoryBroker, RedisBroker
from baghchal_server.realtime.presence import MemoryPresence, RedisPresence
from baghchal_server.realtime.ws import router as ws_router
from baghchal_server.security import PasswordHasher

log = structlog.get_logger(__name__)


def configure_logging(settings: Settings) -> None:
    renderer: structlog.typing.Processor = (
        structlog.processors.JSONRenderer()
        if settings.log_json
        else structlog.dev.ConsoleRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        cache_logger_on_first_use=True,
    )


def create_app(
    settings: Settings | None = None,
    *,
    mailer: Mailer | None = None,
    limiter: RateLimiter | None = None,
    clock: Callable[[], datetime] | None = None,
) -> FastAPI:
    settings = settings or Settings()
    configure_logging(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(settings.database_url, settings.database_pool_size)
        redis = Redis.from_url(settings.redis_url) if settings.redis_url else None
        hub = Hub(RedisBroker(redis) if redis else MemoryBroker())
        await hub.start()
        app.state.ctx = AppState(
            settings=settings,
            engine=engine,
            sessions=session_factory(engine),
            hasher=PasswordHasher(settings.max_concurrent_password_hashes),
            limiter=limiter or (RedisRateLimiter(redis) if redis else MemoryRateLimiter()),
            mailer=mailer or make_mailer(settings),
            clock=clock or (lambda: datetime.now(UTC)),
            redis=redis,
            hub=hub,
            presence=RedisPresence(redis) if redis else MemoryPresence(),
        )
        log.info("startup", environment=settings.environment)
        try:
            yield
        finally:
            await hub.stop()
            await engine.dispose()
            if redis is not None:
                await redis.aclose()

    public_docs = not settings.is_production
    app = FastAPI(
        title="Bagh Chal",
        lifespan=lifespan,
        docs_url="/docs" if public_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if public_docs else None,
    )
    install_handlers(app)
    app.include_router(accounts_router)
    app.include_router(lobby_router)
    app.include_router(ws_router)

    @app.get("/health/live", include_in_schema=False)
    async def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready", include_in_schema=False)
    async def ready(state: State) -> JSONResponse:
        checks: dict[str, str] = {}
        try:
            async with state.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            checks["database"] = "ok"
        except Exception:
            log.exception("health.database")
            checks["database"] = "failing"
        if state.redis is not None:
            try:
                await state.redis.ping()
                checks["redis"] = "ok"
            except Exception:
                log.exception("health.redis")
                checks["redis"] = "failing"
        healthy = all(v == "ok" for v in checks.values())
        return JSONResponse(
            {"status": "ok" if healthy else "failing", **checks}, 200 if healthy else 503
        )

    # Added innermost first: requests pass RequestContext → … → BodyLimit → routes.
    app.add_middleware(BodyLimit, max_bytes=settings.max_request_bytes)
    app.add_middleware(CrossSiteGuard, allowed_origins=settings.allowed_origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["authorization", "content-type", "x-request-id"],
        max_age=600,
    )
    app.add_middleware(SecurityHeaders, hsts=settings.is_production)
    app.add_middleware(RequestContext)
    return app
