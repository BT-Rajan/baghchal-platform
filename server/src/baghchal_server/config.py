"""Settings, read from ``BAGHCHAL_*`` environment variables.

Production refuses to start with unsafe or missing settings instead of falling back to
defaults: the defaults below are only fit for local development.
"""

import re
from datetime import timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LEGAL_DETAILS = (
    "operator_name",
    "operator_address",
    "contact_email",
    "grievance_officer",
    "grievance_email",
    "jurisdiction_city",
    "hosting_provider",
    "hosting_location",
    "email_provider",
)
"""Settings the privacy policy and terms quote (see legal/texts)."""

_FINGERPRINT = re.compile(r"[0-9A-F]{2}(?::[0-9A-F]{2}){31}")


class GoogleClientIds(BaseModel):
    """The OAuth client ids made for ClawPlay in Google Cloud, one per kind of app. They are
    public (the apps carry them); an empty one is not used."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    web: str = ""
    android: str = ""
    ios: str = ""

    @property
    def audiences(self) -> frozenset[str]:
        """The ids a Google ID token may be issued to."""
        return frozenset(i for i in (self.web, self.android, self.ios) if i)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BAGHCHAL_", extra="forbid", frozen=True)

    environment: Literal["development", "test", "production"] = "development"

    database_url: str = "sqlite+aiosqlite:///./baghchal.db"
    database_pool_size: int = Field(default=10, ge=1, le=200)
    redis_url: str | None = None
    redis_max_connections: int = Field(default=100, ge=4, le=10_000)
    """Connections to Redis per server process. When all are busy a command waits for one
    (up to 5 seconds) instead of failing."""

    public_base_url: str = "http://localhost:8081"
    """Where the app is served; used to build links in emails."""
    allowed_origins: tuple[str, ...] = ("http://localhost:8081",)
    """Browser origins allowed to call the API (CORS and the cross-site request check)."""

    session_ttl: timedelta = timedelta(days=30)
    verify_email_ttl: timedelta = timedelta(hours=24)
    password_reset_ttl: timedelta = timedelta(hours=1)

    max_request_bytes: int = Field(default=16 * 1024, ge=1024)
    max_concurrent_password_hashes: int = Field(default=4, ge=1, le=64)
    """Argon2id uses 64 MiB per hash; this caps memory and CPU spent on hashing at once."""

    mail_backend: Literal["console", "memory", "smtp"] = "console"
    mail_from: str = "ClawPlay <no-reply@localhost>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_starttls: bool = True

    # Who runs the service, for the privacy policy and terms (legal/texts). Unset values show
    # as [PLACEHOLDERS] in development; production refuses to start without them.
    operator_name: str = ""
    """The company's registered name."""
    operator_address: str = ""
    contact_email: str = ""
    grievance_officer: str = ""
    """Name of the Grievance Officer (India's IT Rules and DPDP Act)."""
    grievance_email: str = ""
    jurisdiction_city: str = ""
    """The city whose courts hear disputes (terms of service)."""
    hosting_provider: str = ""
    hosting_location: str = ""
    """Where the servers and backups are, e.g. "Mumbai, India"."""
    email_provider: str = ""

    blocked_username_words: tuple[str, ...] = ()
    """Usernames containing any of these (ignoring case, digits, ``_`` and ``-``) are refused,
    e.g. ``BAGHCHAL_BLOCKED_USERNAME_WORDS='["slur1", "slur2"]'``. Moderators can rename
    anything the list misses."""

    computer_workers: int = Field(default=2, ge=0, le=64)
    """Processes per server that think for the computer opponent. 0 thinks in a thread instead
    (fine for development and tests)."""

    fair_play_workers: int = Field(default=1, ge=0, le=16)
    """Processes per server for fair-play reviews of finished rated games (separate from the
    computer opponent's). 0 reviews in a thread instead."""
    fair_play_checks: bool = True
    """Check finished rated games in the background (tests drive the checks by hand)."""

    housekeeping: bool = True
    """Delete data past the time the privacy policy keeps it, hourly (tests run it by hand)."""

    game_sweeper: bool = True
    """End games whose clock ran out in the background (tests drive it by hand)."""

    log_json: bool = False

    metrics_token: SecretStr | None = None
    """When set, ``GET /metrics`` serves Prometheus metrics to requests that send
    ``Authorization: Bearer <token>``; when unset, ``/metrics`` does not exist."""
    sentry_dsn: SecretStr | None = None
    """When set, unexpected errors are reported to Sentry (or a compatible service, such as
    GlitchTip), without personal data."""
    sentry_traces_sample_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    """Share of requests traced for performance; 0 sends errors only."""

    log_mail_bodies: bool = True
    """With mail_backend ``console``: log whole emails (their links let anyone who reads the
    log sign in as the player). For a developer's machine; servers set it false."""
    secrets_key: SecretStr = SecretStr("")
    """Encrypts the secrets kept in the database: the Razorpay keys an admin enters on the
    payments page (they are not set here). Any long random string, e.g. from
    ``python -c "import secrets; print(secrets.token_urlsafe(32))"``. Keep it safe; if it
    changes, the keys must be entered again."""

    android_cert_sha256: tuple[str, ...] = ()
    """SHA-256 fingerprints of the keys the Android app is signed with, e.g.
    ``BAGHCHAL_ANDROID_CERT_SHA256='["FA:C6:…:9C"]'``. Served in
    ``/.well-known/assetlinks.json``, so links to this site open in the app; empty, they open
    in the browser. See docs/operations.md, "Links that open the Android app"."""

    google_client_ids: GoogleClientIds = GoogleClientIds()
    """Sign in with Google: the OAuth client ids, e.g.
    ``BAGHCHAL_GOOGLE_CLIENT_IDS='{"web": "…apps.googleusercontent.com", "android": "…"}'``.
    All empty (the default), the Google button is not offered. See docs/operations.md, "Sign
    in with Google"."""

    @field_validator("android_cert_sha256")
    @classmethod
    def _fingerprints(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        normalised = tuple(f.strip().upper() for f in value)
        for fingerprint in normalised:
            if not _FINGERPRINT.fullmatch(fingerprint):
                raise ValueError(
                    "android_cert_sha256 takes SHA-256 fingerprints: 32 hex pairs joined by ':'"
                )
        return normalised

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def session_cookie_name(self) -> str:
        # The __Host- prefix makes browsers insist on Secure, Path=/ and no Domain.
        return "__Host-session" if self.is_production else "session"

    @model_validator(mode="after")
    def _check_production(self) -> "Settings":
        if not self.is_production:
            return self
        problems = []
        if self.database_url.startswith("sqlite"):
            problems.append("database_url must be a server database, not SQLite")
        if not self.redis_url:
            problems.append("redis_url is required")
        if self.mail_backend != "smtp" or not self.smtp_host:
            problems.append("mail_backend must be 'smtp' with smtp_host set")
        if not self.public_base_url.startswith("https://"):
            problems.append("public_base_url must use https")
        if not self.allowed_origins or any(
            not o.startswith("https://") for o in self.allowed_origins
        ):
            problems.append("allowed_origins must be https origins")
        missing = [name for name in LEGAL_DETAILS if not getattr(self, name).strip()]
        if missing:
            problems.append(f"the privacy policy and terms need {', '.join(missing)}")
        if problems:
            raise ValueError("unsafe production settings: " + "; ".join(problems))
        return self
