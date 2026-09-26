# 16 — UX redesign (Radix Themes, Amicro motion, dinosaur art)

Reviewed: pending

Starts only after plan 15 phases A and B are green. Every screen keeps calling the same API, so `tests/api/test_api_first.py` stays the contract.

## What is wrong today (heuristic review of every screen, 2026-09-24)

| # | Problem | Where | Heuristic |
| --- | --- | --- | --- |
| 1 | No home base. A signed-in judge or organizer lands on a marketing page and has to find their event, then the right tab. Nothing says "you have 3 reviews left". | `/`, header | Visibility of status; recognition over recall |
| 2 | The event hero (badges, 40px title, four-box countdown) repeats on every sub-page and pushes the actual task below the fold: the judge console starts ~340px down. | `events/[slug]/layout.tsx` | Aesthetic and minimalist design |
| 3 | Lime marks everything: pills, badges, progress, links, buttons, active tabs. The primary action does not stand out, and the page feels loud. | global | Visual hierarchy |
| 4 | Small muted text and mono captions on near-black, several below comfortable contrast. | global | Accessibility (WCAG 1.4.3) |
| 5 | The organizer console is seven equal tabs with no sense of where the event is or what to do next. | `/organize` | Match between system and the real world |
| 6 | Four-box countdowns everywhere; decorative grid and spotlight effects behind working screens. | layout, cards | Minimalist design |
| 7 | Hand-rolled primitives: menus, tabs, dialogs, selects and tooltips each behave slightly differently, and some lack full keyboard support. | `components/ui` | Consistency and standards |
| 8 | Terminology drifts: "Organize", "Judge console", "Pairwise", "Results", "Integrity". | global | Consistency |

## Direction

- **Radix Themes** (`@radix-ui/themes`) as the component system, **Radix Primitives** (`radix-ui`) where Themes has no component. `appearance` follows the system with a light/dark toggle; `accentColor="lime"`, `grayColor="olive"`, `radius="medium"`, `panelBackground="translucent"`. Tailwind stays for layout; its colour tokens map onto Radix's 12-step scales, so contrast comes from Radix, not from guesses.
- **Accent means "do this".** Lime only on the one primary action per view, the active navigation item and positive state. Everything else is gray steps.
- **Task pages are compact.** The full event hero shows on the gallery only. Judge, submit, vote and organizer pages get a slim sticky event bar: name, phase, one deadline in words ("closes in 13 days"), section tabs.
- **A home that knows who you are.** Signed in: "Your work", one card per event and role with the next action and progress ("Judge · Sample Hack 2026 · 11 of 11 reviewed · Review again", "Organizer · 8 projects below target · Top up assignments"). Signed out: the landing page with the dinosaur art.
- **The organizer sees the lifecycle.** A stage rail (Setup → Submissions → Judging → Voting → Results → Archive) at the top of the console, showing where the event is and the next action for that stage. Tabs underneath, grouped as Overview · People & judging · Results · Voting · Settings · Data & integrations · Audit.
- **Motion with a job.** Amicro's rules: ease `[0.16, 1, 0.3, 1]`, entrances of 250–400 ms, feedback on every action (toast plus optional haptic on mobile), nothing moving on its own on working screens. Vendor only the MIT registry pieces we use (text reveal, fade-up, magnetic button, tilt card, a dots loader) into `components/amicro/` with attribution. The npm package is not used: it depends on `@google/genai`, `express` and `vite` at runtime. Reduced motion is respected.
- **The dinosaur.** `docs/assets/dinosaur-matrix.png` (5 MB) ships as WebP at 768, 1280 and 2048px (`public/art/`, 90–780 KB) through `next/image`, used for: the landing hero (full bleed, masked into the page), the sign-in side panel, the 404 page, and the social preview (`og.jpg`).

## Screens

| Screen | Change |
| --- | --- |
| Header | Logo, Events, "Your work" (signed in), Verify, API; theme toggle; account menu (Radix DropdownMenu) |
| `/` | Signed in: "Your work" first, then events. Signed out: dinosaur hero, three plain value lines, event cards |
| Event bar | Compact on task pages; full hero only on the gallery |
| Gallery | Radix TextField search with `/` shortcut, SegmentedControl or chips for tracks, cards via Radix Card, clearer empty states |
| Project | Radix DataList for facts, comments with Radix TextArea |
| Submit | Two-column form with section headings; the deadline in words; submit bar sticky at the bottom |
| Judge | Queue and score form without the hero; sliders become Radix Slider or a SegmentedControl for 1–5; totals clearer |
| Vote | Radix Cards, clear per-mode explanation, credit meter via Radix Progress |
| Organizer | Lifecycle rail with next action; regrouped tabs; Radix Table everywhere; Callout for integrity; archive and `archive.zip` in Settings; the outlier-review list in the integrity panel |
| Verify, widget, results | Radix Card, Callout, Table |
| Sign-in, register, invites | Split layout with the dinosaur panel; demo accounts as a compact list |

## Checks

- Task walkthroughs per role, timed through CDP: organizer (find under-reviewed projects, top up, run normalization, publish), judge (score the next project), participant (create team, invite, submit), visitor (find a project, vote).
- axe-core in CDP on every screen: no serious or critical violations.
- 390px and 1440px screenshots of every screen; no horizontal scroll.
- `npm run build` clean; `tests/api/test_api_first.py` green; both acceptance suites green on Docker.

## Status (2026-09-25)

- Every screen in the table above has been rebuilt on Radix. Page agents reviewed each one in CDP screenshots at 1440 and 390 px, light and dark.
- axe-core 4.10 through CDP on 15 screens (4 roles), in both themes: no serious or critical violations. The two it found are fixed: soft avatars were below contrast in light mode (now `highContrast`), and the scrollable offline-verify `<pre>` was not focusable.
- `npm run build` is clean, and `test_api_first.py` is green (61 of 69 documented paths are used by the UI).
- `spec/run.py` 7/7 and `extended.py` 21/21 on a fresh `docker compose up`.
- Fixed in the integration pass: the home screen counted the duplicate's 4 reviews (126), while the dashboard excluded them (122). Both now use `blocked_ids`, and a test asserts that they agree.
- Not done: the walkthroughs were not timed, and there is no automated web test runner. The UI is covered by the API tests, `test_api_first.py` and the live acceptance suite.
