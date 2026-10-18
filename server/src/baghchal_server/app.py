"""Application factory."""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Final

import sentry_sdk
import structlog
from fastapi import FastAPI
from redis.asyncio import BlockingConnectionPool, Redis
from starlette.middleware.cors import CORSMiddleware

from baghchal_server.accounts.routes import router as accounts_router
from baghchal_server.billing import models as _billing_models  # noqa: F401  (registers tables)
from baghchal_server.billing.routes import router as billing_router
from baghchal_server.config import Settings
from baghchal_server.db import create_engine, session_factory
from baghchal_server.deps import AppState
from baghchal_server.errors import install_handlers
from baghchal_server.games import models as _game_models  # noqa: F401  (registers tables)
from baghchal_server.games.computer import ComputerPlayers
from baghchal_server.games.routes import router as games_router
from baghchal_server.games.sweeper import run as run_sweeper
from baghchal_server.health import router as health_router
from baghchal_server.lobby import models as _lobby_models  # noqa: F401  (registers tables)
from baghchal_server.lobby.routes import router as lobby_router
from baghchal_server.mail import Mailer, make_mailer
from baghchal_server.metrics import CountingMailer, Metrics
from baghchal_server.middleware import BodyLimit, CrossSiteGuard, RequestContext, SecurityHeaders
from baghchal_server.moderation import models as _moderation_models  # noqa: F401  (registers tables)
from baghchal_server.moderation.routes import router as moderation_router
from baghchal_server.ratelimit import MemoryRateLimiter, RateLimiter, RedisRateLimiter
from baghchal_server.ratings import models as _rating_models  # noqa: F401  (registers tables)
from baghchal_server.ratings.routes import router as ratings_router
from baghchal_server.realtime.hub import Hub, MemoryBroker, RedisBroker
from baghchal_server.realtime.presence import MemoryPresence, RedisPresence
from baghchal_server.realtime.ws import router as ws_router
from baghchal_server.security import PasswordHasher

log = structlog.get_logger(__name__)

REDIS_WAIT_SECONDS: Final = 5


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


def configure_error_tracking(settings: Settings) -> None:
    """Report unexpected errors to Sentry when a DSN is set. No personal data is sent: no
    IP addresses, cookies, headers or request bodies."""
    if settings.sentry_dsn is None:
        return
    sentry_sdk.init(
        dsn=settings.sentry_dsn.get_secret_value(),
        environment=settings.environment,
        send_default_pii=False,
        max_request_body_size="never",
        traces_sample_rate=settings.sentry_traces_sample_rate,
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
    configure_error_tracking(settings)
    metrics = Metrics()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(settings.database_url, settings.database_pool_size)
        redis = (
            # from_pool: the client owns the pool, so closing it closes every connection.
            Redis.from_pool(
                BlockingConnectionPool.from_url(
                    settings.redis_url,
                    max_connections=settings.redis_max_connections,
                    timeout=REDIS_WAIT_SECONDS,
                )
            )
            if settings.redis_url
            else None
        )
        hub = Hub(RedisBroker(redis) if redis else MemoryBroker())
        await hub.start()
        app.state.ctx = AppState(
            settings=settings,
            engine=engine,
            sessions=session_factory(engine),
            hasher=PasswordHasher(settings.max_concurrent_password_hashes),
            limiter=limiter or (RedisRateLimiter(redis) if redis else MemoryRateLimiter()),
            mailer=CountingMailer(mailer or make_mailer(settings), metrics),
            clock=clock or (lambda: datetime.now(UTC)),
            redis=redis,
            hub=hub,
            presence=RedisPresence(redis) if redis else MemoryPresence(),
            metrics=metrics,
            computer=ComputerPlayers(settings.computer_workers),
        )
        sweeper = asyncio.create_task(run_sweeper(app.state.ctx)) if settings.game_sweeper else None
        log.info("startup", environment=settings.environment)
        try:
            yield
        finally:
            if sweeper is not None:
                sweeper.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await sweeper
            await app.state.ctx.computer.stop()
            await hub.stop()
            await engine.dispose()
            if redis is not None:
                await redis.aclose()

    public_docs = not settings.is_production
    app = FastAPI(
        title="ClawPlay",
        lifespan=lifespan,
        docs_url="/docs" if public_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if public_docs else None,
    )
    install_handlers(app)
    app.include_router(accounts_router)
    app.include_router(lobby_router)
    app.include_router(games_router)
    app.include_router(ratings_router)
    app.include_router(moderation_router)
    app.include_router(billing_router)
    app.include_router(health_router)
    app.include_router(ws_router)

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
    app.add_middleware(RequestContext, metrics=metrics)
    return app
