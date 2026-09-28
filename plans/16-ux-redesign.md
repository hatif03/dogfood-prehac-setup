# 16 — UX redesign (Radix Themes, Amicro motion, Raptors-inspired visual identity)

Reviewed: pending

Starts only after plan 15 phases A and B are green. Every screen keeps calling the same API, so `tests/api/test_api_first.py` stays the contract.

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| **A–B** | Radix primitives, compact event bar, work home, lifecycle rail, screen table below | **Done** (2026-09-25) |
| **C** | Raptors-inspired tokens, dark default, typography, chrome, marketing surfaces | See [context/design-tokens-raptors.md](../context/design-tokens-raptors.md) |

## What was wrong (2026-09-24 baseline)

| # | Problem | Where | Heuristic | A–B fix |
| --- | --- | --- | --- | --- |
| 1 | No home base | `/`, header | Visibility of status | `Your work` + work cards |
| 2 | Hero repeats on every sub-page | `events/[slug]/layout.tsx` | Minimalist design | Slim sticky event bar |
| 3 | Accent on everything | global | Visual hierarchy | Accent = primary only (Phase C remaps colour) |
| 4 | Muted text contrast | global | WCAG 1.4.3 | Radix scales; re-check after Phase C |
| 5 | Organizer tabs flat | `/organize` | Real-world match | Lifecycle rail + grouped tabs |
| 6 | Decorative chrome on task screens | layout, cards | Minimalist design | Reduced on task routes |
| 7 | Hand-rolled primitives | `components/ui` | Consistency | Radix Themes + primitives |
| 8 | Terminology drift | global | Consistency | Partially aligned in copy |

## Direction

- **Radix Themes** as the component system. **Phase C:** `accentColor="amber"`, `grayColor="gray"`, `radius="medium"`, `panelBackground="translucent"`. **Dark default** on first visit; light/dark toggle kept. Tokens documented in [context/design-tokens-raptors.md](../context/design-tokens-raptors.md). Tailwind maps onto Radix 12-step scales.
- **Accent means "do this".** Accent only on the one primary action per view, active nav, and current lifecycle step. Everything else is gray.
- **Task pages are compact.** Full event intro on the gallery only; judge, submit, vote, organizer use the slim event bar.
- **Home that knows who you are.** Signed in: work cards first. Signed out: editorial landing with dinosaur art (recolored/masked for dark palette).
- **Organizer lifecycle rail** (Setup → Submissions → Judging → Voting → Results → Archive) with tabs: Overview · People & judging · Results · Voting · Settings · Data & integrations · Audit.
- **Motion:** Amicro rules in `components/amicro/`; no ambient motion on task screens; optional marquee on marketing footer only.
- **Dinosaur art:** WebP in `public/art/` for landing, auth panel, 404, OG — graded to match Phase C palette (not removed).

## Screens

| Screen | Change |
| --- | --- |
| Header | Logo, Events, "Your work" (signed in), Verify, API; theme toggle; account menu |
| `/` | Signed in: work first. Signed out: Raptors-style editorial hero + events |
| Event bar | Compact on task pages; full hero on gallery only |
| Gallery | Search, track filters, cards |
| Project | DataList, comments |
| Submit | Two-column form, sticky submit bar |
| Judge | Queue/score without hero |
| Vote | Mode explanation, credit meter |
| Organizer | Lifecycle rail, regrouped tabs, tables, integrity callouts |
| Verify, widget, results | Card, Callout, Table |
| Sign-in, register | Split layout + dinosaur panel |

## Checks

- Task walkthroughs per role (CDP), optional timed.
- axe-core on every screen: no serious or critical violations — **re-run after Phase C** in light and dark.
- 390px and 1440px screenshots; no horizontal scroll.
- `npm run build` clean; `tests/api/test_api_first.py` green; acceptance suites green on Docker.

## Status

### A–B (2026-09-25)

- Screens rebuilt on Radix; CDP review at 1440 and 390 px.
- axe-core 4.10 on 15 screens: no serious/critical (avatar contrast, verify `<pre>` focus fixed).
- `npm run build` clean; `test_api_first.py` green; `spec/run.py` 7/7; `extended.py` 21/21.
- Home/dashboard review counts aligned via `blocked_ids`.

### C — Raptors visual identity

- Token doc, dark default, display typography, chrome, marketing surfaces, task-page accent sweep.
- OG image: update when palette frozen.
- Not done: timed walkthroughs; automated web test runner.
