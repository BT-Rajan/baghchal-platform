"""Sign in with Google: the ID token is checked against Google's keys, and the account is found
by its Google id or verified address, or made."""

import base64
import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15
from cryptography.hazmat.primitives.hashes import SHA256
from fastapi import FastAPI
from sqlalchemy import select, update

from baghchal_server.accounts.google import GoogleKeys
from baghchal_server.accounts.models import User
from baghchal_server.config import GoogleClientIds, Settings
from baghchal_server.deps import AppState

from .conftest import AGREE, PASSWORD, Clock, sign_up

GOOGLE = "/api/v1/auth/google"
PROVIDERS = "/api/v1/auth/providers"
LOGIN = "/api/v1/auth/login"
ME = "/api/v1/me"
WEB_ID = "web-client.apps.googleusercontent.com"
ANDROID_ID = "android-client.apps.googleusercontent.com"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _jwk(key: rsa.RSAPrivateKey, kid: str) -> dict[str, str]:
    numbers = key.public_key().public_numbers()
    return {
        "kty": "RSA",
        "alg": "RS256",
        "use": "sig",
        "kid": kid,
        "n": _b64(numbers.n.to_bytes((numbers.n.bit_length() + 7) // 8, "big")),
        "e": _b64(numbers.e.to_bytes(3, "big")),
    }


@pytest.fixture
def settings(settings: Settings) -> Settings:
    return settings.model_copy(
        update={"google_client_ids": GoogleClientIds(web=WEB_ID, android=ANDROID_ID)}
    )


@pytest.fixture
def google_keys() -> GoogleKeys:
    async def fetch() -> tuple[dict[str, Any], int]:
        return {"keys": [_jwk(KEY, "k1")]}, 3600

    return GoogleKeys(fetch=fetch)


@pytest.fixture
async def http(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as c:
        yield c


def token(clock: Clock, *, key: rsa.RSAPrivateKey = KEY, kid: str = "k1", **claims: Any) -> str:
    now = int(clock().timestamp())
    body = {
        "iss": "https://accounts.google.com",
        "aud": WEB_ID,
        "azp": ANDROID_ID,
        "sub": "1234567890",
        "email": "Ann.Lee@example.com",
        "email_verified": True,
        "iat": now,
        "exp": now + 3600,
        **claims,
    }
    header = _b64(json.dumps({"alg": "RS256", "kid": kid, "typ": "JWT"}).encode())
    payload = _b64(json.dumps({k: v for k, v in body.items() if v is not None}).encode())
    signature = key.sign(f"{header}.{payload}".encode(), PKCS1v15(), SHA256())
    return f"{header}.{payload}.{_b64(signature)}"


async def google(http: httpx.AsyncClient, id_token: str) -> httpx.Response:
    return await http.post(GOOGLE, json={**AGREE, "id_token": id_token, "transport": "bearer"})


async def _users(app: FastAPI) -> list[User]:
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        return list(await db.scalars(select(User).order_by(User.created_at)))


async def test_providers(http: httpx.AsyncClient) -> None:
    r = await http.get(PROVIDERS)
    assert r.json() == {
        "google": True,
        "google_client_ids": {"web": WEB_ID, "android": ANDROID_ID, "ios": None},
    }


async def test_a_new_account(http: httpx.AsyncClient, clock: Clock, app: FastAPI) -> None:
    r = await google(http, token(clock))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["username"] == "AnnLee"
    assert body["user"]["email"] == "Ann.Lee@example.com"
    assert body["user"]["consents_needed"] == []
    auth = {"authorization": f"Bearer {body['token']}"}
    assert (await http.get(ME, headers=auth)).status_code == 200
    (user,) = await _users(app)
    assert (user.google_subject, user.email_verified_at) == ("1234567890", clock())
    assert user.password_hash.startswith("$argon2id$")
    # The second time, the same account; and a name in use gets a number.
    r = await google(http, token(clock, email="ann.lee@example.com"))
    assert r.json()["user"]["id"] == body["user"]["id"]
    r = await google(http, token(clock, sub="999", email="annlee@elsewhere.example"))
    assert r.json()["user"]["username"].lower().startswith("annlee")
    assert r.json()["user"]["username"] != "AnnLee"


async def test_a_web_sign_in_sets_the_cookie(http: httpx.AsyncClient, clock: Clock) -> None:
    r = await http.post(
        GOOGLE,
        json={**AGREE, "id_token": token(clock, aud=ANDROID_ID)},
        headers={"origin": "http://localhost:8081"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["token"] is None
    assert "HttpOnly" in r.headers["set-cookie"]


async def test_an_existing_account_is_linked(
    client: httpx.AsyncClient, http: httpx.AsyncClient, mailer: Any, clock: Clock, app: FastAPI
) -> None:
    await sign_up(client, mailer, "ann", "ann.lee@example.com")
    r = await google(http, token(clock))
    assert (r.status_code, r.json()["user"]["username"]) == (200, "ann")
    (user,) = await _users(app)
    assert user.google_subject == "1234567890"
    # The password still works too.
    r = await http.post(LOGIN, json={"login": "ann", "password": PASSWORD})
    assert r.status_code == 200


async def test_an_unconfirmed_account_is_taken_over(
    http: httpx.AsyncClient, clock: Clock, app: FastAPI
) -> None:
    """Someone signed up with Ann's address first; Ann signs in with Google: the account is
    hers, and the stranger's password and sessions stop working."""
    r = await http.post(
        "/api/v1/auth/register",
        json={
            **AGREE,
            "username": "mallory",
            "email": "ann.lee@example.com",
            "password": "mallory's password",
            "transport": "bearer",
        },
    )
    squatter = {"authorization": f"Bearer {r.json()['token']}"}
    r = await google(http, token(clock))
    assert r.status_code == 200, r.text
    assert (await http.get(ME, headers=squatter)).status_code == 401
    r = await http.post(LOGIN, json={"login": "mallory", "password": "mallory's password"})
    assert r.status_code == 401
    (user,) = await _users(app)
    assert user.email_verified_at is not None


@pytest.mark.parametrize(
    ("claims", "kwargs"),
    [
        ({"aud": "someone-else.apps.googleusercontent.com"}, {}),
        ({"aud": None}, {}),
        ({"iss": "https://evil.example"}, {}),
        ({"exp": 0}, {}),
        ({"sub": None}, {}),
        ({}, {"key": OTHER_KEY}),
        ({}, {"kid": "unknown"}),
    ],
    ids=["audience", "no-audience", "issuer", "expired", "no-subject", "signature", "kid"],
)
async def test_bad_tokens_are_refused(
    http: httpx.AsyncClient,
    clock: Clock,
    app: FastAPI,
    claims: dict[str, Any],
    kwargs: dict[str, Any],
) -> None:
    r = await google(http, token(clock, **kwargs, **claims))
    assert (r.status_code, r.json()["error"]["code"]) == (401, "invalid_google_token")
    assert await _users(app) == []


async def test_an_expired_token(http: httpx.AsyncClient, clock: Clock) -> None:
    id_token = token(clock)
    clock.advance(hours=1, minutes=2)
    r = await google(http, id_token)
    assert (r.status_code, r.json()["error"]["code"]) == (401, "invalid_google_token")


@pytest.mark.parametrize("garbage", ["x", "a.b.c", "....", "é.é.é"])
async def test_garbage_is_refused(http: httpx.AsyncClient, garbage: str) -> None:
    r = await google(http, garbage)
    assert (r.status_code, r.json()["error"]["code"]) == (401, "invalid_google_token")


async def test_a_tampered_token_is_refused(http: httpx.AsyncClient, clock: Clock) -> None:
    header, _, signature = token(clock).split(".")
    forged = _b64(json.dumps({"iss": "accounts.google.com", "aud": WEB_ID, "sub": "1"}).encode())
    r = await google(http, f"{header}.{forged}.{signature}")
    assert r.status_code == 401


async def test_an_unverified_email_never_links(
    client: httpx.AsyncClient, http: httpx.AsyncClient, mailer: Any, clock: Clock, app: FastAPI
) -> None:
    await sign_up(client, mailer, "ann", "ann.lee@example.com")
    for verified in (False, "false", None):
        r = await google(http, token(clock, email_verified=verified))
        assert (r.status_code, r.json()["error"]["code"]) == (403, "google_email_unverified")
    (user,) = await _users(app)
    assert user.google_subject is None


async def test_a_suspended_account_cannot_sign_in(
    http: httpx.AsyncClient, clock: Clock, app: FastAPI
) -> None:
    assert (await google(http, token(clock))).status_code == 200
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        await db.execute(update(User).values(is_active=False))
        await db.commit()
    r = await google(http, token(clock))
    assert (r.status_code, r.json()["error"]["code"]) == (403, "account_disabled")


async def test_failures_are_rate_limited(http: httpx.AsyncClient, clock: Clock) -> None:
    codes = [(await google(http, token(clock, aud="nope"))).status_code for _ in range(51)]
    assert codes[:50] == [401] * 50
    assert codes[50] == 429


async def test_keys_are_cached(app: FastAPI, http: httpx.AsyncClient, clock: Clock) -> None:
    state: AppState = app.state.ctx
    fetches = 0
    real = state.google_keys.fetch

    async def counting() -> tuple[dict[str, Any], int]:
        nonlocal fetches
        fetches += 1
        return await real()

    state.google_keys.fetch = counting
    for sub in ("1", "2", "3"):
        assert (await google(http, token(clock, sub=sub, email=f"p{sub}@x.example"))).is_success
    assert fetches == 1
    await google(http, token(clock, kid="new"))  # an unknown key, just after fetching: no
    assert fetches == 1
    state.google_keys._fetched -= 61  # a minute later
    await google(http, token(clock, kid="new"))  # fetched again, then not for a minute
    await google(http, token(clock, kid="new"))
    assert fetches == 2


async def test_off_without_client_ids(settings: Settings) -> None:
    from baghchal_server.app import create_app  # noqa: PLC0415 - an app of its own

    app = create_app(settings.model_copy(update={"google_client_ids": GoogleClientIds()}))
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as http,
    ):
        assert (await http.get(PROVIDERS)).json() == {"google": False, "google_client_ids": None}
        r = await http.post(GOOGLE, json={**AGREE, "id_token": "x.y.z"})
        assert (r.status_code, r.json()["error"]["code"]) == (404, "google_off")
