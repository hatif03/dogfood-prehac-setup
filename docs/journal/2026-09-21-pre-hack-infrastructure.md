# 2026-09-21 — Pre-hack repo infrastructure

Status: draft  
Reviewed: pending

## Purpose

First journal entry. Captures planning decisions so the Write Up Quest is not written from memory.

## What shipped

- Dual-agent constitution (`AGENTS.md`, `CLAUDE.md`)
- Context layer from dogfoodhack.com REV 2.6
- Doc templates and plan group `00`–`13`
- Skills, Cursor rules, stop hook
- No application code (correct: kickoff has not dropped spec/fixtures/suite)

## What we would redo

- Unknown until official spec.md contradicts `context/`

## Bugs found

- None (no product yet)

## Normalization / ranking notes

- Locked intent: robust z-score (median/MAD), not average
- Pairwise as a second mode, original MIT implementation, cite Gavel

## Features cut (and why we do not regret it)

- Keycloak: extra compose service for 72h
- Hosted anything: disqualifies adoptability

## Spec vs plan diffs

- Planning against the public website. Official spec may differ — see `plans/13-kickoff-reconcile.md`

## Open questions

- Exact acceptance suite IDs
- Exact fixture schema
