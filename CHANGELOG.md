# Changelog

## 1.0.0 (2026-09-24)

### Added

- Official `fixtures.json` seed through the public importer; lossless `export.json` round trip; projects CSV import.
- Fixed demo sessions printed on boot for the acceptance checker (`DEMO_SESSIONS`).
- Single origin: the web app proxies the API on :8080.
- Additive judge-offset normalization with a generated proof and Monte-Carlo study; Bradley–Terry pairwise mode with active pair selection.
- Track-aware, conflict-free, top-up judge assignment; judge invites by email; rubric re-weighting with recompute.
- Community voting: authenticated, email-gated and link modes; 1p1v and quadratic; per-ballot shuffled order.
- Hash-chained audit log with verification; Ed25519-signed judge records and certificates; HMAC webhooks with retries; scoped API keys; embeddable widget.
- Rebuilt UI: Tailwind v4, motion, Magic UI-style components, judge console with keyboard scoring, live organizer dashboard.
- Extended black-box acceptance suite (`tests/acceptance/extended.py`).

### Changed

- Submission fields renamed to the fixture vocabulary (`title`, `summary`).
- Peer score requests by judge name return 403 (was 404); objects by id stay 404.

### Removed

- Synthetic 40-project seed (replaced by the official fixture).
