"""Outgoing email."""

from dataclasses import dataclass
from email.message import EmailMessage
from typing import Final, Protocol

import aiosmtplib
import structlog

from baghchal_server.config import Settings

log = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class Mail:
    to: str
    subject: str
    body: str


class Mailer(Protocol):
    async def send(self, mail: Mail) -> None: ...


class MemoryMailer:
    """Keeps sent mail in a list, for tests."""

    def __init__(self) -> None:
        self.outbox: list[Mail] = []

    async def send(self, mail: Mail) -> None:
        self.outbox.append(mail)


class ConsoleMailer:
    """Logs mail instead of sending it, for local development only (bodies contain tokens)."""

    async def send(self, mail: Mail) -> None:
        log.info("mail.console", to=mail.to, subject=mail.subject, body=mail.body)


SMTPS_PORT: Final = 465


class SmtpMailer:
    def __init__(self, settings: Settings) -> None:
        self._s = settings

    async def send(self, mail: Mail) -> None:
        msg = EmailMessage()
        msg["From"] = self._s.mail_from
        msg["To"] = mail.to
        msg["Subject"] = mail.subject
        msg.set_content(mail.body)
        await aiosmtplib.send(
            msg,
            hostname=self._s.smtp_host,
            port=self._s.smtp_port,
            username=self._s.smtp_username or None,
            password=self._s.smtp_password.get_secret_value() or None,
            # Port 465 is TLS from the first byte (SMTPS); other ports upgrade with STARTTLS.
            use_tls=self._s.smtp_port == SMTPS_PORT,
            start_tls=self._s.smtp_starttls and self._s.smtp_port != SMTPS_PORT,
            timeout=15,
        )


def make_mailer(settings: Settings) -> Mailer:
    if settings.mail_backend == "smtp":
        return SmtpMailer(settings)
    if settings.mail_backend == "memory":
        return MemoryMailer()
    return ConsoleMailer()


async def deliver(mailer: Mailer, mail: Mail) -> None:
    """Send, logging failures instead of raising (runs after the response is sent)."""
    try:
        await mailer.send(mail)
    except Exception:
        log.exception("mail.failed", subject=mail.subject)
