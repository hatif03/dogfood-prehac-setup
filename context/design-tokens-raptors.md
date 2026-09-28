# Design tokens (Raptors-inspired)

Reviewed: pending

Visual reference: [Hackathon Raptors](https://www.raptors.dev/) — editorial dark marketing, numbered sections, poster-like event tiles. **Inspiration only** (no logo or scraped assets).

## Radix Theme (runtime)

| Prop | Value | Notes |
| --- | --- | --- |
| `accentColor` | `amber` | Warm CTA highlight (replaces lime) |
| `grayColor` | `gray` | Neutral chrome (replaces olive) |
| `radius` | `medium` | |
| `panelBackground` | `translucent` | Header / panels |
| Default appearance | `dark` | First visit; `portal-theme` in `localStorage`; Radix `appearance` synced via `components/theme-provider.tsx` |

## Semantic aliases (`globals.css`)

| Token | Maps to | Use |
| --- | --- | --- |
| `--color-bg` | `--color-background` | Page |
| `--color-surface` | `--gray-2` | Cards |
| `--color-surface-2` | `--gray-3` | Nested panels |
| `--color-fg` | `--gray-12` | Body text |
| `--color-muted` | `--gray-11` | Secondary text |
| `--color-line` | `--gray-a5` | Borders |
| `--color-accent` | `--accent-9` | Primary buttons, current step |
| `--color-coral` | `--tomato-9` | Danger / negative delta |

## Dark base (approximate)

| Role | Hex | Radix dark step |
| --- | --- | --- |
| Page background | `#0a0a0b` | `gray-1` |
| Elevated panel | `#141415` | `gray-2` |
| Headline | `#f5f5f6` | `gray-12` |
| Muted body | `#a1a1aa` | `gray-11` |
| Accent fill | amber scale | `accent-9` |

Light mode uses the same Radix scales (automatic).

## Typography

| Role | Family | Source |
| --- | --- | --- |
| UI / body | Geist Sans | `geist/font/sans` |
| Code | Geist Mono | `geist/font/mono` |
| Display (h1, section titles) | Syne | `next/font/google` |

Utilities: `.font-display`, `.section-index` (mono, muted, tracking).

## Editorial patterns

- **Section index:** `01`, `02` in `font-mono text-subtle` above major landing blocks.
- **Poster cards:** strong title, phase pill, `border-line`, subtle hover lift.
- **Dino hero:** `filter: saturate(0.85) contrast(1.05) hue-rotate(-8deg)` + warm overlay on dark.
- **Footer marquee:** marketing only; `prefers-reduced-motion` disables animation.

## Shadow

`--shadow-glow`: soft amber ring for primary CTAs only (not global cards).

## Implementation map

| Area | Files |
| --- | --- |
| Theme default | `src/web/lib/theme.ts`, `app/layout.tsx` |
| Tokens | `app/globals.css` |
| Chrome | `components/logo.tsx`, `site-header.tsx`, `site-footer.tsx` |
| Marketing | `components/home/landing.tsx`, `public/event-card.tsx`, `dino-art.tsx` |
