"""Liveness and readiness probes, and metrics for Prometheus."""

import hmac

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import func, select, text

from baghchal_server.deps import State
from baghchal_server.errors import AppError
from baghchal_server.games.models import ActiveGame

log = structlog.get_logger(__name__)
router = APIRouter(include_in_schema=False)


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
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


@router.get("/metrics")
async def metrics(request: Request, state: State) -> PlainTextResponse:
    """Disabled (404) unless ``BAGHCHAL_METRICS_TOKEN`` is set; then the scraper must send it."""
    token = state.settings.metrics_token
    if token is None:
        raise AppError(404, "not_found", "Not found.")
    sent = request.headers.get("authorization", "").encode()
    if not hmac.compare_digest(sent, f"Bearer {token.get_secret_value()}".encode()):
        raise AppError(401, "not_authenticated", "A metrics token is required.")
    async with state.sessions() as db:
        players = await db.scalar(select(func.count()).select_from(ActiveGame)) or 0
    state.metrics.live_games.set(players // 2)  # two players in each live game
    return PlainTextResponse(
        generate_latest(state.metrics.registry), media_type=CONTENT_TYPE_LATEST
    )
