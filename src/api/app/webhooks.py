"""Outgoing webhooks: a DB-backed queue with HMAC signatures and exponential backoff.

enqueue() only writes rows inside the caller's transaction, so a rolled-back request never
fires a webhook. A background thread delivers due rows; a receiver that is down gets
retried at 10s, 40s, 2.5m, 10m, 40m, then the delivery is marked failed.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from datetime import timedelta

import httpx
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Webhook, WebhookDelivery
from app.security import hmac_sign
from app.timeutil import now

log = logging.getLogger(__name__)

# Every audited, event-scoped action. Subscribe to exact names or to a prefix such as "score.*".
ACTIONS = [
    "event.create", "event.update", "event.tracks", "event.prizes", "event.archive", "role.assign",
    "team.create", "team.join",
    "submission.save", "submission.submit", "flag.clear", "import.fixture", "import.csv",
    "judge.invite", "judge.join", "assignment.generate", "rubric.update",
    "score.draft", "score.submit", "normalization.run", "pairwise.decide", "pairwise.fit",
    "results.published", "results.unpublished",
    "ballot.open", "ballot.email", "ballot.links", "vote.cast", "comment.create", "comment.hide", "comment.restore",
    "apikey.create", "apikey.revoke", "webhook.create", "records.issue",
    "ping",
]


def subscribed(filters: list[str], action: str) -> bool:
    if not filters:
        return True
    return any(f == action or (f.endswith(".*") and action.startswith(f[:-1])) for f in filters)


MAX_ATTEMPTS = 6


def enqueue(db: Session, event_id: uuid.UUID, action: str, payload: dict) -> int:
    n = 0
    for hook in db.query(Webhook).filter(Webhook.event_id == event_id, Webhook.active.is_(True)):
        if not subscribed(hook.actions, action):
            continue
        db.add(WebhookDelivery(webhook_id=hook.id, action=action, payload=payload))
        n += 1
    return n


def deliver(db: Session, delivery: WebhookDelivery) -> None:
    hook = db.get(Webhook, delivery.webhook_id)
    if hook is None or not hook.active:
        delivery.status = "failed"
        delivery.last_error = "webhook removed or disabled"
        return
    body = json.dumps(
        {"id": str(delivery.id), "action": delivery.action, "event_id": str(hook.event_id), "payload": delivery.payload},
        separators=(",", ":"),
    ).encode()
    ts = str(int(time.time()))
    delivery.attempts += 1
    try:
        resp = httpx.post(
            hook.url,
            content=body,
            timeout=5.0,
            headers={
                "Content-Type": "application/json",
                "X-Portal-Event": delivery.action,
                "X-Portal-Delivery": str(delivery.id),
                "X-Portal-Timestamp": ts,
                # Receivers recompute HMAC-SHA256(secret, f"{timestamp}.{body}") and compare.
                "X-Portal-Signature": "sha256=" + hmac_sign(hook.secret, ts.encode() + b"." + body),
            },
        )
        delivery.status_code = resp.status_code
        if resp.status_code < 300:
            delivery.status = "delivered"
            delivery.last_error = ""
            return
        delivery.last_error = resp.text[:300]
    except httpx.HTTPError as exc:
        delivery.last_error = f"{type(exc).__name__}: {exc}"[:300]
    if delivery.attempts >= MAX_ATTEMPTS:
        delivery.status = "failed"
    else:
        delivery.next_attempt_at = now() + timedelta(seconds=10 * 4 ** (delivery.attempts - 1))


def run_due(limit: int = 20) -> int:
    db = SessionLocal()
    try:
        q = (
            db.query(WebhookDelivery)
            .filter(WebhookDelivery.status == "pending", WebhookDelivery.next_attempt_at <= now())
            .order_by(WebhookDelivery.next_attempt_at)
            .limit(limit)
        )
        # Several API workers poll the same queue; SKIP LOCKED hands each delivery to exactly one.
        due = (q.with_for_update(skip_locked=True) if db.bind.dialect.name == "postgresql" else q).all()
        for d in due:
            deliver(db, d)
        db.commit()
        return len(due)
    finally:
        db.close()


def start_worker(stop: threading.Event, interval: float = 2.0) -> threading.Thread:
    # ponytail: one thread per API worker, coordinated by SKIP LOCKED; a separate worker container scales further.
    def loop() -> None:
        while not stop.is_set():
            try:
                run_due()
            except Exception:  # noqa: BLE001 - the worker must survive a bad row or a DB blip
                log.exception("webhook worker tick failed")
            stop.wait(interval)

    t = threading.Thread(target=loop, name="webhook-worker", daemon=True)
    t.start()
    return t
