"""Pure ASGI middleware (no per-request object allocation beyond what each needs)."""

import json
import re
import time
import uuid
from collections.abc import Iterable
from typing import Final

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from baghchal_server import i18n
from baghchal_server.errors import error_body
from baghchal_server.metrics import Metrics

log = structlog.get_logger("baghchal.access")

_SAFE_METHODS: Final = frozenset({"GET", "HEAD", "OPTIONS"})
_REQUEST_ID_RE: Final = re.compile(rb"^[A-Za-z0-9-]{8,64}$")


def _header(scope: Scope, name: bytes) -> bytes | None:
    for key, value in scope["headers"]:
        if key == name:
            return bytes(value)
    return None


async def _reject(scope: Scope, send: Send, status: int, code: str, message: str) -> None:
    language = i18n.pick((_header(scope, b"accept-language") or b"").decode("latin-1"))
    body = json.dumps(error_body(code, i18n.translate(message, {}, language))).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class RequestContext:
    """Assigns a request id, binds it to every log line, writes one access log line, and
    counts the request in the metrics (by route template, so ids do not multiply series)."""

    def __init__(self, app: ASGIApp, metrics: Metrics) -> None:
        self.app = app
        self.metrics = metrics

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = _header(scope, b"x-request-id")
        request_id = (
            incoming.decode() if incoming and _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        )
        structlog.contextvars.bind_contextvars(request_id=request_id)
        start = time.perf_counter()
        status = 500

        async def send_with_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message.setdefault("headers", []).append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            seconds = time.perf_counter() - start
            route = getattr(scope.get("route"), "path", "unmatched")
            self.metrics.requests.labels(scope["method"], route, str(status)).inc()
            self.metrics.latency.labels(scope["method"], route).observe(seconds)
            log.info(
                "request",
                method=scope["method"],
                path=scope["path"],
                status=status,
                ms=round(seconds * 1000, 1),
            )
            structlog.contextvars.clear_contextvars()


class SecurityHeaders:
    def __init__(self, app: ASGIApp, hsts: bool) -> None:
        self.app = app
        self.headers: list[tuple[bytes, bytes]] = [
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            (b"referrer-policy", b"no-referrer"),
            (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
            (b"cache-control", b"no-store"),
        ]
        if hsts:
            self.headers.append(
                (b"strict-transport-security", b"max-age=63072000; includeSubDomains")
            )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                present = {k.lower() for k, _ in headers}
                headers.extend(h for h in self.headers if h[0] not in present)
            await send(message)

        await self.app(scope, receive, send_with_headers)


class CrossSiteGuard:
    """Blocks cross-site requests that would act with a browser's session cookie (CSRF).

    State-changing requests must either come from an allowed Origin, or carry no cookies at
    all (native apps authenticate with a bearer token, which browsers never send by themselves).
    """

    def __init__(self, app: ASGIApp, allowed_origins: Iterable[str]) -> None:
        self.app = app
        self.allowed = frozenset(o.encode() for o in allowed_origins)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] not in _SAFE_METHODS:
            origin = _header(scope, b"origin")
            if origin is not None:
                if origin not in self.allowed:
                    await _reject(
                        scope, send, 403, "forbidden_origin", "Request origin not allowed."
                    )
                    return
            elif _header(scope, b"cookie") is not None:
                await _reject(scope, send, 403, "forbidden_origin", "Request origin missing.")
                return
        await self.app(scope, receive, send)


class BodyLimit:
    """Rejects request bodies over ``max_bytes``, whether declared up front or streamed.

    API bodies are small, so the body is read fully here (at most ``max_bytes``) and handed to
    the application in one piece.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] in _SAFE_METHODS:
            await self.app(scope, receive, send)
            return
        declared = _header(scope, b"content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > self.max_bytes):
            await _reject(scope, send, 413, "body_too_large", "Request body too large.")
            return
        chunks: list[bytes] = []
        size = 0
        while True:
            message = await receive()
            if message["type"] != "http.request":  # client went away
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > self.max_bytes:
                await _reject(scope, send, 413, "body_too_large", "Request body too large.")
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
