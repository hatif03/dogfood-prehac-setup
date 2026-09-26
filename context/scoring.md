# Scoring

Each project is rated 1–5 on four weighted criteria. Final ranking is the weighted average across judges.

## Criteria

| Weight | Criterion | What wins |
| --- | --- | --- |
| 40% | Tier completion and correctness | How far the **acceptance suite** says we got. T1 is a gate, not a score. Correctness beats breadth. Honest gap reporting is rewarded. Inflated claims are penalised. |
| 25% | Judging integrity | Backend role isolation, documented defensible normalization, organizer-readable audit trail, vote-abuse engineering. |
| 20% | Adoptability and operability | One command, seeded, stranger-readable docs, migration path in and out, clean license. |
| 15% | Code quality and innovation | Idiomatic FastAPI + Next.js, schema a DBA would defend, one decision a judge would steal (pairwise mode is our candidate). |

T1 is required. A project that does not clear T1 is not judged.

## Honest claims

Declare tiers in `.dogfood.toml`. The acceptance report is the receipt. Claim T3 in README and pass T2 in the report, and we score T2 with a note about the gap. Overclaiming costs more than the tier was worth.

## Bonuses

Optional on the site. We take all four, each as a **finished** artifact gated by its plan. Half-doing all four is the failure mode the brief warns about.

| Challenge | Difficulty | Points | Plan |
| --- | --- | --- | --- |
| Normalization Proof | Hard | +5 | `plans/07-bonus-normalization-proof.md` |
| Pairwise Mode | Hard | +5 | `plans/08-bonus-pairwise-mode.md` |
| Threat Model | Medium | +3 | `plans/09-bonus-threat-model.md` |
| API First | Medium | +3 | `plans/10-bonus-api-first.md` |

Maximum +16 if all four are real.

Site quote we still obey inside the all-four attempt: "1 done properly beats 4 started." Gates in the plan group exist so we do not ship four stubs.

## Category prize

Best Judging Engine ($100): assignment, normalization, isolation, audit trail. T2 + plans 07 and 08 are the path.
