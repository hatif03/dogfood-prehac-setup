"""Audit hash chain, signed records, webhooks, rubric re-weighting, assignment rules, OpenAPI."""

import hashlib
import hmac
import json

import httpx

from app import webhooks
from app.database import SessionLocal
from app.models import AuditEvent, WebhookDelivery
from conftest import login

E = "/v1/events/test-hack"


def test_audit_chain_verifies_and_detects_tampering(client, world):
    login(client, "org@example.com")
    ok = client.get(f"{E}/audit/verify").json()
    assert ok["ok"] and ok["checked"] > 5
    log = client.get(f"{E}/audit").json()
    assert log[0]["summary"] and log[0]["actor"]
    with SessionLocal() as db:
        row = db.query(AuditEvent).filter(AuditEvent.seq == 3).one()
        row.summary = "nothing happened here"
        db.commit()
    bad = client.get(f"{E}/audit/verify").json()
    assert bad == {"ok": False, "checked": 2, "broken_at_seq": 3}


def test_signed_judge_record_verifies_and_tampering_fails(client, world):
    login(client, "ja@example.com")
    item = client.get(f"{E}/assignments/mine").json()["items"][0]
    crit = client.get(f"{E}/rubric").json()["criteria"]
    client.put(f"{E}/assignments/{item['assignment_id']}/score", json={"cells": [{"criterion_id": c["id"], "value": 3} for c in crit], "submitted": True})
    login(client, "org@example.com")
    recs = client.post(f"{E}/records", json={"kind": "judge"}).json()
    assert len(recs) == 1 and recs[0]["payload"]["reviews_submitted"] == 1
    assert "ja@example.com" not in json.dumps(recs[0]["payload"])  # only a digest of the email is public
    client.cookies.clear()
    rec = client.get(f"/v1/records/{recs[0]['id']}").json()
    assert client.post("/v1/records/verify", json={"payload": rec["payload"], "signature": rec["signature"]}).json()["valid"]
    forged = {**rec["payload"], "reviews_submitted": 99}
    assert not client.post("/v1/records/verify", json={"payload": forged, "signature": rec["signature"]}).json()["valid"]
    assert "Certificate of Judging" in client.get(f"/v1/records/{rec['id']}/certificate").text
    assert client.get("/.well-known/portal-signing-key.json").json()["crv"] == "Ed25519"


def test_webhook_signature_and_retry(client, world, monkeypatch):
    login(client, "org@example.com")
    hook = client.post(f"{E}/webhooks", json={"url": "https://receiver.example/hook", "actions": ["normalization.*"]}).json()
    client.post(f"{E}/normalization", json={})
    calls = []

    def fake_post(url, content, headers, timeout):
        calls.append((content, headers))
        if len(calls) == 1:
            raise httpx.ConnectError("down")
        return httpx.Response(200)

    monkeypatch.setattr(webhooks.httpx, "post", fake_post)
    assert webhooks.run_due() == 1
    with SessionLocal() as db:
        d = db.query(WebhookDelivery).one()
        assert d.status == "pending" and d.attempts == 1
        d.next_attempt_at = d.created_at
        db.commit()
    webhooks.run_due()
    body, headers = calls[-1]
    expected = hmac.new(hook["secret"].encode(), headers["X-Portal-Timestamp"].encode() + b"." + body, hashlib.sha256).hexdigest()
    assert headers["X-Portal-Signature"] == f"sha256={expected}"
    with SessionLocal() as db:
        assert db.query(WebhookDelivery).one().status == "delivered"


def test_reweighting_the_rubric_recomputes_totals(client, world):
    login(client, "ja@example.com")
    item = client.get(f"{E}/assignments/mine").json()["items"][0]
    crit = client.get(f"{E}/rubric").json()["criteria"]
    values = {crit[0]["id"]: 5, crit[1]["id"]: 1}
    client.put(f"{E}/assignments/{item['assignment_id']}/score", json={"cells": [{"criterion_id": k, "value": v} for k, v in values.items()], "submitted": True})
    assert abs(client.get(f"{E}/scores").json()[0]["weighted"] - 4.0) < 1e-9  # weights 3:1
    login(client, "org@example.com")
    r = client.put(f"{E}/rubric", json={"scale_min": 1, "scale_max": 5, "criteria": [{"id": crit[0]["id"], "name": "Impact", "weight": 1}, {"id": crit[1]["id"], "name": "Craft", "weight": 1}]})
    assert r.status_code == 200
    login(client, "ja@example.com")
    assert abs(client.get(f"{E}/scores").json()[0]["weighted"] - 3.0) < 1e-9


def test_score_validation(client, world):
    login(client, "ja@example.com")
    item = client.get(f"{E}/assignments/mine").json()["items"][0]
    crit = client.get(f"{E}/rubric").json()["criteria"]
    url = f"{E}/assignments/{item['assignment_id']}/score"
    assert client.put(url, json={"cells": [{"criterion_id": crit[0]["id"], "value": 9}], "submitted": False}).status_code == 422
    assert client.put(url, json={"cells": [{"criterion_id": crit[0]["id"], "value": 3}], "submitted": True}).status_code == 422
    assert client.put(url, json={"cells": [{"criterion_id": crit[0]["id"], "value": 3}], "submitted": False}).status_code == 200


def test_assignment_top_up_is_idempotent_and_conflict_free(client, world):
    login(client, "org@example.com")
    again = client.post(f"{E}/assignments", json={}).json()
    assert again["created"] == 0
    dash = client.get(f"{E}/dashboard").json()
    assert dash["kpis"]["reviews_assigned"] == 4  # 2 projects x 2 judges, never doubled
    assert {j["status"] for j in dash["judges"]} == {"not_started"}


def test_openapi_documents_every_route(client):
    spec = client.get("/openapi.json").json()
    for path in [
        "/v1/events/{event_id}/projects",
        "/v1/events/{event_id}/scores",
        "/v1/events/{event_id}/assignments/{assignment_id}/score",
        "/v1/events/{event_id}/normalization",
        "/v1/events/{event_id}/pairwise/next",
        "/v1/ballots/{token}/votes",
        "/v1/events/{event_id}/export/{kind}.csv",
        "/v1/records/verify",
        "/v1/public/widget/{token}",
        "/v1/import",
    ]:
        assert path in spec["paths"], path
    undocumented = [p for p, ops in spec["paths"].items() for op in ops.values() if not op.get("summary")]
    assert undocumented == []


def test_rubric_put_matches_criteria_by_key_and_reports_recompute(client, world):
    login(client, "org@example.com")
    crit = client.get(f"{E}/rubric").json()["criteria"]
    body = {"criteria": [{"key": c["key"], "name": c["name"], "weight": 1} for c in crit]}
    r = client.put(f"{E}/rubric", json=body)
    assert r.status_code == 200, r.text
    assert [c["id"] for c in r.json()["criteria"]] == [c["id"] for c in crit]
    assert "recomputed" in r.json()
