from fastapi import APIRouter

from baghchal_server.accounts.routes import describe_me
from baghchal_server.accounts.schemas import MeOut
from baghchal_server.deps import DB, CurrentUser, State
from baghchal_server.legal import consents
from baghchal_server.legal.documents import VERSIONS, Document, render
from baghchal_server.legal.schemas import (
    ConsentsIn,
    DocumentOut,
    VersionsOut,
)

router = APIRouter(prefix="/api/v1")


@router.get("/legal")
async def versions() -> VersionsOut:
    """The current versions of the terms and the privacy policy (what sign-up must accept)."""
    return VersionsOut(terms=VERSIONS[Document.TERMS], privacy=VERSIONS[Document.PRIVACY])


@router.get("/legal/{document}")
async def document(document: Document, state: State) -> DocumentOut:
    """The terms or the privacy policy, for anyone to read."""
    return DocumentOut(
        document=document, version=VERSIONS[document], text=render(document, state.settings)
    )


@router.post("/me/consents")
async def accept(data: ConsentsIn, user: CurrentUser, state: State, db: DB) -> MeOut:
    """Accept the current terms and privacy policy (asked again after they change)."""
    consents.check_versions(data.terms_version, data.privacy_version)
    await consents.record(db, user.id, state.clock())
    await db.commit()
    return await describe_me(db, user)
