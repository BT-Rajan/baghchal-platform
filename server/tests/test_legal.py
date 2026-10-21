"""The terms and privacy policy, and accepting them. Nothing about age is asked or kept:
the terms say who may play, and pressing Accept is the player saying so."""

import uuid

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import delete, select

from baghchal_server.accounts.models import User
from baghchal_server.config import Settings
from baghchal_server.deps import AppState
from baghchal_server.legal import documents
from baghchal_server.legal.documents import VERSIONS, Document, render
from baghchal_server.legal.models import Consent

from .conftest import AGREE, PASSWORD, PlayerFactory


def _state(app: FastAPI) -> AppState:
    state: AppState = app.state.ctx
    return state


# ── Documents ─────────────────────────────────────────────────────────────


async def test_the_documents_are_public_and_versioned(
    client: httpx.AsyncClient, settings: Settings
) -> None:
    r = await client.get("/api/v1/legal")
    assert r.json() == {"terms": VERSIONS[Document.TERMS], "privacy": VERSIONS[Document.PRIVACY]}
    r = await client.get("/api/v1/legal/privacy")
    body = r.json()
    assert (body["document"], body["version"]) == ("privacy", VERSIONS[Document.PRIVACY])
    assert body["text"].startswith("# Privacy policy")
    assert "[OPERATOR NAME]" in body["text"]  # not set in development
    assert "[[" not in body["text"]
    assert (await client.get("/api/v1/legal/cookies")).status_code == 422

    filled = settings.model_copy(update={"operator_name": "ClawPlay Games Pvt Ltd"})
    assert "run by ClawPlay Games Pvt Ltd," in render(Document.PRIVACY, filled)
    assert "Grievance Officer: [GRIEVANCE OFFICER]" in render(Document.TERMS, settings)


def test_an_unknown_detail_in_a_text_is_an_error(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(documents, "_source", lambda d: "Hello [[favourite_colour]]")
    with pytest.raises(KeyError, match="favourite_colour"):
        render(Document.TERMS, settings)


def test_the_terms_say_who_may_play(settings: Settings) -> None:
    terms = render(Document.TERMS, settings)
    assert "at least 13 years old" in terms
    assert "parent's or guardian's permission" in terms
    assert "We do not ask your age or check it." in terms


# ── Accepting ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("changes", "status", "code"),
    [
        ({"terms_version": "2020-01-01"}, 409, "legal_outdated"),
        ({"privacy_version": "2020-01-01"}, 409, "legal_outdated"),
        ({"birth_month": "1990-01"}, 422, "invalid_request"),  # no longer asked
    ],
)
async def test_sign_up_accepts_the_current_documents(
    client: httpx.AsyncClient, changes: dict[str, str], status: int, code: str
) -> None:
    r = await client.post(
        "/api/v1/auth/register",
        json={
            **AGREE,
            "username": "newbie",
            "email": "newbie@example.com",
            "password": PASSWORD,
            **changes,
        },
    )
    assert (r.status_code, r.json()["error"]["code"]) == (status, code)


async def test_accepting_is_recorded_and_nothing_about_age_is_kept(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice = await players("alice")
    me = (await alice.http.get("/api/v1/me")).json()
    assert me["consents_needed"] == []
    assert not {"plays_people", "parent_consent", "age_needed"} & me.keys()
    async with _state(app).sessions() as db:
        rows = (await db.scalars(select(Consent).order_by(Consent.document))).all()
        assert [(r.document, r.version) for r in rows] == [
            ("privacy", VERSIONS[Document.PRIVACY]),
            ("terms", VERSIONS[Document.TERMS]),
        ]
        assert not hasattr(User, "adult_from")
    export = (await alice.http.get("/api/v1/me/export")).json()
    assert [c["document"] for c in export["consents"]] == ["privacy", "terms"]
    assert not {"adult_from", "parent_email", "parent_consented_at"} & export["account"].keys()


async def test_a_guest_accepts_and_plays_people_at_once(app: FastAPI) -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as http:
        r = await http.post("/api/v1/auth/guest", json={**AGREE, "transport": "bearer"})
        assert r.status_code == 200, r.text
        http.headers["authorization"] = f"Bearer {r.json()['token']}"
        r = await http.post("/api/v1/seeks", json={"time_control": "5+3"})
        assert r.status_code == 200, r.text


async def test_new_versions_are_asked_again(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice = await players("alice")
    monkeypatch.setitem(VERSIONS, Document.TERMS, "2027-01-01")
    assert (await alice.http.get("/api/v1/me")).json()["consents_needed"] == ["terms"]
    # Until she accepts, changes wait (reading still works); accepting or leaving does not.
    r = await alice.http.post("/api/v1/games/computer", json={"level": "easy"})
    assert (r.status_code, r.json()["error"]["code"]) == (403, "consents_needed")
    assert (await alice.http.get("/api/v1/me")).status_code == 200
    r = await alice.http.post("/api/v1/me/consents", json=AGREE)
    assert r.json()["error"]["code"] == "legal_outdated"  # the old text
    r = await alice.http.post("/api/v1/me/consents", json={**AGREE, "terms_version": "2027-01-01"})
    assert r.json()["consents_needed"] == []
    r = await alice.http.post("/api/v1/games/computer", json={"level": "easy"})
    assert r.status_code == 201


async def test_an_account_that_never_accepted_is_asked(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice = await players("alice")
    async with _state(app).sessions() as db:
        await db.execute(delete(Consent).where(Consent.user_id == uuid.UUID(alice.id)))
        await db.commit()
    me = (await alice.http.get("/api/v1/me")).json()
    assert me["consents_needed"] == ["terms", "privacy"]
    r = await alice.http.post("/api/v1/me/consents", json={**AGREE, "birth_month": "1990-01"})
    assert r.status_code == 422  # only the versions
    assert (await alice.http.post("/api/v1/me/consents", json=AGREE)).json()[
        "consents_needed"
    ] == []
