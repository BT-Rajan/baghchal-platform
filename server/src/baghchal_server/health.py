"""Liveness and readiness probes."""

import structlog
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from baghchal_server.deps import State

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
