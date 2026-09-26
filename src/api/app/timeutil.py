from datetime import UTC, datetime


def ensure_utc(dt: datetime) -> datetime:
    """SQLite hands back naive datetimes; everything we store is UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def now() -> datetime:
    return datetime.now(UTC)


def is_past(dt: datetime | None) -> bool:
    return dt is not None and now() > ensure_utc(dt)


def iso(dt: datetime | None) -> str | None:
    return ensure_utc(dt).astimezone(UTC).isoformat().replace("+00:00", "Z") if dt else None
