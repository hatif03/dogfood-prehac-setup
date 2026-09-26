# Brief

Source: https://dogfoodhack.com/ (REV 2.6). Distilled for agents. Not a substitute for official `spec.md`.

## Problem

Running a hackathon is a data problem in ten stages: registration, teams, submissions, eligibility, assignment, scoring, normalization, results, certificates, archive. Get one wrong and judging suffers.

Hackathon Raptors has run 35 events since 2023 across 85+ countries. The spec comes from that pipeline.

## Why incumbents are not enough

Devpost, Devfolio, TAIKAI, DoraHacks, HackerEarth, and Unstop converged on the same nine features: event microsite, registration, teams, submission, public gallery, judge scoring, community voting, organizer dashboard, CSV export.

Then they stopped:

- The category leader cannot weight judging criteria. Docs tell organizers to judge in a spreadsheet.
- "Automatic score normalization" is advertised and undocumented.
- Community voting is treated as gameable; advice is small prizes and hidden results.
- **Zero major platforms ship an official public API.** Integrations are scrapers and CSVs.

Open-source pieces exist (Gavel, JunctionApp, Dribdat, Quill, Hibiscus). Nobody assembled a modern, self-hostable, API-first whole an organizer can run on Monday.

## What Dogfood is

One product, four tiers, same spec for every team. Ship MIT or Apache-2.0. They fork the winner, self-host it, credit the team on event pages, and upstream fixes as PRs.

We are not building a demo of a platform. We are building theirs.

## Product we will ship

A portal that starts with `docker compose up`, seeds itself, and takes a project from submission through judging to published results, offline on a laptop.

## Out of scope (scores nothing)

Design mockups / hardcoded frontend; cloud accounts; auth demo that stops at login; gallery without judging or judging without gallery; frontend-only role checks; LLM dump with no architecture; closed source; custom hardware; a rename of an existing open-source platform.
