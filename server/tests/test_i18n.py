"""Error messages in the app's language (``Accept-Language``)."""

import ast
from pathlib import Path

import pytest
from httpx import AsyncClient

from baghchal_server import i18n

from .conftest import PlayerFactory

SOURCE = Path(i18n.__file__).parent.parent


def _strings(node: ast.expr) -> list[str]:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node.value]
    if isinstance(node, ast.IfExp):
        return _strings(node.body) + _strings(node.orelse)
    if isinstance(node, ast.Dict):
        return [s for v in node.values if v is not None for s in _strings(v)]
    if isinstance(node, ast.Subscript):  # a message picked from a table
        return _strings(node.value)
    return []


def english() -> set[str]:
    """Every message the server writes: each ``AppError``'s, the tables of messages it picks
    from (dicts whose values are sentences) and ``i18n.EXTRA``."""
    found = set(i18n.EXTRA)
    for path in SOURCE.rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "AppError":
                if len(node.args) >= 3:
                    found.update(_strings(node.args[2]))
            elif isinstance(node, ast.Assign | ast.AnnAssign) and isinstance(
                node.value, ast.Dict | ast.Subscript
            ):
                values = _strings(node.value)
                if values and all(v.endswith((".", "}")) and " " in v for v in values):
                    found.update(values)
    return found


def test_messages_are_found() -> None:
    found = english()
    assert "No such player." in found
    assert "You cannot cancel this challenge." in found  # from a table
    assert "This account has been banned. Reason: {reason}" in found


@pytest.mark.parametrize("language", i18n.LANGUAGES)
def test_every_message_is_translated(language: str) -> None:
    found = i18n.catalog(language)
    assert sorted(english() - found.keys()) == []
    assert sorted(found.keys() - english()) == []  # nothing left from a removed message
    for source, text in found.items():
        assert text.strip(), source
        assert i18n.names(text) == i18n.names(source), (language, source)


@pytest.mark.parametrize(
    ("header", "language"),
    [
        (None, None),
        ("", None),
        ("ta", "ta"),
        ("ta-IN,ta;q=0.9,en;q=0.8", "ta"),
        ("hi-IN", "hi"),
        ("ar-SA,ar;q=0.9", "ar"),
        ("en-GB,en;q=0.9,hi;q=0.8", None),
        ("fr-FR,hi;q=0.5", "hi"),
        ("fr, de", None),
        ("hi;q=0.5, ar;q=0.7", "ar"),
        ("hi, ar", "hi"),
        ("ta;q=0", None),
        ("ta;q=nonsense, hi", "hi"),
        ("*", None),
    ],
)
def test_pick(header: str | None, language: str | None) -> None:
    assert i18n.pick(header) == language


def test_translate() -> None:
    template = "{name} is not online."
    assert i18n.translate(template, {"name": "ravi"}, None) == "ravi is not online."
    tamil = i18n.translate(template, {"name": "ravi"}, "ta")
    assert "ravi" in tamil
    assert tamil != "ravi is not online."
    # A value is never read as a template.
    assert "{x}" in i18n.translate(template, {"name": "{x}"}, "hi")
    # A value that is a catalog entry is translated too.
    message = i18n.translate(
        "{what} comes with ClawPlay {plan}.", {"what": "The trainer", "plan": "Plus"}, "hi"
    )
    assert i18n.catalog("hi")["The trainer"] in message
    assert "Plus" in message
    assert i18n.translate("Not in any catalog.", {}, "ar") == "Not in any catalog."


async def test_errors_come_in_the_asked_language(
    client: AsyncClient, players: PlayerFactory
) -> None:
    alice = (await players("alice")).http
    english_reply = await alice.get("/api/v1/players/nobody-here")
    assert english_reply.json()["error"]["message"] == "No such player."
    tamil = await alice.get("/api/v1/players/nobody-here", headers={"Accept-Language": "ta"})
    assert tamil.status_code == 404
    assert tamil.json()["error"] == {
        "code": "player_not_found",
        "message": i18n.catalog("ta")["No such player."],
    }
    invalid = await client.post("/api/v1/auth/login", json={}, headers={"Accept-Language": "ar-EG"})
    assert invalid.json()["error"]["message"] == i18n.catalog("ar")["Invalid request."]
    missing = await client.get("/api/v1/no-such-route", headers={"Accept-Language": "hi"})
    assert missing.json()["error"]["message"] == i18n.catalog("hi")["Not Found"]


async def test_refusals_before_the_app_are_translated(client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/auth/login",
        json={},
        headers={"origin": "https://evil.example", "Accept-Language": "hi"},
    )
    assert r.status_code == 403
    assert r.json()["error"]["message"] == i18n.catalog("hi")["Request origin not allowed."]
