"""Glue between the database and judging_math. Normalization runs are snapshots, never mutated."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

import math
from collections import Counter, defaultdict

from app import crowd_bt
from app import judging_math as jm
from app.assignment import blocked_ids
from app.models import (
    Criterion,
    Event,
    NormalizationRun,
    NormalizedScore,
    PairwiseComparison,
    PairwiseRun,
    Score,
    ScoreCell,
    Submission,
    User,
)


def weighted(cells: dict[uuid.UUID, float], criteria: list[Criterion]) -> float:
    return jm.weighted_score({str(k): v for k, v in cells.items()}, {str(c.id): c.weight for c in criteria})


def recompute_weighted(db: Session, event: Event) -> int:
    """After the organizer re-weights the rubric, every stored weighted total is recomputed."""
    criteria = event.rubric.criteria if event.rubric else []
    n = 0
    for s in db.query(Score).filter(Score.event_id == event.id):
        s.raw_weighted = weighted({c.criterion_id: c.value for c in s.cells}, criteria)
        n += 1
    return n


def review_rows(
    db: Session, event_id: uuid.UUID, judge_id: uuid.UUID | None = None, project_id: uuid.UUID | None = None
) -> list[dict]:
    """Reviews as plain rows for listings and exports: one joined query plus one query for all cells."""
    q = (
        db.query(
            Score.id, Score.judge_id, User.display_name, User.external_id, Score.submission_id, Submission.title,
            Submission.external_id, Submission.track_id, Score.raw_weighted, Score.comment, Score.submitted, Score.updated_at,
        )
        .join(User, User.id == Score.judge_id)
        .join(Submission, Submission.id == Score.submission_id)
        .filter(Score.event_id == event_id)
    )
    cq = db.query(ScoreCell.score_id, ScoreCell.criterion_id, ScoreCell.value).join(Score, Score.id == ScoreCell.score_id).filter(Score.event_id == event_id)
    if judge_id is not None:
        q, cq = q.filter(Score.judge_id == judge_id), cq.filter(Score.judge_id == judge_id)
    if project_id is not None:
        q, cq = q.filter(Score.submission_id == project_id), cq.filter(Score.submission_id == project_id)
    cells: dict = defaultdict(list)
    for score_id, criterion_id, value in cq:
        cells[score_id].append({"criterion_id": str(criterion_id), "value": value})
    keys = ("id", "judge_id", "judge_name", "judge_external_id", "project_id", "title", "project_external_id", "track_id", "weighted", "comment", "submitted", "updated_at")
    return [{**dict(zip(keys, r, strict=True)), "cells": cells[r[0]]} for r in q]


def review_matrix(db: Session, event_id: uuid.UUID) -> list[jm.Review]:
    blocked = blocked_ids(db, event_id)
    rows = db.query(Score.judge_id, Score.submission_id, Score.raw_weighted).filter(
        Score.event_id == event_id, Score.submitted.is_(True), Score.raw_weighted.is_not(None)
    )
    return [(str(j), str(p), float(y)) for j, p, y in rows if p not in blocked]


def run_normalization(
    db: Session,
    event: Event,
    actor: User | None = None,
    lambda_judge: float = jm.LAMBDA_JUDGE,
    lambda_project: float = jm.LAMBDA_PROJECT,
    drop_constant: bool = True,
) -> NormalizationRun:
    reviews = review_matrix(db, event.id)
    result = jm.normalize(reviews, lambda_judge, lambda_project, drop_constant)
    adjusted = {r["project"]: r["adjusted"] for r in result["rows"]}
    raw = {r["project"]: r["raw_mean"] for r in result["rows"]}
    pairs = jm.rank_break(reviews)
    bt = {r["project"]: r["mu"] for r in jm.bradley_terry(pairs, list(adjusted))}
    run = NormalizationRun(
        event_id=event.id,
        method=result["method"],
        params=result["params"],
        created_by=actor.id if actor else None,
        notes={
            "mu": result["mu"],
            "sigma": result["sigma"],
            "iterations": result["iterations"],
            "reviews_used": len(reviews),
            "judge_offsets": result["judge_offsets"],
            "excluded_judges": result["excluded_judges"],
            "outliers": result["outliers"],
            "cross_check": {
                "method": "Bradley-Terry on within-judge rank-broken pairs",
                "pairs": len(pairs),
                "kendall_tau_bt_vs_adjusted": jm.kendall_tau(adjusted, bt) if pairs else None,
                "kendall_tau_raw_vs_adjusted": jm.kendall_tau(raw, adjusted),
            },
        },
    )
    db.add(run)
    db.flush()
    for r in result["rows"]:
        db.add(
            NormalizedScore(
                run_id=run.id,
                submission_id=uuid.UUID(r["project"]),
                n_reviews=r["n_reviews"],
                raw_mean=r["raw_mean"],
                adjusted=r["adjusted"],
                std_error=r["std_error"],
                raw_rank=r["raw_rank"],
                rank=r["rank"],
                rank_delta=r["rank_delta"],
            )
        )
    db.flush()
    return run


def latest_run(db: Session, event_id: uuid.UUID) -> NormalizationRun | None:
    return (
        db.query(NormalizationRun)
        .filter(NormalizationRun.event_id == event_id)
        .order_by(NormalizationRun.created_at.desc())
        .first()
    )


def fit_pairwise(db: Session, event: Event, prior: float = 1.0) -> PairwiseRun:
    """Two estimates from the same comparisons, both stored:

    - Crowd-BT fitted by EM (the ranking): every judge's reliability eta is estimated jointly with
      the strengths, so random or contrarian judges fade out; order-independent;
    - plain Bradley-Terry and the online Crowd-BT posterior means (what Gavel ranks by), for comparison.
    """
    comps = (
        db.query(PairwiseComparison)
        .filter(PairwiseComparison.event_id == event.id)
        .order_by(PairwiseComparison.created_at, PairwiseComparison.id)
        .all()
    )
    log = [(str(c.judge_id), str(c.winner_id), str(c.loser_id)) for c in comps]
    state = crowd_bt.replay(log)
    judges = sorted({k for k, _, _ in log})
    pairs = [(w, l) for _, w, l in log]
    weighted, eta = crowd_bt.fit_em(log, prior=prior) if log else ([], {})
    plain = {r["project"]: r["mu"] for r in jm.bradley_terry(pairs, prior=prior)} if pairs else {}
    wins, losses = Counter(w for w, _ in pairs), Counter(l for _, l in pairs)
    subs = {str(s.id): s for s in db.query(Submission).filter(Submission.event_id == event.id)}
    names = {str(u.id): u.display_name for u in db.query(User).filter(User.id.in_([uuid.UUID(k) for k in judges]))}
    ranking = [
        {
            "submission_id": r["project"],
            "title": subs[r["project"]].title if r["project"] in subs else "",
            "mu": r["mu"],
            "se": r["se"],
            "wins": wins[r["project"]],
            "losses": losses[r["project"]],
            "crowd_mu": state.mu.get(r["project"], crowd_bt.MU_PRIOR),
            "crowd_sigma": math.sqrt(state.sigma2.get(r["project"], crowd_bt.SIGMA2_PRIOR)),
        }
        for r in weighted
    ]
    weighted_mu = {r["submission_id"]: r["mu"] for r in ranking}
    run = PairwiseRun(
        event_id=event.id,
        method="crowd_bt_em",
        params={
            "prior": prior,
            "comparisons": len(comps),
            "judges": [
                {"judge_id": k, "name": names.get(k, k), "reliability": eta[k], "online_reliability": state.reliability(k), "comparisons": sum(1 for j, _, _ in log if j == k)}
                for k in judges
            ],
            "kendall_tau_weighted_vs_plain": jm.kendall_tau(weighted_mu, plain) if len(weighted_mu) > 1 else None,
            "kendall_tau_weighted_vs_crowd": jm.kendall_tau(weighted_mu, {r["submission_id"]: r["crowd_mu"] for r in ranking}) if len(ranking) > 1 else None,
        },
        ranking=ranking,
    )
    db.add(run)
    db.flush()
    return run
