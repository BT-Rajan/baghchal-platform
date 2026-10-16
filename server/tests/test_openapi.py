"""The app's committed API schema must match the server (the app generates its types from it)."""

from pathlib import Path
from typing import Any

import pytest
from pydantic.json_schema import models_json_schema

from baghchal_server import openapi

COMMITTED = Path(__file__).resolve().parents[2] / "app" / "src" / "api" / "openapi.json"


def test_committed_schema_is_current() -> None:
    assert COMMITTED.read_text(encoding="utf-8") == openapi.render(), (
        "app/src/api/openapi.json is stale. From server/, run:\n"
        "  uv run python -m baghchal_server.openapi ../app/src/api/openapi.json\n"
        "then, from app/: npm run api:generate"
    )


def test_schema_includes_websocket_messages() -> None:
    schemas = openapi.schema()["components"]["schemas"]
    assert {"Hello", "Pong", "ChallengeEvent", "GameEvent", "ErrorEvent"} <= schemas.keys()


def test_main_writes_the_schema(tmp_path: Path) -> None:
    out = tmp_path / "openapi.json"
    openapi.main([str(out)])
    assert out.read_text(encoding="utf-8") == openapi.render()


def test_main_needs_one_argument() -> None:
    with pytest.raises(SystemExit, match="usage"):
        openapi.main([])


def test_conflicting_websocket_schema_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    def conflicting(*args: Any, **kwargs: Any) -> Any:
        keys, defs = models_json_schema(*args, **kwargs)
        defs["$defs"]["PlayerOut"] = {"type": "string"}
        return keys, defs

    monkeypatch.setattr("baghchal_server.openapi.models_json_schema", conflicting)
    with pytest.raises(ValueError, match="PlayerOut"):
        openapi.schema()
