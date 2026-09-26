from __future__ import annotations

import logging
from email.message import EmailMessage
import smtplib

from app.config import settings

log = logging.getLogger(__name__)


def send_mail(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.mail_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as smtp:
            smtp.send_message(msg)
    except Exception as exc:  # noqa: BLE001
        log.warning("smtp send failed (logged instead): %s\n%s", exc, body)
