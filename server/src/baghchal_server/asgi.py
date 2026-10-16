"""ASGI entry point: ``uvicorn baghchal_server.asgi:app``. Settings come from the environment."""

from baghchal_server.app import create_app

app = create_app()
