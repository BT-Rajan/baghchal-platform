"""Errors returned to clients, always as ``{"error": {"code": ..., "message": ...}}``."""

from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from baghchal_server import i18n

log = structlog.get_logger(__name__)


class AppError(Exception):
    """An error for the client. ``message`` is English, and a template: its ``{names}`` are
    filled from ``params``, so the reply can be translated whole (``i18n``) into the
    language the app asks for."""

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        headers: dict[str, str] | None = None,
        **params: object,
    ) -> None:
        self.template = message
        self.params = params
        self.message = message.format(**params) if params else message
        super().__init__(self.message)
        self.status = status
        self.code = code
        self.headers = headers


def error_body(code: str, message: str, **extra: Any) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, **extra}}


def _in(request: Request, message: str, **params: object) -> str:
    """``message`` in the language the request asks for."""
    return i18n.translate(message, params, i18n.pick(request.headers.get("accept-language")))


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        message = _in(request, exc.template, **exc.params)
        return JSONResponse(error_body(exc.code, message), exc.status, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Report where and why, never the submitted values (they may be passwords).
        fields = [
            {"field": ".".join(str(p) for p in e["loc"][1:]), "problem": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(
            error_body("invalid_request", _in(request, "Invalid request."), fields=fields), 422
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(error_body(code, _in(request, str(exc.detail))), exc.status_code)

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        log.exception("request.unhandled", exc_info=exc)
        return JSONResponse(
            error_body("internal_error", _in(request, "Something went wrong.")), 500
        )
