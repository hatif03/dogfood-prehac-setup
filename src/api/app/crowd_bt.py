"""Crowd-BT: Bradley-Terry with per-judge reliability, updated online, plus active pair selection.

Model (Chen, Bennett, Collins-Thompson, Horvitz, 2013, "Pairwise ranking aggregation in a
crowdsourced setting", WSDM). Item i has strength s_i ~ N(mu_i, sigma2_i). Judge k is reliable
with probability eta_k ~ Beta(alpha_k, beta_k): a reliable judge follows Bradley-Terry,
an unreliable one reports the opposite. After each comparison the posterior is projected
back onto that family by moment matching, so every update is O(1).

Gavel (Athalye, 2016) runs this model online and picks pairs by expected information gain.
We implement both from the paper, but rank with `fit_em` (the same likelihood fitted to the
whole log at once) and pick pairs by balanced coverage, because that combination measured
better on a simulated expo (docs/pairwise.md). Independent implementation; no Gavel code.

State is never stored: `replay` rebuilds it from the ordered comparison log, so the ranking is
a pure function of the audit trail.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

GAMMA = 0.1  # weight of judge-reliability information in the gain
KAPPA = 1e-4  # keeps variances positive
MU_PRIOR, SIGMA2_PRIOR = 0.0, 1.0
ALPHA_PRIOR, BETA_PRIOR = 10.0, 1.0  # judges start out presumed reliable (mean 0.91)
EPSILON = 0.25  # Gavel baseline: share of random picks
MIN_VIEWS = 2  # Gavel baseline: under-seen projects first


def digamma(x: float) -> float:
    """psi(x) for x > 0: recurrence up to x >= 10, then the asymptotic series (error < 1e-12)."""
    result = 0.0
    while x < 10:
        result -= 1 / x
        x += 1
    inv2 = 1 / (x * x)
    series = inv2 * (1 / 12 - inv2 * (1 / 120 - inv2 * (1 / 252 - inv2 * (1 / 240 - inv2 / 132))))
    return result + math.log(x) - 0.5 / x - series


def betaln(a: float, b: float) -> float:
    return math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)


def kl_gaussian(mu1: float, s1: float, mu0: float, s0: float) -> float:
    ratio = s1 / s0
    return (mu1 - mu0) ** 2 / (2 * s0) + (ratio - 1 - math.log(ratio)) / 2


def kl_beta(a1: float, b1: float, a0: float, b0: float) -> float:
    return (
        betaln(a0, b0) - betaln(a1, b1)
        + (a1 - a0) * digamma(a1) + (b1 - b0) * digamma(b1)
        + (a0 - a1 + b0 - b1) * digamma(a1 + b1)
    )


def _judge_update(a: float, b: float, mu_w: float, s_w: float, mu_l: float, s_l: float) -> tuple[float, float, float]:
    """Moment-matched Beta posterior for the judge, and c = P(observing 'w beats l')."""
    ew, el = math.exp(mu_w), math.exp(mu_l)
    # P(w > l) under the item posteriors, to second order in the variances.
    c1 = ew / (ew + el) + 0.5 * (s_w + s_l) * ew * el * (el - ew) / (ew + el) ** 3
    c2 = 1 - c1
    c = (c1 * a + c2 * b) / (a + b)
    m1 = (c1 * (a + 1) * a + c2 * a * b) / (c * (a + b + 1) * (a + b))
    m2 = (c1 * (a + 2) * (a + 1) * a + c2 * (a + 1) * a * b) / (c * (a + b + 2) * (a + b + 1) * (a + b))
    var = m2 - m1 * m1
    return (m1 - m2) * m1 / var, (m1 - m2) * (1 - m1) / var, c


def _item_update(a: float, b: float, mu_w: float, s_w: float, mu_l: float, s_l: float) -> tuple[float, float, float, float]:
    ew, el = math.exp(mu_w), math.exp(mu_l)
    grad = a * ew / (a * ew + b * el) - ew / (ew + el)
    curv = a * ew * b * el / (a * ew + b * el) ** 2 - ew * el / (ew + el) ** 2
    return (
        mu_w + s_w * grad,
        s_w * max(1 + s_w * curv, KAPPA),
        mu_l - s_l * grad,
        s_l * max(1 + s_l * curv, KAPPA),
    )


@dataclass
class State:
    mu: dict[str, float] = field(default_factory=dict)
    sigma2: dict[str, float] = field(default_factory=dict)
    alpha: dict[str, float] = field(default_factory=dict)
    beta: dict[str, float] = field(default_factory=dict)
    views: dict[str, int] = field(default_factory=dict)

    def item(self, i: str) -> tuple[float, float]:
        return self.mu.get(i, MU_PRIOR), self.sigma2.get(i, SIGMA2_PRIOR)

    def judge(self, k: str) -> tuple[float, float]:
        return self.alpha.get(k, ALPHA_PRIOR), self.beta.get(k, BETA_PRIOR)

    def reliability(self, k: str) -> float:
        a, b = self.judge(k)
        return a / (a + b)

    def observe(self, judge: str, winner: str, loser: str) -> None:
        a, b = self.judge(judge)
        mw, sw = self.item(winner)
        ml, sl = self.item(loser)
        na, nb, _ = _judge_update(a, b, mw, sw, ml, sl)
        mw2, sw2, ml2, sl2 = _item_update(a, b, mw, sw, ml, sl)
        self.alpha[judge], self.beta[judge] = na, nb
        self.mu[winner], self.sigma2[winner] = mw2, sw2
        self.mu[loser], self.sigma2[loser] = ml2, sl2
        self.views[winner] = self.views.get(winner, 0) + 1
        self.views[loser] = self.views.get(loser, 0) + 1


def replay(comparisons: list[tuple[str, str, str]]) -> State:
    """comparisons in time order: (judge, winner, loser)."""
    state = State()
    for judge, winner, loser in comparisons:
        state.observe(judge, winner, loser)
    return state


def expected_information_gain(state: State, judge: str, i: str, j: str) -> float:
    a, b = state.judge(judge)
    mi, si = state.item(i)
    mj, sj = state.item(j)
    total = 0.0
    for (mw, sw), (ml, sl) in (((mi, si), (mj, sj)), ((mj, sj), (mi, si))):
        na, nb, p = _judge_update(a, b, mw, sw, ml, sl)
        mw2, sw2, ml2, sl2 = _item_update(a, b, mw, sw, ml, sl)
        total += p * (kl_gaussian(mw2, sw2, mw, sw) + kl_gaussian(ml2, sl2, ml, sl) + GAMMA * kl_beta(na, nb, a, b))
    return total


def choose_pair(
    items: list[str],
    counts: dict[str, int],
    seen: set[tuple[str, str]],
    rng: random.Random,
) -> tuple[str, str] | None:
    """Balanced coverage: the least-compared project, against a partner this judge has not paired it with.

    Chosen over Gavel's rule (keep the judge's last pick, add the partner with the most expected
    information gain) because on a simulated expo it ranked better and, crucially, still lets
    the EM fit tell honest judges from random and contrarian ones: maximally uncertain pairs
    produce answers that say nothing about the judge. Numbers in docs/pairwise.md.
    """
    order = sorted(items, key=lambda i: (counts.get(i, 0), rng.random()))
    for a in order:
        partners = [x for x in items if x != a and tuple(sorted((a, x))) not in seen]
        if partners:
            b = rng.choice(partners)
            return (a, b) if rng.random() < 0.5 else (b, a)
    return None


def choose_pair_gavel(state: State, judge: str, items: list[str], anchor: str | None, seen: set[tuple[str, str]], rng: random.Random) -> tuple[str, str] | None:
    """Gavel's selection rule, kept as the baseline the proof measures against."""
    if len(items) < 2:
        return None
    if anchor not in items:
        anchor = max(items, key=lambda i: (state.item(i)[1], rng.random()))
    candidates = [x for x in items if x != anchor and tuple(sorted((anchor, x))) not in seen]
    if not candidates:
        return choose_pair(items, state.views, seen, rng)
    under_seen = [x for x in candidates if state.views.get(x, 0) < MIN_VIEWS]
    pool = under_seen or candidates
    rng.shuffle(pool)
    other = pool[0] if rng.random() < EPSILON else max(pool, key=lambda x: expected_information_gain(state, judge, anchor, x))
    return (anchor, other) if rng.random() < 0.5 else (other, anchor)


def reliability_weights(state: State, judges: list[str]) -> dict[str, float]:
    """Online weights, 2*eta - 1 floored at 0 (kept for comparison; the ranking uses `fit_em`)."""
    return {k: max(0.0, 2 * state.reliability(k) - 1) for k in judges}


def fit_em(
    log: list[tuple[str, str, str]],
    items: list[str] | None = None,
    prior: float = 1.0,
    alpha0: float = 2.0,
    beta0: float = 1.0,
    iters: int = 200,
    tol: float = 1e-6,
) -> tuple[list[dict], dict[str, float]]:
    """Batch Crowd-BT by EM: the same model as the online filter, fitted to the whole log at once.

    Each comparison c by judge k hides whether k answered truthfully (probability eta_k) or
    inverted. E-step: r_c = eta_k p_c / (eta_k p_c + (1 - eta_k)(1 - p_c)), with p_c the model's
    P(winner beats loser). M-step: strengths by the Bradley-Terry MAP fit with soft wins (r_c for the
    reported winner, 1 - r_c for the reported loser); eta_k = (sum r_c + alpha0 - 1) /
    (n_k + alpha0 + beta0 - 2), the MAP under a Beta(2, 1) prior that leans slightly to "honest".
    The likelihood never decreases, the result does not depend on vote order, and a judge who
    answers at random ends near 0.5 and a contrarian near 0.
    """
    from app import judging_math as jm

    judges = sorted({k for k, _, _ in log})
    eta = {k: 0.9 for k in judges}  # start: everyone mostly honest
    mu: dict[str, float] = {}
    for _ in range(iters):
        resp = _resp(log, mu, eta)
        fit = jm.bradley_terry(
            [(w, l) for _, w, l in log] + [(l, w) for _, w, l in log],
            items,
            prior=prior,
            weights=resp + [1 - r for r in resp],
            init=mu,
        )
        new_mu = {r["project"]: r["mu"] for r in fit}
        resp = _resp(log, new_mu, eta)
        new_eta = {}
        for k in judges:
            rs = [r for (j, _, _), r in zip(log, resp, strict=True) if j == k]
            new_eta[k] = (sum(rs) + alpha0 - 1) / (len(rs) + alpha0 + beta0 - 2)
        change = max([abs(new_eta[k] - eta[k]) for k in judges] + [abs(new_mu[i] - mu.get(i, 0.0)) for i in new_mu])
        mu, eta = new_mu, new_eta
        if change < tol:
            break
    return fit, eta


def _resp(log: list[tuple[str, str, str]], mu: dict[str, float], eta: dict[str, float]) -> list[float]:
    out = []
    for k, w, l in log:
        p = 1 / (1 + math.exp(mu.get(l, 0.0) - mu.get(w, 0.0)))
        num = eta[k] * p
        out.append(num / (num + (1 - eta[k]) * (1 - p)))
    return out


if __name__ == "__main__":
    # Self-check: digamma against known values, and a reliable judge ranks a clear order correctly.
    assert abs(digamma(1.0) + 0.5772156649) < 1e-8
    assert abs(digamma(0.5) + 1.9635100260) < 1e-8
    s = replay([("k", "A", "B"), ("k", "B", "C"), ("k", "A", "C")] * 5)
    assert s.mu["A"] > s.mu["B"] > s.mu["C"], s.mu
    assert s.reliability("k") > 0.9
    liar = replay([("good", "A", "B")] * 8 + [("liar", "B", "A")] * 8)
    assert liar.reliability("liar") < liar.reliability("good")
    print("ok")
