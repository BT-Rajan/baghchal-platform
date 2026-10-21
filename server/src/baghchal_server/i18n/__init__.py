"""Error messages in the player's language.

Every message is written in English as a template (``AppError``); each catalog here
(``<language>.json``) maps an English template to the same template in that language, with
the same ``{names}``. The app asks for its language with ``Accept-Language``; a message
with no translation yet stays in English. Values put into a template (a username, a
number) are never read as templates, and a value that is itself a catalog entry (the
name of a feature) is translated too.

The translations are drafts until a native speaker has reviewed them.
"""

import json
import string
from functools import cache
from pathlib import Path
from typing import Final

LANGUAGES: Final = ("ta", "hi", "ar")
"""Languages with a catalog, besides English."""

EXTRA: Final = (
    "Invalid request.",
    "Something went wrong.",
    "Not Found",
    "Method Not Allowed",
    "Request origin not allowed.",
    "Request origin missing.",
    "Request body too large.",
    "A choice of boards, pieces and sounds",
    "The trainer",
    "A tournament",
    "Game analysis",
    "The Hard computer",
)
"""Messages, and values put into them, that are not written as ``AppError(...)``."""

_HERE: Final = Path(__file__).parent


@cache
def catalog(language: str) -> dict[str, str]:
    return dict(json.loads((_HERE / f"{language}.json").read_text(encoding="utf-8")))


def names(template: str) -> set[str]:
    """The ``{names}`` a template fills in."""
    return {field for _, field, _, _ in string.Formatter().parse(template) if field is not None}


def pick(accept_language: str | None) -> str | None:
    """The language to answer in, from an ``Accept-Language`` header: the most wanted one
    with a catalog, or None for English (also when English is wanted more)."""
    best: tuple[float, int, str] | None = None
    for i, part in enumerate((accept_language or "").split(",")[:20]):  # a short header
        tag, _, weight = part.partition(";")
        language = tag.strip().lower().partition("-")[0]
        if language not in LANGUAGES and language != "en":
            continue
        weight = weight.strip()
        try:
            q = float(weight[2:]) if weight.startswith("q=") else 1.0
        except ValueError:
            continue
        if q > 0 and (best is None or (q, -i) > best[:2]):
            best = (q, -i, language)  # the first listed wins a tie
    return None if best is None or best[2] == "en" else best[2]


def translate(template: str, params: dict[str, object], language: str | None) -> str:
    """The message in ``language`` (None: English)."""
    found = catalog(language) if language else {}
    values = {k: found.get(v, v) if isinstance(v, str) else v for k, v in params.items()}
    text = found.get(template, template)
    return text.format(**values) if params else text
