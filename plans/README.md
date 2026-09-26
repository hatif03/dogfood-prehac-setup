# Plans

Sequenced execution files. Do not start application code until [13-kickoff-reconcile.md](13-kickoff-reconcile.md) is done after official spec/fixtures/suite exist.

| Plan | Title | Depends on |
| --- | --- | --- |
| [00](00-north-star.md) | North star | — |
| [13](13-kickoff-reconcile.md) | Kickoff reconcile | 00 + official files |
| [01](01-stack-and-runtime.md) | Stack and runtime | 13 |
| [02](02-data-model-and-pipeline.md) | Data model | 01 |
| [03](03-t1-core.md) | T1 Core | 02 |
| [04](04-t2-judging.md) | T2 Judging | 03 |
| [05](05-t3-public.md) | T3 Public | 04 |
| [06](06-t4-stretch.md) | T4 Stretch | 05 |
| [07](07-bonus-normalization-proof.md) | Normalization Proof | 04 |
| [08](08-bonus-pairwise-mode.md) | Pairwise Mode | 04 |
| [09](09-bonus-threat-model.md) | Threat Model | 05 |
| [10](10-bonus-api-first.md) | API First | 06 |
| [11](11-adoptability-deliverables.md) | Adoptability | 06–10 as available |
| [12](12-writeup-quest.md) | Write Up Quest | 11 |

Each file uses: Goal, Score impact, Gate, In / Out of scope, Data-model, API/UI, Acceptance hypotheses, Docs, Bonus linkage.

Gates are mandatory. We intend to finish every plan; we do not skip a red gate to start a later stub.
