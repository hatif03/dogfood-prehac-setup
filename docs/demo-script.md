# Five-minute demo script (full scoring walkthrough)

Record a **single continuous take** if you can; judges want one lifecycle, not a montage. Target **4:45–5:15** on the main track below. Optional cuts at the end add T3/T4 and pairwise without blowing the deadline.

**Events**

| Event | Slug | Use for |
| --- | --- | --- |
| Official fixture | `sample-hack-2026` | Gallery, dashboard, normalization, voting, acceptance curls |
| Synthetic open event | `playground` | Create → submit → judge → publish (not fixture data) |

**Logins** (password for every seeded account: `password`; one-click buttons on `/login`)

| Role | Email | Demo cookie (from boot log / `.dogfood.toml`) |
| --- | --- | --- |
| Organizer | `organizer@portal.local` | `portal_session=demo_org_7f2a9c41` |
| Judge A (fixture `jdg_24`) | `diego.herrera@example.org` | `demo_jdg_a_91bc07` |
| Judge B (fixture `jdg_07`) | `iva.petrova@example.org` | `demo_jdg_b_44de3e` |
| Participant | `priya1@example.org` | `demo_prt_2e88f1` |

**URLs**

| What | URL |
| --- | --- |
| Portal | http://localhost:8080 |
| OpenAPI | http://localhost:8080/docs |
| Mailpit | http://localhost:8025 |
| Sample Hack gallery | http://localhost:8080/events/sample-hack-2026 |
| Organizer console | http://localhost:8080/events/sample-hack-2026/organize |
| Playground | http://localhost:8080/events/playground |

**Before you hit record**

1. Fresh stack: `docker compose up --build -d --wait` (or `up` in a terminal you leave visible for 10 seconds).
2. Confirm boot log shows `seeded. test logins` and the four demo cookies.
3. Run `.\scripts\verify-submission.ps1` once so `acceptance-report.txt` exists (you will flash the tail on camera).
4. Resize windows: **terminal left**, **browser right**, Mailpit in a background tab.
5. Close unrelated tabs; zoom browser to 100–110%.

**Honest tier line (say once, early)**  
“The official checker verifies **T1 and T2** — seven of seven in `acceptance-report.txt`. **T3 and T4** are covered by our extended suite, pytest, and what I’m about to show; we don’t claim `run.py` passed those tiers.”

---

## Main track (~5:00)

### 0:00–0:40 — Adoptability: one command, local stack

| | |
| --- | --- |
| **Show** | Terminal at repo root |
| **Do** | `docker compose up` (or show already-running containers with `docker compose ps`). |
| **Say** | “This is the whole portal: Postgres, MinIO, Redis, Mailpit, FastAPI, Next.js. No cloud accounts — `docker compose up` on a laptop is the product.” |
| **Do** | Open http://localhost:8080 — home or event list. |
| **Say** | “Seed loads the **official `fixtures.json` through the same importer** organizers use, plus a labelled **Playground** event for live demos.” |
| **Proves** | Adoptability, honest seed story |

### 0:40–1:20 — T1: public gallery and fixture shape

| | |
| --- | --- |
| **Show** | http://localhost:8080/events/sample-hack-2026 |
| **Do** | Scroll gallery; use **track filter** and **search** (pick a distinctive project title from the list). |
| **Say** | “Forty submitted projects on the fixture, SSR gallery with search and tracks. The duplicate submission is **flagged and hidden** from the public list — organizers still see it on the dashboard.” |
| **Proves** | T1 gallery, fixture integrity |

### 1:20–2:05 — T1 + T2: API enforcement (curl, not UI)

| | |
| --- | --- |
| **Show** | Terminal — paste commands below |
| **Say** | “Role isolation is **denied in the API**. Curl is the test; hiding buttons in the UI doesn’t count.” |

**1) Closed deadline — participant cannot write Sample Hack**

```powershell
curl.exe -s -o NUL -w "%{http_code}" -X POST `
  -H "Cookie: portal_session=demo_prt_2e88f1" `
  -H "Content-Type: application/json" `
  -d "{\"title\":\"dogfood-late-submission-probe\",\"summary\":\"probe\"}" `
  "http://localhost:8080/v1/events/sample-hack-2026/projects"
# expect 4xx (same body as spec/run.py)
```

**2) Peer scores — judge B cannot read judge A’s scores (`spec/run.py` check)**

```powershell
curl.exe -s -o NUL -w "%{http_code}" `
  -H "Cookie: portal_session=demo_jdg_b_44de3e" `
  "http://localhost:8080/v1/events/sample-hack-2026/scores?judge=jdg_24"
# expect 403
```

**3) Participant cannot read judge scores**

```powershell
curl.exe -s -o NUL -w "%{http_code}" `
  -H "Cookie: portal_session=demo_prt_2e88f1" `
  "http://localhost:8080/v1/events/sample-hack-2026/scores"
# expect 401 or 403
```

**4) Participant cannot export results**

```powershell
curl.exe -s -o NUL -w "%{http_code}" `
  -H "Cookie: portal_session=demo_prt_2e88f1" `
  "http://localhost:8080/v1/events/sample-hack-2026/export/results.csv"
# expect 403
```

| **Say** | “Same checks the official suite runs. Judge B asking for judge twenty-four’s scores gets **403**, not an empty list.” |
| **Proves** | T1 deadline, T2 FIG.02-style isolation |

### 2:05–2:50 — Judging integrity: organizer dashboard + normalization

| | |
| --- | --- |
| **Show** | Sign in as **organizer** → http://localhost:8080/events/sample-hack-2026/organize |
| **Do** | **Overview** tab: point at **duplicate** flag, **coverage** / reviews histogram, **constant rater** (`jdg_07` in fixture copy). |
| **Say** | “Organizers see data quality before they trust a leaderboard — duplicate detection, review coverage, judges who never move off one score.” |
| **Do** | **Results** tab: open the **normalization** narrative / rank chart (slope chart if visible). Mention one project whose **rank changed** after adjustment. |
| **Say** | “We don’t just average rubric scores. Lenient and harsh judges are adjusted with a documented estimator — full tables in `docs/normalization-proof.md` and the maths in `JUDGING.md`.” |
| **Proves** | Judging integrity (25%), bonus normalization artifact |

### 2:50–3:15 — Audit trail (threat model in one screen)

| | |
| --- | --- |
| **Show** | **Audit** tab in the same organizer console |
| **Do** | Scroll a few rows (score submitted, role change, or export). |
| **Say** | “Every sensitive action leaves a row organizers can inspect. `THREAT-MODEL.md` maps the five attacks from the brief to these controls and to pytest in `tests/api/`.” |
| **Proves** | Integrity + transparency |

### 3:15–4:15 — Full lifecycle on Playground (create → publish)

| | |
| --- | --- |
| **Show** | http://localhost:8080/events/playground |
| **Say** | “Playground is **synthetic and labelled** — submissions are open so we can run the lifecycle without touching fixture data.” |

**Fast path (practice once before recording):**

1. Sign in as **participant** (or register a throwaway — see optional verify cut).
2. **Create team** → open **invite link** in a second browser profile or incognito (optional: “team invite is a rotatable link”).
3. **Submit** tab: save **draft**, then **submit** (pick a track).
4. Sign in as **organizer** → Playground **organize** → **People & judging**: ensure judge is invited (seeded judge B is already on Playground).
5. **Assign** reviews (or run assignment action if the UI exposes it on lifecycle rail).
6. Sign in as **judge B** → judging queue → submit scores for the new project.
7. Organizer → **Results**: run **compute / publish** when the UI allows (lifecycle rail **Publish** when reviews are in).

| **Say** | “Same paths as `tests/api/test_lifecycle.py` — draft, deadline checks on writes, assignment, scoring, publication.” |
| **Proves** | Deliverable “one full event lifecycle”, T1 depth |

### 4:15–4:45 — T3 on camera: Mailpit + community vote (extended suite)

| | |
| --- | --- |
| **Show** | Sample Hack **organize → Voting** (settings summary) then public vote flow |
| **Do** | Open **Mailpit** (http://localhost:8025). Show a **ballot or verification** message for Sample Hack if present; otherwise register a new user and show **verify-email** link → `/verify-email?token=…`. |
| **Say** | “Email-gated **quadratic** voting on the fixture demo config — cost is quadratic in credits. Voting requires a **verified email** when that gate is on. Extended acceptance hits this; official `run.py` does not.” |
| **Proves** | T3 honesty + local Mailpit (no SendGrid) |

### 4:45–5:00 — Close: verification gate + docs

| | |
| --- | --- |
| **Show** | Terminal: `Get-Content acceptance-report.txt -Tail 8` then `Get-Content acceptance-report-extended.txt -Tail 6` |
| **Do** | Or re-run `.\scripts\verify-submission.ps1` if you want live green checks (adds ~30s — trim Playground if needed). |
| **Say** | “Repo ships `verify-submission.ps1`, committed reports, `JUDGING.md`, `THREAT-MODEL.md`, OpenAPI at `/docs`, MIT license — fork and run offline.” |
| **Proves** | Tier honesty, adoptability, submission checklist |

---

## Optional cuts (if you have 6–8 minutes total)

Use these **after** the 5:00 main track or swap one Playground step for a shorter organizer-only publish on Sample Hack.

### Cut A — Pairwise mode (~45s)

| **Show** | http://localhost:8080/events/new — step through to **Judging mode → Pairwise** (do not need to finish wizard on video). |
| **Say** | “Judges compare two projects at a time; ranking is **Crowd-BT / Bradley–Terry** with per-judge reliability — see `docs/pairwise.md` and `tests/api/test_pairwise.py`.” |
| **Alt** | On an event with `judging_mode: pairwise`, open `/events/{slug}/judge/pairwise` as a judge. |

### Cut B — T4 API surface (~60s)

| **Show** | http://localhost:8080/docs — one scoped route (e.g. export or API key). |
| **Do** | Organizer → **Data & integrations**: mention **fixtures-shaped export** / import round-trip (lossless per tests). |
| **Do** | Open http://localhost:8080/verify — paste or show a **signed judge record** verification (if seeded). |
| **Say** | “Webhooks, API keys, signed records, and bulk import/export are documented in `docs/API.md` — extended suite and pytest, not `run.py`.” |

### Cut C — Production posture (~20s)

| **Say** | “For a real event: `DEMO_SESSIONS=false`, strong `SESSION_SECRET`, TLS in front of **8080**, optional `docker-compose.prod.yml` overlay.” |

### Cut D — Email verification on register (~30s)

| **Do** | Register at `/register` with a new email → Mailpit → click verify → sign in → attempt vote on Sample Hack. |
| **Say** | “Stops casual double accounts on one inbox; honeypot fields on register and open ballots; gallery reads rate-limited per IP.” |

---

## Copy-paste reference (bash / Git Bash)

```bash
# Peer scores (official parity)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Cookie: portal_session=demo_jdg_b_44de3e" \
  "http://localhost:8080/v1/events/sample-hack-2026/scores?judge=jdg_24"
# 403

./scripts/verify-submission.sh
```

---

## Talking points cheat sheet

- **Stack:** FastAPI + Next.js standalone, Postgres 16, MinIO, Redis, Mailpit — all in compose.
- **Importer:** Fixture loaded like an organizer import, not a special-case loader.
- **Maths:** Normalization proof doc + pairwise doc are regenerated from code (`judging_math.py`, pairwise proof module).
- **Security:** Argon2id, HMAC session storage, audit chain, threat model with known gaps (demo sessions, local-only email verify).
- **What we do not claim:** Perfect scores on T3/T4 from `run.py`; we claim **tested** extended behaviour and show it.

---

## After recording

1. Upload video (unlisted YouTube or file host linked from README / submission form).
2. Update `docs/SUBMISSION-FINAL.md` — mark video done.
3. Commit fresh `acceptance-report*.txt` if you re-ran verify on recording day.

Reviewed: hatif03 2026-09-28 (script; publish video when recorded)
