"""The estimator's defended properties, then the same code on the real fixture."""

import json
import random
from pathlib import Path

from app import judging_math as jm

FIXTURE = json.loads((Path(__file__).parents[2] / "spec" / "fixtures.json").read_text(encoding="utf-8"))


def fixture_reviews():
    return [(s["judge"], s["project"], sum(s["criteria"].values()) / len(s["criteria"])) for s in FIXTURE["scores"]]


def test_offsets_cancel_on_shared_projects():
    truth = {"A": 4.0, "B": 3.0, "C": 2.0}
    reviews = [(j, p, v + off) for j, off in (("lenient", 1.0), ("harsh", -1.0)) for p, v in truth.items()]
    res = jm.normalize(reviews, drop_constant=False)
    assert [r["project"] for r in res["rows"]] == ["A", "B", "C"]
    assert res["judge_offsets"]["lenient"] > 0.5 and res["judge_offsets"]["harsh"] < -0.5


def test_a_project_only_the_lenient_judge_saw_does_not_win_on_leniency():
    # X and Y are equal; only the +1.5 judge saw X. Raw means crown X, the model does not.
    reviews = [("len", "X", 5.0), ("len", "Y", 5.0), ("len", "Z", 3.5), ("harsh", "Y", 2.0), ("harsh", "Z", 0.5), ("mid", "Y", 3.5), ("mid", "Z", 2.0)]
    raw = jm.raw_means(reviews)
    assert max(raw, key=raw.get) == "X"
    res = {r["project"]: r for r in jm.normalize(reviews, drop_constant=False)["rows"]}
    assert res["Y"]["adjusted"] > res["X"]["adjusted"] - 0.3  # X loses its unearned lead


def test_constant_rater_is_excluded_and_reported():
    reviews = [("c", p, 4.0) for p in "ABC"] + [("j", "A", 5.0), ("j", "B", 3.0), ("j", "C", 1.0)]
    res = jm.normalize(reviews)
    assert res["excluded_judges"] == ["c"]
    assert [r["project"] for r in res["rows"]] == ["A", "B", "C"]
    kept = jm.normalize(reviews, drop_constant=False)
    assert kept["excluded_judges"] == []


def test_shrinkage_keeps_thin_evidence_humble():
    reviews = [("j1", "thin", 5.0)] + [(f"j{i}", "thick", 4.6) for i in range(2, 8)] + [(f"j{i}", "base", 3.0) for i in range(1, 8)]
    res = {r["project"]: r for r in jm.normalize(reviews)["rows"]}
    assert res["thin"]["std_error"] > res["thick"]["std_error"]
    assert res["thick"]["rank"] == 1


def test_bradley_terry_recovers_order_and_stays_finite_for_undefeated():
    rng = random.Random(3)
    strength = {"A": 2.0, "B": 1.0, "C": 0.0, "D": -1.0}
    comps = []
    for _ in range(400):
        a, b = rng.sample(sorted(strength), 2)
        p = 1 / (1 + pow(2.718281828, strength[b] - strength[a]))
        comps.append((a, b) if rng.random() < p else (b, a))
    ranking = jm.bradley_terry(comps)
    assert [r["project"] for r in ranking] == ["A", "B", "C", "D"]
    undefeated = jm.bradley_terry([("A", "B")] * 5)
    assert all(abs(r["mu"]) < 10 for r in undefeated)



def test_fixture_constant_rater_and_coverage():
    reviews = fixture_reviews()
    assert "jdg_07" in jm.constant_raters(reviews)  # three reviews, every criterion a 4
    assert "jdg_01" not in jm.constant_raters(reviews)  # one review is not evidence of anything
    res = jm.normalize(reviews)
    assert len(res["rows"]) == len({p for _, p, _ in reviews})
    assert res["iterations"] < 2000
    tau = jm.kendall_tau({r["project"]: r["raw_mean"] for r in res["rows"]}, {r["project"]: r["adjusted"] for r in res["rows"]})
    assert 0.5 < tau < 1.0  # normalization moves ranks, it does not scramble them


def test_proof_simulation_beats_raw_mean():
    from app.proof import simulate

    study = simulate(reps=30, seed=7)
    assert study["additive"]["tau"] > study["raw_mean"]["tau"]
    assert study["additive"]["tau"] > study["zscore"]["tau"]


def test_backfitting_equals_the_exact_normal_equation_solution():
    reviews = [r for r in fixture_reviews() if r[1] != "prj_41"]
    used = [r for r in reviews if r[0] not in jm.constant_raters(reviews)]
    mu, theta, b = jm.exact_additive(used)
    fit = jm.fit_additive(reviews)
    assert abs(fit.mu - mu) < 1e-8
    assert max(abs(fit.theta[p] - v) for p, v in theta.items()) < 1e-8
    assert max(abs(fit.offsets[j] - v) for j, v in b.items()) < 1e-8
