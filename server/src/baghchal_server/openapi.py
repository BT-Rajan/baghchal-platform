"""Export the API schema, so the app's TypeScript types are generated from the server's.

    uv run python -m baghchal_server.openapi ../app/src/api/openapi.json

Besides the HTTP API, the schema carries the WebSocket messages the server sends (see
docs/realtime.md) under ``components.schemas``, so the app gets types for those too.
"""

import json
import sys
from pathlib import Path
from typing import Any

from pydantic.json_schema import models_json_schema

from baghchal_server.app import create_app
from baghchal_server.config import Settings
from baghchal_server.realtime.protocol import (
    ChallengeEvent,
    ErrorEvent,
    GameEvent,
    Hello,
    Pong,
    Probe,
)

SERVER_MESSAGES = (Hello, Pong, Probe, ChallengeEvent, GameEvent, ErrorEvent)


def schema() -> dict[str, Any]:
    api = create_app(Settings(environment="test")).openapi()
    components: dict[str, Any] = api.setdefault("components", {}).setdefault("schemas", {})
    _, extra = models_json_schema(
        [(m, "serialization") for m in SERVER_MESSAGES],
        ref_template="#/components/schemas/{model}",
    )
    for name, definition in extra["$defs"].items():
        if _shape(components.setdefault(name, definition)) != _shape(definition):
            raise ValueError(f"schema {name!r} differs between the HTTP API and the WebSocket")
    return api


def _shape(node: Any) -> Any:
    """A schema without ``default`` annotations, which FastAPI leaves out of response models."""
    if isinstance(node, dict):
        return {k: _shape(v) for k, v in node.items() if k != "default"}
    if isinstance(node, list):
        return [_shape(v) for v in node]
    return node


def render() -> str:
    return json.dumps(schema(), indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> None:
    if len(argv) != 1:
        raise SystemExit("usage: python -m baghchal_server.openapi OUTPUT.json")
    Path(argv[0]).write_text(render(), encoding="utf-8")


if __name__ == "__main__":  # pragma: no cover
    main(sys.argv[1:])
