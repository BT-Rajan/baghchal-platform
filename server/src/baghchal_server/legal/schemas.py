from pydantic import BaseModel

from baghchal_server.accounts.schemas import LegalVersion, Strict
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
    """Accepting the current documents again, after they changed."""

    terms_version: LegalVersion
    privacy_version: LegalVersion
