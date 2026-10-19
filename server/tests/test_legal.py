"""The terms and privacy policy, consents, the age rules and a parent's agreement."""

import uuid
from contextlib import AsyncExitStack
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import delete, select, update

from baghchal_server.accounts.models import User
from baghchal_server.config import Settings
from baghchal_server.deps import AppState
from baghchal_server.errors import AppError
from baghchal_server.legal import age, documents
from baghchal_server.legal.documents import VERSIONS, Document, render
from baghchal_server.legal.models import Consent
from baghchal_server.mail import MemoryMailer

from .conftest import AGREE, PASSWORD, Clock, Player, PlayerFactory, last_token
from .test_games import _online

MINOR = "2010-06"
"""Surely 18 on 1 July 2028; the tests' clock starts on 1 January 2026."""


def _state(app: FastAPI) -> AppState:
    state: AppState = app.state.ctx
    return state


def _link(mailer: MemoryMailer, to: str) -> str:
    (mail,) = [m for m in mailer.outbox if m.to == to][-1:]
    assert "parent-consent?token=" in mail.body
    return mail.body.split("parent-consent?token=")[1].split()[0]


async def _minor(
    app: FastAPI, mailer: MemoryMailer, username: str = "kiran", parent: str = "mum@example.com"
) -> Player:
    """A 15-year-old who signed up and confirmed their email; their parent has been asked."""
    http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
    r = await http.post(
        "/api/v1/auth/register",
        json={
            **AGREE,
            "birth_month": MINOR,
            "username": username,
            "email": f"{username}@example.com",
            "password": PASSWORD,
            "parent_email": parent,
        },
    )
    assert r.status_code == 202, r.text
    assert not [m for m in mailer.outbox if m.to == parent]  # not before the email is confirmed
    r = await http.post(
        "/api/v1/auth/verify-email", json={"token": last_token(mailer), "transport": "bearer"}
    )
    assert r.status_code == 200, r.text
    me = r.json()["user"]
    assert (me["plays_people"], me["parent_consent"]) == (False, "pending")
    http.headers["authorization"] = f"Bearer {r.json()['token']}"
    return Player(me["id"], username, http)


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


# ── Age ───────────────────────────────────────────────────────────────────


def test_ages_count_the_youngest_the_month_could_mean() -> None:
    assert age.surely("2010-05", 18) == datetime(2028, 6, 1, tzinfo=UTC)
    assert age.surely("2010-12", 18) == datetime(2029, 1, 1, tzinfo=UTC)
    with pytest.raises(ValueError, match="YYYY-MM"):
        age.surely("May 2010", 18)
    now = datetime(2026, 1, 1, 12, tzinfo=UTC)
    assert age.adult_from("1990-01", now) is None
    assert age.adult_from("2012-12", now) == datetime(2031, 1, 1, tzinfo=UTC)  # just 13
    for month, code in (("2013-01", "too_young"), ("2026-02", "invalid_birth_month")):
        with pytest.raises(AppError) as info:
            age.adult_from(month, now)
        assert info.value.code == code
    with pytest.raises(AppError, match="month of birth"):
        age.adult_from("1890-01", now)


@pytest.mark.parametrize(
    ("changes", "status", "code"),
    [
        ({"terms_version": "2000-01-01"}, 409, "legal_outdated"),
        ({"birth_month": "2014-03"}, 403, "too_young"),
        ({"birth_month": "2099-01"}, 422, "invalid_birth_month"),
        ({"birth_month": "June 2010"}, 422, "invalid_request"),
        ({"birth_month": MINOR}, 422, "parent_email_required"),
        ({"birth_month": MINOR, "parent_email": "Kid@Example.com"}, 422, "parent_email_is_yours"),
    ],
)
async def test_sign_up_checks_age_and_the_documents(
    client: httpx.AsyncClient, changes: dict[str, str], status: int, code: str
) -> None:
    r = await client.post(
        "/api/v1/auth/register",
        json={
            **AGREE,
            "username": "kid",
            "email": "kid@example.com",
            "password": PASSWORD,
            **changes,
        },
    )
    assert (r.status_code, r.json()["error"]["code"]) == (status, code)


async def test_an_adult_signs_up_and_their_consent_is_recorded(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice = await players("alice")
    me = (await alice.http.get("/api/v1/me")).json()
    assert (me["plays_people"], me["parent_consent"], me["age_needed"]) == (True, None, False)
    assert me["consents_needed"] == []
    async with _state(app).sessions() as db:
        rows = (await db.scalars(select(Consent).order_by(Consent.document))).all()
        assert [(r.document, r.version) for r in rows] == [
            ("privacy", VERSIONS[Document.PRIVACY]),
            ("terms", VERSIONS[Document.TERMS]),
        ]
        user = await db.get(User, uuid.UUID(alice.id))
        assert user is not None
        assert (user.adult_from, user.age_checked_at) == (None, clock())
    export = (await alice.http.get("/api/v1/me/export")).json()
    assert [c["document"] for c in export["consents"]] == ["privacy", "terms"]
    assert export["account"]["adult_from"] is None


# ── Under 18: a parent's agreement ────────────────────────────────────────


async def test_until_a_parent_agrees_a_minor_plays_only_the_computer(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer
) -> None:
    kid = await _minor(app, mailer)
    alice = await players("alice")
    (asked,) = [m for m in mailer.outbox if m.to == "mum@example.com"]
    assert asked.subject == "kiran would like to play ClawPlay"
    assert "/privacy" in asked.body

    async with AsyncExitStack() as stack:
        await _online(app, stack, kid, alice)
        refused = [
            await kid.http.post(
                "/api/v1/challenges", json={"opponent": "alice", "time_control": "5+3"}
            ),
            await kid.http.post("/api/v1/seeks", json={"time_control": "5+3"}),
            await kid.http.post("/api/v1/friends/alice"),
            await kid.http.post(
                "/api/v1/tournaments", json={"name": "Mine", "time_control": "5+3"}
            ),
            await kid.http.post("/api/v1/challenges/link/ABCDEFGH/accept"),
        ]
        for r in refused:
            assert (r.status_code, r.json()["error"]["code"]) == (403, "parent_consent_needed")
        # Others cannot draw them in either.
        r = await alice.http.post(
            "/api/v1/challenges", json={"opponent": "kiran", "time_control": "5+3"}
        )
        assert (r.status_code, r.json()["error"]["code"]) == (403, "challenge_refused")
        r = await alice.http.post("/api/v1/friends/kiran")
        assert (r.status_code, r.json()["error"]["code"]) == (403, "friend_refused")
        # The computer is fine.
        r = await kid.http.post("/api/v1/games/computer", json={"level": "easy"})
        assert r.status_code == 201, r.text


async def test_a_parent_agrees_and_can_withdraw(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer, client: httpx.AsyncClient
) -> None:
    kid = await _minor(app, mailer)
    token = _link(mailer, "mum@example.com")
    r = await client.post("/api/v1/parent-consent/look-up", json={"token": token})
    assert r.json() == {
        "username": "kiran",
        "status": "pending",
        "adult_from": "2028-07-01T00:00:00Z",
    }
    r = await client.post("/api/v1/parent-consent", json={"token": token, "decision": "agree"})
    assert r.json()["status"] == "given"
    (thanks,) = [m for m in mailer.outbox if m.subject.startswith("Thank you")]
    assert token in thanks.body  # the same link withdraws
    me = (await kid.http.get("/api/v1/me")).json()
    assert (me["plays_people"], me["parent_consent"]) == (True, "given")
    # Agreeing again changes nothing and sends nothing.
    sent = len(mailer.outbox)
    r = await client.post("/api/v1/parent-consent", json={"token": token, "decision": "agree"})
    assert (r.json()["status"], len(mailer.outbox)) == ("given", sent)

    alice = await players("alice")
    async with AsyncExitStack() as stack:
        await _online(app, stack, kid, alice)
        r = await alice.http.post(
            "/api/v1/challenges", json={"opponent": "kiran", "time_control": "5+3"}
        )
        assert r.status_code == 201, r.text
        # Withdrawing deletes the account (and closes its challenges).
        r = await client.post("/api/v1/parent-consent", json={"token": token, "decision": "refuse"})
        assert r.json() == {"username": "kiran", "status": "deleted", "adult_from": None}
    assert mailer.outbox[-1].subject == "Your ClawPlay account was deleted"
    assert (await kid.http.get("/api/v1/me")).status_code == 401
    async with _state(app).sessions() as db:
        gone = await db.get(User, uuid.UUID(kid.id))
        assert gone is not None
        assert (gone.is_active, gone.parent_email) == (False, None)
    r = await client.post("/api/v1/parent-consent/look-up", json={"token": token})
    assert r.json()["error"]["code"] == "invalid_token"


async def test_a_parent_refuses(
    app: FastAPI, mailer: MemoryMailer, client: httpx.AsyncClient
) -> None:
    kid = await _minor(app, mailer)
    token = _link(mailer, "mum@example.com")
    await kid.http.post("/api/v1/games/computer", json={"level": "easy"})
    r = await client.post("/api/v1/parent-consent", json={"token": token, "decision": "refuse"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "game_in_progress")
    game = (await kid.http.get("/api/v1/games")).json()[0]
    await kid.http.post(f"/api/v1/games/{game['id']}/resign")
    r = await client.post("/api/v1/parent-consent", json={"token": token, "decision": "refuse"})
    assert r.json()["status"] == "deleted"


async def test_a_minor_is_free_at_18(app: FastAPI, mailer: MemoryMailer, clock: Clock) -> None:
    kid = await _minor(app, mailer)
    async with _state(app).sessions() as db:
        await db.execute(
            update(User)
            .where(User.id == uuid.UUID(kid.id))
            .values(adult_from=clock(), age_checked_at=clock())
        )
        await db.commit()
    assert (await kid.http.get("/api/v1/me")).json()["plays_people"] is True


async def test_a_guest_under_18_plays_the_computer_until_a_parent_agrees(
    app_client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    r = await app_client.post(
        "/api/v1/auth/guest", json={**AGREE, "birth_month": MINOR, "transport": "bearer"}
    )
    me = r.json()["user"]
    assert (me["role"], me["plays_people"], me["parent_consent"]) == ("guest", False, "pending")
    app_client.headers["authorization"] = f"Bearer {r.json()['token']}"
    r = await app_client.post("/api/v1/seeks", json={"time_control": "5+3"})
    assert r.json()["error"]["code"] == "parent_consent_needed"
    # The age the guest gave is kept: making the account asks only for a parent.
    claim = {**AGREE, "username": "Sita", "email": "sita@example.com"}
    del claim["birth_month"]
    r = await app_client.post("/api/v1/me/claim", json={**claim, "password": PASSWORD})
    assert r.json()["error"]["code"] == "parent_email_required"
    r = await app_client.post(
        "/api/v1/me/claim",
        json={**claim, "password": PASSWORD, "parent_email": "dad@example.com"},
    )
    assert r.status_code == 200, r.text
    assert {m.to for m in mailer.outbox} >= {"dad@example.com", "sita@example.com"}
    r = await app_client.post(
        "/api/v1/auth/guest", json={**AGREE, "birth_month": "2015-01", "transport": "bearer"}
    )
    assert r.json()["error"]["code"] == "too_young"


async def test_a_guest_who_gave_their_age_is_not_asked_again(
    app: FastAPI, app_client: httpx.AsyncClient
) -> None:
    async def guest() -> uuid.UUID:
        app_client.headers.pop("authorization", None)
        r = await app_client.post("/api/v1/auth/guest", json={**AGREE, "transport": "bearer"})
        app_client.headers["authorization"] = f"Bearer {r.json()['token']}"
        return uuid.UUID(r.json()["user"]["id"])

    claim = {k: v for k, v in AGREE.items() if k != "birth_month"}
    await guest()
    body = {**claim, "username": "Mira", "email": "mira@example.com", "password": PASSWORD}
    r = await app_client.post("/api/v1/me/claim", json=body)
    assert (r.status_code, r.json()["plays_people"]) == (200, True)
    guest_id = await guest()
    body = {**claim, "username": "Ravi", "email": "ravi@example.com", "password": PASSWORD}
    async with _state(app).sessions() as db:  # a guest from before the age was asked
        await db.execute(update(User).where(User.id == guest_id).values(age_checked_at=None))
        await db.commit()
    r = await app_client.post("/api/v1/me/claim", json=body)
    assert r.json()["error"]["code"] == "birth_month_required"
    r = await app_client.post("/api/v1/me/claim", json={**body, "birth_month": "1990-01"})
    assert r.status_code == 200, r.text
    assert r.json()["plays_people"] is True


# ── Accepting again ───────────────────────────────────────────────────────


async def test_older_accounts_and_new_versions_are_asked_again(
    app: FastAPI,
    players: PlayerFactory,
    mailer: MemoryMailer,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with _state(app).sessions() as db:  # accounts from before these questions
        await db.execute(
            update(User).values(age_checked_at=None, adult_from=None, parent_consent=None)
        )
        await db.execute(delete(Consent))
        await db.commit()
    me = (await alice.http.get("/api/v1/me")).json()
    assert (me["age_needed"], me["consents_needed"]) == (True, ["terms", "privacy"])

    versions: dict[str, Any] = {
        "terms_version": VERSIONS[Document.TERMS],
        "privacy_version": VERSIONS[Document.PRIVACY],
    }
    r = await alice.http.post("/api/v1/me/consents", json=versions)
    assert r.json()["error"]["code"] == "birth_month_required"
    r = await alice.http.post("/api/v1/me/consents", json={**versions, "birth_month": "1990-01"})
    me = r.json()
    assert (me["age_needed"], me["consents_needed"], me["plays_people"]) == (False, [], True)

    # Bob turns out to be 15: his parent is asked, and he waits for them.
    r = await bob.http.post(
        "/api/v1/me/consents",
        json={**versions, "birth_month": MINOR, "parent_email": "pa@example.com"},
    )
    assert (r.json()["plays_people"], r.json()["parent_consent"]) == (False, "pending")
    assert mailer.outbox[-1].to == "pa@example.com"

    # A new version of the terms: asked again, and old answers are refused.
    monkeypatch.setitem(VERSIONS, Document.TERMS, "2027-01-01")
    assert (await alice.http.get("/api/v1/me")).json()["consents_needed"] == ["terms"]
    r = await alice.http.post("/api/v1/me/consents", json=versions)
    assert r.json()["error"]["code"] == "legal_outdated"
    r = await alice.http.post(
        "/api/v1/me/consents", json={**versions, "terms_version": "2027-01-01"}
    )
    assert r.json()["consents_needed"] == []
