# Threat model

Reviewed: hatif03 2026-09-28

How someone could make a hackathon's result wrong, and what this portal does about it. The five attacks the brief names come first, each with what we stop, what we do not, and the test that proves the part we claim. The honest list is the point: several of these can only be made expensive or visible, not impossible.

Every control names the code that implements it and a test in `tests/api/`.

## Who attacks, and what they want

| Attacker | Wants | Starting point |
| --- | --- | --- |
| Anonymous visitor with curl | Scores, drafts, results before publication | Only the public API |
| Participant | A better rank for their project, a peek at scores, a late edit | A signed-in account on a team |
| Judge | A friend's project to win, or less work | A judge role, own assignments |
| Sock-puppet voter | The community prize | Many emails, accounts, browsers or IPs |
| Insider with database access | To rewrite history quietly | The Postgres volume |

The organizer is trusted for their own event. Organizer account takeover is out of scope for product controls, but everything an organizer does is on the hash-chained audit log.

## The five named attacks

### 1. Sybil votes (one person, many identities)

| Voting mode | Identity per ballot | What stops a second ballot | What does not |
| --- | --- | --- | --- |
| `link` | A single-use link the organizer hands out | The link is the ballot; there is nothing to register | Links that are shared or sold |
| `authenticated` | A verified account | Unique `(event, "user:<id>")`; registration is rate-limited per IP (10/min); new accounts must confirm email (Mailpit locally) before voting when `require_verified_email` is on (default) | Anyone willing to register many accounts and inboxes; honeypot fields reject naive bots |
| `email_gated` | A *canonical* email address | Unique `(event, "email:<canonical>")` with case, `+tags` and Gmail dots collapsed; the ballot token is only ever sent by email, never returned by the API; 3 voting-link emails per address per hour | Someone with many real inboxes |
| `open` | A browser cookie | Same browser gets the same ballot back; 20 new ballots per IP per day | Clearing cookies, or many IPs. This is the weakest mode by design: the one to use when turnout matters more than integrity |

**Quadratic voting makes Sybils more valuable, not less.** With a budget of `B` credits, one identity can put at most `√B` votes on a project. Splitting into `N` identities gives `N·√B`, which is `√N` times what the same credits in one identity buy. So quadratic voting only pays off when identity is expensive. The organizer console says so next to the switch. Our recommendation: pair `quadratic` with `link` or `email_gated`, never with `open`.

Following Devpost's own guidance for public votes (reference [1] on dogfoodhack.com: "not showing the results live until you review your votes"), tallies are never live. They stay hidden until voting closes and an organizer publishes, and the community prize is reported separately from the judged ranking.

Evidence: `test_voting.py::test_email_gated_ballot_only_travels_by_email`, `test_canonical_email_collapses_aliases`, `test_authenticated_mode_requires_login_and_link_mode_requires_a_link`, `test_compliance.py::test_open_link_voting_one_ballot_per_browser`.

**Not stopped:** a person with many genuine identities in any mode except distributed links.

### 2. Ballot stuffing (many votes through one ballot or one machine)

- One ballot per voter key and one vote row per (ballot, project), both unique constraints in the database, not application checks.
- One-person-one-vote: casting a new vote moves the old one; the ballot can never hold two.
- Quadratic: every vote is checked against the budget, `Σ units² ≤ budget`, inside the same transaction.
- Rate limits in Redis on ballot creation and vote casting (30/min per IP). If Redis is configured but unreachable, the limited routes fail closed.
- Every ballot stores a keyed hash of the creating IP. The organizer dashboard counts ballots that share an IP with more than three others, a signal to review rather than an automatic rejection, because a venue's Wi-Fi is one IP.
- Every vote is an audit entry and a `vote.cast` webhook.

Evidence: `test_voting.py::test_quadratic_budget`, `test_vote_rate_limit`, `test_email_gated_ballot_only_travels_by_email` (vote moves, never duplicates).

**Not stopped:** many machines on many IPs, beyond what the per-mode identity costs.

### 3. Submission scraping (reading what is not yet public)

- The gallery lists submitted projects only. A draft by id returns 404 to everyone except its own team and organizers (`test_deadline.py::test_submit_requires_title_summary_and_track`).
- Public project data carries team member *display names*, never email addresses.
- Scores, comments hidden by moderators, judge identities and per-judge numbers never appear on public routes. The public results strip judge offsets and outlier lists (`test_isolation.py::test_results_hidden_until_published_and_voting_closed`).
- Uploaded images are served through the API by id; MinIO is not exposed.

**Not stopped:** scraping of the public gallery, which is public by design. There is no rate limit on public reads; put a reverse proxy in front if that matters.

### 4. Judge collusion (a judge pushes a friend, or judges coordinate)

What the design takes away:

- **No choosing.** Assignment is automatic, load-balanced and track-scoped, so a judge cannot pick the project they want to help (`assignment.py`).
- **No conflicts.** A judge is never assigned a project from a team they are on. Structurally, a person holds one role per event, so a team member cannot also be a judge of that event (`test_deadline.py::test_judge_cannot_join_a_team_and_teams_have_a_size_cap`).
- **No anchoring.** A judge cannot read another judge's scores: asking by name is 403, and asking by id is 404, so ids cannot be probed. Participants are refused outright. This is backend-enforced on 26 route and role combinations (`test_isolation.py`), and on another track's projects (`test_compliance.py::test_a_track_judge_never_sees_another_track`).
- **Bounded influence.** One review is one of 2–5 for a project, and a judge who is generous across the board is absorbed by their estimated offset (JUDGING.md).

What the system detects:

- **Outlier reviews.** Every normalization run lists reviews more than 2.5 residual standard deviations from the model: one judge far out of line with the others on one project. Candidates are shown to the organizer on the dashboard's integrity panel. On the fixture there are none (see the proof).
- **Contrarian or random pairwise judges.** In pairwise mode the EM fit estimates each judge's reliability η; a judge who systematically votes against the room ends near 0 and their votes stop counting (docs/pairwise.md, `test_pairwise.py::test_pairwise_event_end_to_end`).
- **Constant raters.** A judge who gives everything the same score to finish fast is detected and excluded from the ranking (`test_normalization.py::test_fixture_constant_rater_and_coverage`).
- **Every save is logged** with the judge, the project and the time, on a hash-chained audit log.

**Not stopped:** a judge who is honest everywhere except a small boost for one friend that stays inside normal disagreement, and judges who coordinate out of band. Both are indistinguishable from honest disagreement using scores alone. The leave-one-judge-out analysis in the proof shows no single judge decides the top 5 on the fixture, which bounds the damage.

### 5. Deadline gaming (late edits, back-dated work, late members)

- `ensure_open()` is the first line of every submission write: save, submit, unsubmit and image upload. It uses the server clock and ignores anything the client sends.
- The same check locks team changes after the deadline: creating a team, joining by invite link, and rotating the link. A team formed after the deadline could only be a way to add a member late.
- `submitted_at` is set by the server; the fixture's timestamps are imported as data and never trusted for enforcement.
- Judging can have its own deadline, after which reviews are read-only.
- Archiving an event makes every event-scoped write refuse, forever (`deps.py::get_actor`).

Evidence: `test_deadline.py::test_invite_link_draft_edit_submit_then_deadline_locks`, `test_compliance.py::test_deadline_also_locks_teams`, `test_archive_is_read_only_and_exportable`, and `spec/run.py`'s "closed event refuses submissions" check.

**Not stopped:** a wrong clock on the host. Run NTP.

## Other attacks

| Attack | Control | Status | Evidence |
| --- | --- | --- | --- |
| Organizer quietly rewrites a judge's review | Organizers have no score-write path (403). Re-weighting the rubric recomputes totals and logs before and after | Prevented | `test_isolation.py::test_organizer_cannot_forge_a_judges_review`, `test_integrity.py::test_reweighting_the_rubric_recomputes_totals` |
| Someone edits the audit log in the database | Each row stores `sha256(prev_hash ‖ canonical row)`; `GET /audit/verify` recomputes the chain and names the first broken row | Detected | `test_integrity.py::test_audit_chain_verifies_and_detects_tampering` |
| Forged or edited certificate or judge record | Ed25519 over canonical JSON; the key is published at `/.well-known/portal-signing-key.pem`; records verify in the browser, through the API, or offline with `python -m app.signing` | Prevented | `test_integrity.py::test_signed_judge_record_verifies_and_tampering_fails` |
| Spoofed webhook to an organizer's system | HMAC-SHA256 over `timestamp.body` with a per-webhook secret shown once | Prevented, for receivers that verify | `test_integrity.py::test_webhook_signature_and_retry` |
| An API key used outside its event | The key carries its event; anywhere else the request is anonymous | Prevented | `test_isolation.py::test_api_key_is_scoped_to_its_event` |
| Duplicate submission to double a team's chances | Same normalized title or repo within an event: the later one is flagged, excluded from judging, ranking and the gallery. Nothing is deleted, and a false positive can be cleared (audited) | Detected and neutralized | fixture `prj_41`; `test_deadline.py::test_resubmitting_a_copy_is_flagged_as_duplicate` |
| Position bias on ballots | Every ballot is shuffled once with a CSPRNG and the order stored | Mitigated | `test_voting.py::test_ballots_are_shuffled_per_voter` |
| Comment spam | Signed-in only, 5 per minute, identical repeats refused, 2000 characters, organizer can hide | Limited | `test_voting.py::test_comments_need_login_rate_limit_and_moderation` |
| Password guessing | 10 attempts per minute per IP and per email; Argon2id | Limited | `tests/acceptance/extended.py` (login rate limit) |

## Privacy

- Passwords use Argon2id. Session tokens and API keys are stored as keyed HMACs.
- IP addresses are never stored in the clear. Audit rows and ballots keep `HMAC(SESSION_SECRET, ip)`, keyed so the IPv4 space cannot be brute-forced back out of it.
- Public signed records carry a display name and the SHA-256 of an email, never the email itself.
- In the default setup, mail never leaves the machine (Mailpit).

## Known gaps

- **Demo sessions.** `DEMO_SESSIONS=true`, the compose default so the acceptance checker can attach headers, creates fixed session tokens for five seeded accounts. **For a real event, set `DEMO_SESSIONS=false` and change `SESSION_SECRET`.**
- **`TRUST_PROXY=true`** trusts `X-Forwarded-For` from the web proxy. Do not expose port 8000 publicly with it on, or clients can spoof their IP for rate limiting.
- **Email verification is local-mail only.** It stops casual double accounts on one inbox, not a determined attacker with many addresses.
- **No third-party CAPTCHA.** Registration and open ballots include honeypot fields; gallery reads are rate-limited per IP (Redis in compose).
- **One API process runs the webhook worker.** With several API replicas, run one worker. Deliveries are at-least-once, so receivers should dedupe on `X-Portal-Delivery`.
