"""Registration email verification (Mailpit in local compose)."""

from __future__ import annotations

import secrets
from datetime import timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app import mailer
from app.models import EmailVerification, User
from app.timeutil import ensure_utc, now


def issue_verification(db: Session, user: User) -> None:
    db.query(EmailVerification).filter(EmailVerification.user_id == user.id).delete()
    token = secrets.token_urlsafe(32)
    db.add(
        EmailVerification(
            user_id=user.id,
            token=token,
            expires_at=now() + timedelta(days=2),
        )
    )
    link = f"{settings.public_url}/verify-email?token={token}"
    mailer.send_mail(
        user.email,
        "Confirm your portal email",
        f"Hi {user.display_name},\n\nConfirm your email to vote in events that require it:\n\n{link}\n\nIgnore this if you did not sign up.",
    )


def verify_token(db: Session, token: str) -> User:
    row = db.query(EmailVerification).filter(EmailVerification.token == token).one_or_none()
    if row is None:
        raise ValueError("invalid")
    if ensure_utc(row.expires_at) < now():
        raise ValueError("expired")
    user = db.get(User, row.user_id)
    if user is None:
        raise ValueError("invalid")
    user.email_verified_at = now()
    db.delete(row)
    return user
