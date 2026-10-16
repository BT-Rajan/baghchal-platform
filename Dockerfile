# syntax=docker/dockerfile:1
# Production image for the API server. Build from the repository root:
#   docker build -t baghchal-server .

FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# Dependencies first, so code changes do not invalidate this layer.
COPY pyproject.toml uv.lock ./
COPY engine/pyproject.toml engine/
COPY server/pyproject.toml server/
RUN uv sync --locked --no-dev --package baghchal-server --no-install-workspace
COPY engine engine
COPY server server
RUN uv sync --locked --no-dev --package baghchal-server --no-editable

FROM python:3.13-slim
RUN useradd --system --uid 10001 --home-dir /app app
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY server/alembic.ini server/alembic.ini
COPY server/migrations server/migrations
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BAGHCHAL_LOG_JSON=true \
    FORWARDED_ALLOW_IPS=127.0.0.1
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=2)"]
# FORWARDED_ALLOW_IPS: set to your load balancer's address so client IPs (used for rate
# limits) come from X-Forwarded-For; never "*" unless only the proxy can reach the server.
CMD ["uvicorn", "baghchal_server.asgi:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-server-header"]
