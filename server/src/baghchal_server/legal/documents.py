"""The privacy policy and the terms of service: their texts and current versions.

The texts live in ``texts/`` as Markdown, with ``[[setting]]`` where the operator's details go
(see ``config.LEGAL_DETAILS``). Changing a text means changing its version below: players are
then asked to accept the new one, and the version they accepted is recorded (``consents``).
"""

import re
from enum import StrEnum
from functools import cache
from importlib.resources import files
from typing import Final

from baghchal_server.config import LEGAL_DETAILS, Settings


class Document(StrEnum):
    TERMS = "terms"
    PRIVACY = "privacy"


VERSIONS: Final = {Document.TERMS: "2026-10-20", Document.PRIVACY: "2026-10-20"}
"""The current version of each document: the date it takes effect."""

_FIELD = re.compile(r"\[\[([a-z_]+)\]\]")


@cache
def _source(document: Document) -> str:
    return (files(__package__) / "texts" / f"{document}.md").read_text(encoding="utf-8")


def render(document: Document, settings: Settings) -> str:
    """The document's text with the operator's details filled in. Details not set yet show as
    ``[OPERATOR NAME]``-style placeholders (production refuses to start without them)."""

    def detail(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in LEGAL_DETAILS:
            raise KeyError(f"{document}.md asks for an unknown detail: {name}")
        value: str = getattr(settings, name).strip()
        return value or f"[{name.replace('_', ' ').upper()}]"

    return _FIELD.sub(detail, _source(document))
