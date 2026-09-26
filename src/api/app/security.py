import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.config import settings

hasher = PasswordHasher()
UNCLAIMED = "!"


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    if password_hash == UNCLAIMED:
        return False
    try:
        return hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def new_token(prefix: str = "") -> str:
    return prefix + secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hmac.new(settings.session_secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def hash_ip(ip: str) -> str:
    """Keyed so the 2^32 IPv4 space cannot be brute-forced back out of the audit log."""
    return hmac.new(settings.session_secret.encode(), f"ip:{ip}".encode(), hashlib.sha256).hexdigest()


def session_expiry(hours: int | None = None) -> datetime:
    return datetime.now(UTC) + timedelta(hours=hours or settings.session_hours)


def hmac_sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def canonical_email(email: str) -> str:
    """Collapse the aliases people use to vote twice: case, +tags, and gmail dots."""
    local, _, domain = email.strip().lower().partition("@")
    local = local.split("+", 1)[0]
    if domain in {"gmail.com", "googlemail.com"}:
        local = local.replace(".", "")
        domain = "gmail.com"
    return f"{local}@{domain}"
