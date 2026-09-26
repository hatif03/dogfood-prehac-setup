"""T4: API keys, webhooks, signed records and certificates, the embeddable widget."""

from __future__ import annotations

import hashlib
import html
import secrets
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse

from app.audit import audit
from app.config import settings
from app.deps import DB, ActorDep
from app.models import ApiKey, Event, EventRole, Membership, Score, SignedRecord, User, Webhook, WebhookDelivery
from app import signing
from app.schemas import ApiKeyIn, RecordsIn, VerifyIn, WebhookIn
from app.scoring import latest_run
from app.security import hash_token
from app.timeutil import iso, now
from app.views import gallery_rows, phase, project_public
from app.webhooks import ACTIONS

router = APIRouter(prefix="/v1", tags=["Integrations"])
wellknown = APIRouter(tags=["Integrations"])


# --- API keys ------------------------------------------------------------------------------------


@router.post("/events/{event_id}/api-keys", summary="Mint an API key that acts as you in this event (organizer)")
def create_key(body: ApiKeyIn, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    raw = "pk_" + secrets.token_urlsafe(32)
    key = ApiKey(event_id=actor.event.id, user_id=user.id, name=body.name, prefix=raw[:10], key_hash=hash_token(raw))
    db.add(key)
    audit(db, action="apikey.create", summary=f"{user.display_name} created API key '{body.name}'", actor=user, event_id=actor.event.id)
    db.commit()
    return {"id": str(key.id), "name": key.name, "prefix": key.prefix, "secret": raw, "header": f"X-API-Key: {raw}"}


@router.get("/events/{event_id}/api-keys", summary="API keys (secrets are never shown again)")
def list_keys(actor: ActorDep, db: DB):
    actor.require_organizer()
    return [
        {"id": str(k.id), "name": k.name, "prefix": k.prefix, "revoked": k.revoked, "last_used_at": iso(k.last_used_at), "created_at": iso(k.created_at)}
        for k in db.query(ApiKey).filter(ApiKey.event_id == actor.event.id).order_by(ApiKey.created_at.desc())
    ]


@router.delete("/events/{event_id}/api-keys/{key_id}", summary="Revoke an API key")
def revoke_key(key_id: uuid.UUID, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    key = db.get(ApiKey, key_id)
    if key is None or key.event_id != actor.event.id:
        raise HTTPException(404, "Key not found")
    key.revoked = True
    audit(db, action="apikey.revoke", summary=f"{user.display_name} revoked API key '{key.name}'", actor=user, event_id=actor.event.id)
    db.commit()
    return {"ok": True}


# --- webhooks ------------------------------------------------------------------------------------


def _hook_out(h: Webhook, secret: bool = False) -> dict:
    out = {"id": str(h.id), "url": h.url, "actions": h.actions, "active": h.active, "created_at": iso(h.created_at)}
    if secret:
        out["secret"] = h.secret
    return out


@router.get("/webhook-actions", summary="Every action a webhook can subscribe to")
def webhook_actions():
    return ACTIONS


@router.post("/events/{event_id}/webhooks", summary="Register a webhook (organizer). The secret is shown once.")
def create_webhook(body: WebhookIn, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    unknown = [a for a in body.actions if a not in ACTIONS and not (a.endswith(".*") and any(x.startswith(a[:-1]) for x in ACTIONS))]
    if unknown:
        raise HTTPException(422, f"Unknown actions: {', '.join(unknown)}")
    hook = Webhook(event_id=actor.event.id, url=str(body.url), secret=secrets.token_hex(24), actions=body.actions)
    db.add(hook)
    audit(db, action="webhook.create", summary=f"{user.display_name} added a webhook to {hook.url}", actor=user, event_id=actor.event.id)
    db.commit()
    return _hook_out(hook, secret=True)


@router.get("/events/{event_id}/webhooks", summary="Webhooks with recent delivery stats (organizer)")
def list_webhooks(actor: ActorDep, db: DB):
    actor.require_organizer()
    out = []
    for h in db.query(Webhook).filter(Webhook.event_id == actor.event.id).order_by(Webhook.created_at.desc()):
        rows = db.query(WebhookDelivery).filter(WebhookDelivery.webhook_id == h.id)
        out.append({**_hook_out(h), "delivered": rows.filter(WebhookDelivery.status == "delivered").count(), "pending": rows.filter(WebhookDelivery.status == "pending").count(), "failed": rows.filter(WebhookDelivery.status == "failed").count()})
    return out


@router.delete("/events/{event_id}/webhooks/{hook_id}", summary="Disable a webhook")
def delete_webhook(hook_id: uuid.UUID, actor: ActorDep, db: DB):
    actor.require_organizer()
    hook = db.get(Webhook, hook_id)
    if hook is None or hook.event_id != actor.event.id:
        raise HTTPException(404, "Webhook not found")
    hook.active = False
    db.commit()
    return {"ok": True}


@router.post("/events/{event_id}/webhooks/{hook_id}/test", summary="Queue a ping delivery")
def test_webhook(hook_id: uuid.UUID, actor: ActorDep, db: DB):
    actor.require_organizer()
    hook = db.get(Webhook, hook_id)
    if hook is None or hook.event_id != actor.event.id:
        raise HTTPException(404, "Webhook not found")
    db.add(WebhookDelivery(webhook_id=hook.id, action="ping", payload={"hello": "from portal", "at": iso(now())}))
    db.commit()
    return {"queued": True}


@router.get("/events/{event_id}/webhooks/{hook_id}/deliveries", summary="Recent deliveries for a webhook")
def deliveries(hook_id: uuid.UUID, actor: ActorDep, db: DB):
    actor.require_organizer()
    hook = db.get(Webhook, hook_id)
    if hook is None or hook.event_id != actor.event.id:
        raise HTTPException(404, "Webhook not found")
    rows = db.query(WebhookDelivery).filter(WebhookDelivery.webhook_id == hook.id).order_by(WebhookDelivery.created_at.desc()).limit(50)
    return [
        {"id": str(d.id), "action": d.action, "status": d.status, "status_code": d.status_code, "attempts": d.attempts, "last_error": d.last_error, "next_attempt_at": iso(d.next_attempt_at), "created_at": iso(d.created_at)}
        for d in rows
    ]


# --- signed records and certificates -------------------------------------------------------------


def _record_out(r: SignedRecord) -> dict:
    return {
        "id": str(r.id),
        "kind": r.kind,
        "payload": r.payload,
        "canonical": signing.canonical(r.payload),
        "signature": r.signature,
        "algorithm": "Ed25519",
        "key_id": r.key_id,
        "revoked": r.revoked,
        "verify_url": f"{settings.public_url}/verify?record={r.id}",
        "certificate_url": f"{settings.public_url}/v1/records/{r.id}/certificate",
    }


def _email_digest(email: str) -> str:
    return hashlib.sha256(email.lower().encode()).hexdigest()


@router.post("/events/{event_id}/records", summary="Issue signed judge records or certificates (organizer)")
def issue_records(body: RecordsIn, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    event = actor.event
    wanted = {e.lower() for e in body.user_emails}
    recipients: list[tuple[User, dict]] = []
    if body.kind == "judge":
        for role, u in db.query(EventRole, User).join(User, User.id == EventRole.user_id).filter(EventRole.event_id == event.id, EventRole.role == "judge"):
            n = db.query(Score).filter(Score.event_id == event.id, Score.judge_id == u.id, Score.submitted.is_(True)).count()
            if n and (not wanted or u.email in wanted):
                recipients.append((u, {"reviews_submitted": n}))
    else:
        winners: set = set()
        if body.kind == "winner":
            run = latest_run(db, event.id)
            if run is None:
                raise HTTPException(409, "Run normalization first")
            winners = {r.submission_id for r in run.rows if r.rank <= max(len(event.prizes), 3)}
            ranks = {r.submission_id: r.rank for r in run.rows}
        for s in gallery_rows(db, event):
            if body.kind == "winner" and s.id not in winners:
                continue
            for m in db.query(Membership).filter(Membership.team_id == s.team_id):
                if not wanted or m.user.email in wanted:
                    extra = {"project": s.title, "team": s.team.name}
                    if body.kind == "winner":
                        extra["rank"] = ranks[s.id]
                    recipients.append((m.user, extra))
    out = []
    for u, extra in recipients:
        rid = uuid.uuid4()
        payload = {
            "type": f"portal.{body.kind}_record",
            "version": 1,
            "record_id": str(rid),
            "issuer": settings.public_url,
            "event": {"slug": event.slug, "name": event.name},
            "subject": {"name": u.display_name, "email_sha256": _email_digest(u.email)},
            "issued_at": iso(now()),
            **extra,
        }
        rec = SignedRecord(id=rid, event_id=event.id, user_id=u.id, kind=body.kind, payload=payload, signature=signing.sign(payload), key_id=signing.key_id())
        db.add(rec)
        out.append(rec)
    audit(db, action="records.issue", summary=f"{user.display_name} issued {len(out)} signed {body.kind} records", actor=user, event_id=event.id)
    db.commit()
    return [_record_out(r) for r in out]


@router.get("/events/{event_id}/records", summary="Records issued for this event (organizer)")
def list_records(actor: ActorDep, db: DB):
    actor.require_organizer()
    return [_record_out(r) for r in db.query(SignedRecord).filter(SignedRecord.event_id == actor.event.id).order_by(SignedRecord.created_at.desc())]


@router.get("/records/{record_id}", summary="A signed record (public, verifiable offline)")
def get_record(record_id: uuid.UUID, db: DB):
    rec = db.get(SignedRecord, record_id)
    if rec is None:
        raise HTTPException(404, "Record not found")
    return {**_record_out(rec), "public_key_pem": signing.public_pem(), "public_jwk": signing.public_jwk()}


@router.post("/records/verify", summary="Verify any payload + signature against this portal's key (public)")
def verify_record(body: VerifyIn, db: DB):
    ok = signing.verify(body.payload, body.signature)
    rid = body.payload.get("record_id")
    rec = db.get(SignedRecord, uuid.UUID(rid)) if ok and rid else None
    return {"valid": ok, "revoked": bool(rec and rec.revoked), "key_id": signing.key_id()}


@router.get("/records/{record_id}/certificate", response_class=HTMLResponse, summary="Printable certificate")
def certificate(record_id: uuid.UUID, db: DB):
    rec = db.get(SignedRecord, record_id)
    if rec is None:
        raise HTTPException(404, "Record not found")
    p = rec.payload
    e = lambda s: html.escape(str(s))  # noqa: E731
    title = {"judge": "Certificate of Judging", "winner": "Certificate of Achievement", "participant": "Certificate of Participation"}[rec.kind]
    line = {
        "judge": f"for reviewing {e(p.get('reviews_submitted', ''))} projects as a judge",
        "winner": f"for placing #{e(p.get('rank', ''))} with <em>{e(p.get('project', ''))}</em>",
        "participant": f"for building <em>{e(p.get('project', ''))}</em> with {e(p.get('team', ''))}",
    }[rec.kind]
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{title} · {e(p['subject']['name'])}</title>
<style>
:root{{--ink:#0b0c0e;--paper:#fbfaf5;--accent:#6a8a00}}
*{{box-sizing:border-box}}body{{margin:0;background:#e9e7df;font-family:Georgia,serif;color:var(--ink)}}
.sheet{{width:min(960px,100%);aspect-ratio:1.414;margin:32px auto;background:var(--paper);padding:64px;border:1px solid #d8d4c6;position:relative;display:flex;flex-direction:column;justify-content:center;text-align:center}}
.sheet:before{{content:"";position:absolute;inset:16px;border:2px solid var(--ink);pointer-events:none}}
h1{{font-size:44px;letter-spacing:.04em;margin:0 0 12px}}.name{{font-size:56px;font-style:italic;margin:24px 0}}
.muted{{color:#5d5a52;font-family:ui-monospace,monospace;font-size:12px;word-break:break-all}}p{{font-size:20px}}
@media print{{body{{background:none}}.sheet{{margin:0;border:0}}}}
</style></head><body><div class="sheet">
<div class="muted">{e(p['event']['name'])}</div><h1>{title}</h1><p>awarded to</p>
<div class="name">{e(p['subject']['name'])}</div><p>{line}</p><p>Issued {e(p['issued_at'][:10])}</p>
<div class="muted">Record {e(rec.id)} · Ed25519 key {e(rec.key_id)}<br>Verify: {e(settings.public_url)}/verify?record={e(rec.id)}</div>
</div></body></html>"""


@wellknown.get("/.well-known/portal-signing-key.pem", response_class=PlainTextResponse, summary="Public signing key (PEM)")
def signing_key_pem():
    return signing.public_pem()


@wellknown.get("/.well-known/portal-signing-key.json", summary="Public signing key (JWK)")
def signing_key_jwk():
    return signing.public_jwk()


# --- embeddable widget ---------------------------------------------------------------------------


@router.get("/public/widget/{token}", summary="Gallery data for the embeddable widget (public)")
def widget(token: str, db: DB):
    event = db.query(Event).filter(Event.widget_token == token).one_or_none()
    if event is None:
        raise HTTPException(404, "Unknown widget")
    return {
        "event": {"name": event.name, "slug": event.slug, "phase": phase(event)},
        "gallery_url": f"{settings.public_url}/events/{event.slug}",
        "projects": [project_public(s) for s in gallery_rows(db, event)],
    }

