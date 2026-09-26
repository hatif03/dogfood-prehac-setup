from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models import AuditEvent, User, utcnow
from app.security import hash_ip
from app.timeutil import ensure_utc

GENESIS = "0" * 64


def _digest(prev: str, row: AuditEvent) -> str:
    body = json.dumps(
        {
            "seq": row.seq,
            "event_id": str(row.event_id) if row.event_id else None,
            "actor_id": str(row.actor_id) if row.actor_id else None,
            "action": row.action,
            "resource": row.resource,
            "summary": row.summary,
            "payload": row.payload,
            "created_at": ensure_utc(row.created_at).astimezone(UTC).isoformat(),
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256((prev + body).encode()).hexdigest()


def audit(
    db: Session,
    *,
    action: str,
    summary: str,
    actor: User | None = None,
    event_id: uuid.UUID | None = None,
    resource: str = "",
    ip: str = "",
    payload: dict | None = None,
) -> None:
    """Append to the hash chain (and queue matching webhooks) inside the caller's transaction."""
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        # ponytail: one global chain serialized by an advisory lock; per-event chains if write volume grows.
        db.execute(text("SELECT pg_advisory_xact_lock(424242)"))
    db.flush()
    last = db.query(AuditEvent).order_by(AuditEvent.seq.desc()).first()
    row = AuditEvent(
        seq=(last.seq + 1) if last else 1,
        event_id=event_id,
        actor_id=actor.id if actor else None,
        actor_name=actor.display_name if actor else "system",
        action=action,
        resource=resource,
        summary=summary,
        ip_hash=hash_ip(ip) if ip else "",
        payload=payload or {},
        prev_hash=last.hash if last else GENESIS,
        created_at=utcnow(),
    )
    row.hash = _digest(row.prev_hash, row)
    db.add(row)
    db.flush()
    if event_id is not None:
        # Every audited action in an event is also a webhook action, so webhooks cover every UI action.
        from app.webhooks import enqueue

        enqueue(db, event_id, action, {"seq": row.seq, "summary": summary, "actor": row.actor_name, "resource": resource, "data": payload or {}})


def verify_chain(db: Session) -> dict:
    prev = GENESIS
    count = 0
    for row in db.query(AuditEvent).order_by(AuditEvent.seq).yield_per(500):
        if row.prev_hash != prev or _digest(prev, row) != row.hash:
            return {"ok": False, "checked": count, "broken_at_seq": row.seq}
        prev = row.hash
        count += 1
    return {"ok": True, "checked": count, "head": prev}


def audit_count(db: Session) -> int:
    return db.query(func.count(AuditEvent.id)).scalar() or 0
