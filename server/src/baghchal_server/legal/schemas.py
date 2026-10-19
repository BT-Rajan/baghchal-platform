from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from baghchal_server.accounts.schemas import Email, LegalVersion, Strict, Token
from baghchal_server.legal.age import BirthMonth
from baghchal_server.legal.documents import Document


class VersionsOut(BaseModel):
    """The current version (the date it took effect) of each document."""

    terms: str
    privacy: str


class DocumentOut(BaseModel):
    document: Document
    version: str
    text: str
    """Markdown: headings (#, ##), paragraphs, lists (-) and **bold**."""


class ConsentsIn(Strict):
    """Accepting the current documents again, after they changed; an account made before we
    asked for the month of birth gives it here too."""

    terms_version: LegalVersion
    privacy_version: LegalVersion
    birth_month: BirthMonth | None = None
    """Required when ``/me`` says ``age_needed``."""
    parent_email: Email | None = None
    """For a player under 18 whose parent has not agreed yet."""


class ParentLinkIn(Strict):
    token: Token


class ParentDecisionIn(ParentLinkIn):
    decision: Literal["agree", "refuse"]
    """``refuse`` also withdraws an earlier agreement: the account is deleted."""


class ParentLinkOut(BaseModel):
    username: str
    status: Literal["pending", "given", "deleted"]
    adult_from: datetime | None
    """When the player is surely 18: the agreement is needed until then."""
