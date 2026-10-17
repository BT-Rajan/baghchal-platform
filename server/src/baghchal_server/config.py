"""Settings, read from ``BAGHCHAL_*`` environment variables.

Production refuses to start with unsafe or missing settings instead of falling back to
defaults: the defaults below are only fit for local development.
"""

from datetime import timedelta
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BAGHCHAL_", extra="forbid", frozen=True)

    environment: Literal["development", "test", "production"] = "development"

    database_url: str = "sqlite+aiosqlite:///./baghchal.db"
    database_pool_size: int = Field(default=10, ge=1, le=200)
    redis_url: str | None = None

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
    mail_from: str = "Bagh Chal <no-reply@localhost>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_starttls: bool = True

    blocked_username_words: tuple[str, ...] = ()
    """Usernames containing any of these (ignoring case, digits, ``_`` and ``-``) are refused,
    e.g. ``BAGHCHAL_BLOCKED_USERNAME_WORDS='["slur1", "slur2"]'``. Moderators can rename
    anything the list misses."""

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
        if problems:
            raise ValueError("unsafe production settings: " + "; ".join(problems))
        return self
