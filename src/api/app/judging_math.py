"""Pure judging maths. No I/O, no database. The API, the proof generator and the tests all call these.

Estimator: additive judge-leniency model on an incomplete judge x project design

    y_jp = mu + theta_p + b_j + e_jp

fit by penalized least squares (the BLUP of a crossed random-effects model with variance
ratios lambda_judge = s2/tau_b2 and lambda_project = s2/tau_theta2). See JUDGING.md.
"""

from __future__ import annotations

import math
import random
import statistics
from collections import defaultdict
from dataclasses import dataclass

Review = tuple[str, str, float]  # (judge, project, weighted score)

LAMBDA_JUDGE = 2.0
LAMBDA_PROJECT = 1.0
CONSTANT_RATER_MIN_REVIEWS = 3
PRIOR_SIGMA = 0.75  # residual noise on the fixture is ~0.72 on a 1-5 scale
MIN_RESIDUAL_DOF = 5
OUTLIER_Z = 2.5  # a review this many residual SDs from the model is shown to the organizer


def weighted_score(cells: dict[str, float], weights: dict[str, float]) -> float:
    """Weights are normalized here, so callers may pass raw organizer weights."""
    total = sum(weights.values())
    if total <= 0:
        raise ValueError("rubric weights must sum to a positive number")
    return sum(w * float(cells.get(k, 0.0)) for k, w in weights.items()) / total


def constant_raters(reviews: list[Review], min_reviews: int = CONSTANT_RATER_MIN_REVIEWS) -> list[str]:
    """Judges with at least `min_reviews` reviews that are all identical carry no ordinal information."""
    by_judge: dict[str, list[float]] = defaultdict(list)
    for judge, _project, y in reviews:
        by_judge[judge].append(y)
    return sorted(j for j, ys in by_judge.items() if len(ys) >= min_reviews and max(ys) - min(ys) < 1e-9)


@dataclass
class AdditiveFit:
    mu: float
    theta: dict[str, float]
    offsets: dict[str, float]
    sigma: float
    n_reviews: dict[str, int]
    raw_mean: dict[str, float]
    iterations: int
    excluded_judges: list[str]
    residuals: dict[tuple[str, str], float]

    def adjusted(self, project: str) -> float:
        return self.mu + self.theta[project]

    def std_error(self, project: str, lambda_project: float = LAMBDA_PROJECT) -> float:
        # ponytail: ignores uncertainty in the judge offsets; the Monte-Carlo in the proof shows coverage.
        return self.sigma / math.sqrt(self.n_reviews[project] + lambda_project)


def fit_additive(
    reviews: list[Review],
    lambda_judge: float = LAMBDA_JUDGE,
    lambda_project: float = LAMBDA_PROJECT,
    drop_constant: bool = True,
    tol: float = 1e-10,
    max_iter: int = 2000,
) -> AdditiveFit:
    """Gauss-Seidel backfitting. The objective is strictly convex (lambdas > 0), so it converges."""
    if lambda_judge <= 0 or lambda_project <= 0:
        raise ValueError("lambdas must be positive")
    if not reviews:
        return AdditiveFit(0.0, {}, {}, 0.0, {}, {}, 0, [], {})
    all_projects = sorted({p for _, p, _ in reviews})
    raw: dict[str, list[float]] = defaultdict(list)
    for _, p, y in reviews:
        raw[p].append(y)
    excluded = constant_raters(reviews) if drop_constant else []
    used = [r for r in reviews if r[0] not in set(excluded)]
    if not used:
        used, excluded = reviews, []

    by_p: dict[str, list[tuple[str, float]]] = defaultdict(list)
    by_j: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for j, p, y in used:
        by_p[p].append((j, y))
        by_j[j].append((p, y))

    mu = statistics.fmean(y for _, _, y in used) if used else 0.0
    theta = {p: 0.0 for p in all_projects}
    b = {j: 0.0 for j in by_j}
    it = 0
    for it in range(1, max_iter + 1):
        delta = 0.0
        for p, rows in by_p.items():
            new = sum(y - mu - b[j] for j, y in rows) / (len(rows) + lambda_project)
            delta = max(delta, abs(new - theta[p]))
            theta[p] = new
        for j, rows in by_j.items():
            new = sum(y - mu - theta[p] for p, y in rows) / (len(rows) + lambda_judge)
            delta = max(delta, abs(new - b[j]))
            b[j] = new
        new_mu = statistics.fmean(y - theta[p] - b[j] for j, p, y in used)
        delta = max(delta, abs(new_mu - mu))
        mu = new_mu
        if delta < tol:
            break

    residuals = {(j, p): y - mu - theta[p] - b[j] for j, p, y in used}
    resid = list(residuals.values())
    dof = len(used) - len(by_p) - len(by_j) + 1
    sigma = math.sqrt(sum(r * r for r in resid) / dof) if dof > 0 else 0.0
    if dof < MIN_RESIDUAL_DOF:
        # ponytail: too few overlapping reviews to estimate noise; assume the fixture's level
        # rather than report a false +-0. Replace with a pooled estimate across events if needed.
        sigma = max(sigma, PRIOR_SIGMA)
    return AdditiveFit(
        mu=mu,
        theta=theta,
        offsets=b,
        sigma=sigma,
        n_reviews={p: len(by_p.get(p, [])) for p in all_projects},
        raw_mean={p: statistics.fmean(raw[p]) for p in all_projects},
        iterations=it,
        excluded_judges=excluded,
        residuals=residuals,
    )


def rank(scores: dict[str, float], tiebreak: dict[str, float] | None = None) -> dict[str, int]:
    """1 = best. Ties broken by `tiebreak` (higher first), then id, so ranks are deterministic."""
    tb = tiebreak or {}
    ordered = sorted(scores, key=lambda k: (-round(scores[k], 12), -tb.get(k, 0), k))
    return {k: i + 1 for i, k in enumerate(ordered)}


def normalize(
    reviews: list[Review],
    lambda_judge: float = LAMBDA_JUDGE,
    lambda_project: float = LAMBDA_PROJECT,
    drop_constant: bool = True,
) -> dict:
    """Everything a normalization run persists, as plain data."""
    fit = fit_additive(reviews, lambda_judge, lambda_project, drop_constant)
    adjusted = {p: fit.adjusted(p) for p in fit.theta}
    n = {p: float(fit.n_reviews[p]) for p in fit.theta}
    raw_rank = rank(fit.raw_mean, n)
    adj_rank = rank(adjusted, n)
    rows = [
        {
            "project": p,
            "n_reviews": fit.n_reviews[p],
            "raw_mean": fit.raw_mean[p],
            "adjusted": adjusted[p],
            "std_error": fit.std_error(p, lambda_project),
            "raw_rank": raw_rank[p],
            "rank": adj_rank[p],
            "rank_delta": raw_rank[p] - adj_rank[p],
        }
        for p in fit.theta
    ]
    rows.sort(key=lambda r: r["rank"])
    return {
        "method": "additive_judge_offset_ridge",
        "params": {
            "lambda_judge": lambda_judge,
            "lambda_project": lambda_project,
            "drop_constant_raters": drop_constant,
        },
        "mu": fit.mu,
        "sigma": fit.sigma,
        "iterations": fit.iterations,
        "judge_offsets": dict(sorted(fit.offsets.items(), key=lambda kv: kv[1])),
        "excluded_judges": fit.excluded_judges,
        # Candidate collusion or data-entry errors: one judge far from the consensus on one project.
        "outliers": sorted(
            (
                {"judge": j, "project": p, "residual": r, "z": r / fit.sigma}
                for (j, p), r in fit.residuals.items()
                if fit.sigma > 0 and abs(r) / fit.sigma > OUTLIER_Z
            ),
            key=lambda o: -abs(o["z"]),
        ),
        "rows": rows,
    }


def exact_additive(
    reviews: list[Review],
    lambda_judge: float = LAMBDA_JUDGE,
    lambda_project: float = LAMBDA_PROJECT,
) -> tuple[float, dict[str, float], dict[str, float]]:
    """Solve the same penalized least squares by its normal equations (dense Gaussian elimination).

    Independent of the backfitting solver, so tests and the proof can check they agree.
    Unknowns: [mu, theta_1..P, b_1..J]. O((P+J)^3): for checking, not for production.
    """
    projects = sorted({p for _, p, _ in reviews})
    judges = sorted({j for j, _, _ in reviews})
    idx = {("mu", ""): 0, **{("p", p): 1 + i for i, p in enumerate(projects)}, **{("j", j): 1 + len(projects) + i for i, j in enumerate(judges)}}
    n = len(idx)
    A = [[0.0] * n for _ in range(n)]
    rhs = [0.0] * n
    for j, p, y in reviews:
        cols = (0, idx[("p", p)], idx[("j", j)])
        for r in cols:
            rhs[r] += y
            for c in cols:
                A[r][c] += 1.0
    for p in projects:
        A[idx[("p", p)]][idx[("p", p)]] += lambda_project
    for j in judges:
        A[idx[("j", j)]][idx[("j", j)]] += lambda_judge
    # Gaussian elimination with partial pivoting.
    M = [row[:] + [rhs[i]] for i, row in enumerate(A)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        M[col], M[piv] = M[piv], M[col]
        for r in range(n):
            if r != col and M[r][col]:
                f = M[r][col] / M[col][col]
                M[r] = [a - f * b for a, b in zip(M[r], M[col], strict=True)]
    x = [M[i][n] / M[i][i] for i in range(n)]
    return x[0], {p: x[idx[("p", p)]] for p in projects}, {j: x[idx[("j", j)]] for j in judges}


# --- baselines, used by the proof to show what the estimator beats ------------------------------


def raw_means(reviews: list[Review]) -> dict[str, float]:
    by_p: dict[str, list[float]] = defaultdict(list)
    for _, p, y in reviews:
        by_p[p].append(y)
    return {p: statistics.fmean(v) for p, v in by_p.items()}


def zscore_means(reviews: list[Review]) -> dict[str, float]:
    """Per-judge standardization then average: the method most platforms gesture at."""
    by_j: dict[str, list[float]] = defaultdict(list)
    for j, _, y in reviews:
        by_j[j].append(y)
    stats = {}
    for j, ys in by_j.items():
        sd = statistics.pstdev(ys) if len(ys) > 1 else 0.0
        stats[j] = (statistics.fmean(ys), sd)
    by_p: dict[str, list[float]] = defaultdict(list)
    for j, p, y in reviews:
        m, sd = stats[j]
        by_p[p].append((y - m) / sd if sd > 0 else 0.0)
    return {p: statistics.fmean(v) for p, v in by_p.items()}


def kendall_tau(a: dict[str, float], b: dict[str, float]) -> float:
    """Tau-b over the shared keys."""
    keys = sorted(set(a) & set(b))
    conc = disc = ties_a = ties_b = 0
    for i in range(len(keys)):
        for k in range(i + 1, len(keys)):
            da = a[keys[i]] - a[keys[k]]
            db = b[keys[i]] - b[keys[k]]
            if abs(da) < 1e-12 and abs(db) < 1e-12:
                continue
            if abs(da) < 1e-12:
                ties_a += 1
            elif abs(db) < 1e-12:
                ties_b += 1
            elif da * db > 0:
                conc += 1
            else:
                disc += 1
    denom = math.sqrt((conc + disc + ties_a) * (conc + disc + ties_b))
    return (conc - disc) / denom if denom else 0.0


def top_k_overlap(truth: dict[str, float], est: dict[str, float], k: int = 5) -> float:
    top = lambda d: set(sorted(d, key=lambda x: -d[x])[:k])  # noqa: E731
    return len(top(truth) & top(est)) / k


# --- pairwise ------------------------------------------------------------------------------------


def _sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x)) if x >= 0 else math.exp(x) / (1 + math.exp(x))


def _log_sigmoid(x: float) -> float:
    return -math.log1p(math.exp(-x)) if x >= 0 else x - math.log1p(math.exp(x))


def bradley_terry(
    comparisons: list[tuple[str, str]],
    items: list[str] | None = None,
    prior: float = 1.0,
    tol: float = 1e-7,
    max_iter: int = 60,
    weights: list[float] | None = None,
    init: dict[str, float] | None = None,
) -> list[dict]:
    """Bradley-Terry MAP estimate. comparisons = [(winner, loser)].

    Maximizes the penalized log-likelihood

        sum_c w_c log sigmoid(mu_winner - mu_loser)  +  prior * sum_i [mu_i - 2 log(1 + e^mu_i)]

    The second term is `prior` virtual wins and losses against a fixed reference of strength 1:
    it keeps undefeated and winless projects finite and fixes the scale. The objective is
    strictly concave, so the maximum is unique. Solved by Newton's method: the Hessian is a
    weighted graph Laplacian plus a diagonal, so each step is a Jacobi-preconditioned conjugate
    gradient solve in O(pairs), with backtracking so the objective never decreases. (The MM
    algorithm of Hunter 2004 reaches the same optimum but needed thousands of sweeps on the
    weakly connected graphs that track-scoped judging produces; Newton needs a handful.)

    `weights` (one per comparison, default 1) let unreliable judges count for less; `init`
    (log strengths) warm-starts the solve, which EM uses between its steps. `se` is
    1/sqrt of the diagonal of the observed information. Returns best first.
    """
    ids = sorted(set(items or []) | {w for w, _ in comparisons} | {l for _, l in comparisons})
    if not ids:
        return []
    index = {k: i for i, k in enumerate(ids)}
    n = len(ids)
    raw_wins: dict[str, int] = defaultdict(int)
    raw_losses: dict[str, int] = defaultdict(int)
    pair: dict[tuple[int, int], list[float]] = {}
    for (w, l), wt in zip(comparisons, weights or [1.0] * len(comparisons), strict=True):
        raw_wins[w] += 1
        raw_losses[l] += 1
        i, j = index[w], index[l]
        row = pair.setdefault((min(i, j), max(i, j)), [0.0, 0.0])
        row[0 if i < j else 1] += wt  # [wins of the lower index, wins of the higher]
    edges = [(i, j, a, b) for (i, j), (a, b) in pair.items() if a + b > 0]
    mu = [(init or {}).get(k, 0.0) for k in ids]

    def objective(m: list[float]) -> float:
        # log[p/(1+p)^2] = log sigmoid(x) + log sigmoid(-x)
        f = sum(prior * (_log_sigmoid(x) + _log_sigmoid(-x)) for x in m)
        for i, j, a, b in edges:
            d = m[i] - m[j]
            f += a * _log_sigmoid(d) + b * _log_sigmoid(-d)
        return f

    def curvature(m: list[float]) -> tuple[list[float], list[float], list[float]]:
        g = [prior * (1 - 2 * _sigmoid(x)) for x in m]
        diag = [2 * prior * _sigmoid(x) * (1 - _sigmoid(x)) for x in m]
        h_edge = []
        for i, j, a, b in edges:
            s = _sigmoid(m[i] - m[j])
            g[i] += a - (a + b) * s
            g[j] -= a - (a + b) * s
            h = (a + b) * s * (1 - s)
            diag[i] += h
            diag[j] += h
            h_edge.append(h)
        return g, diag, h_edge

    f = objective(mu)
    for _ in range(max_iter):
        g, diag, h_edge = curvature(mu)
        g_max = max(abs(x) for x in g)
        if g_max < tol:
            break

        def neg_hessian(v: list[float]) -> list[float]:
            out = [diag[k] * v[k] for k in range(n)]
            for (i, j, _, _), h in zip(edges, h_edge, strict=True):
                out[i] -= h * v[j]
                out[j] -= h * v[i]
            return out

        step_dir = [0.0] * n
        r = g[:]
        z = [r[k] / diag[k] for k in range(n)]
        d = z[:]
        rz = sum(r[k] * z[k] for k in range(n))
        for _cg in range(4 * n + 10):
            hd = neg_hessian(d)
            alpha = rz / sum(d[k] * hd[k] for k in range(n))
            step_dir = [step_dir[k] + alpha * d[k] for k in range(n)]
            r = [r[k] - alpha * hd[k] for k in range(n)]
            if max(abs(x) for x in r) < max(tol / 10, 1e-8 * g_max):
                break
            z = [r[k] / diag[k] for k in range(n)]
            rz_next = sum(r[k] * z[k] for k in range(n))
            d = [z[k] + (rz_next / rz) * d[k] for k in range(n)]
            rz = rz_next
        decrement = sum(g[k] * step_dir[k] for k in range(n))  # Newton decrement squared
        if decrement / 2 < 1e-12 * max(1.0, abs(f)):
            break  # the objective cannot rise by more than rounding error: at the optimum
        t = 1.0
        while True:  # backtracking; relative slack because f sums ~10^5 terms
            cand = [mu[k] + t * step_dir[k] for k in range(n)]
            fc = objective(cand)
            if fc >= f - 1e-12 * max(1.0, abs(f)) or t < 1e-6:
                break
            t /= 2
        mu, f = cand, fc

    _, diag, _ = curvature(mu)
    out = [
        {"project": k, "mu": mu[i], "se": 1 / math.sqrt(diag[i]), "wins": raw_wins[k], "losses": raw_losses[k]}
        for i, k in enumerate(ids)
    ]
    out.sort(key=lambda r: (-r["mu"], r["project"]))
    return out


def rank_break(reviews: list[Review]) -> list[tuple[str, str]]:
    """Turn each judge's scores into within-judge pairwise wins. Leniency cancels by construction."""
    by_j: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for j, p, y in reviews:
        by_j[j].append((p, y))
    pairs = []
    for rows in by_j.values():
        for i in range(len(rows)):
            for k in range(i + 1, len(rows)):
                (pa, ya), (pb, yb) = rows[i], rows[k]
                if ya > yb:
                    pairs.append((pa, pb))
                elif yb > ya:
                    pairs.append((pb, pa))
    return pairs


if __name__ == "__main__":
    # Smoke check: a +1 lenient judge and a -1 harsh judge on shared projects cancel out.
    truth = {"A": 4.0, "B": 3.0, "C": 2.0}
    revs = [(j, p, v + off) for j, off in (("len", 1.0), ("hard", -1.0)) for p, v in truth.items()]
    res = normalize(revs, drop_constant=False)
    assert [r["project"] for r in res["rows"]] == ["A", "B", "C"], res
    assert res["judge_offsets"]["len"] > 0 > res["judge_offsets"]["hard"]
    bt = bradley_terry([("A", "B"), ("A", "C"), ("B", "C")] * 3)
    assert [r["project"] for r in bt] == ["A", "B", "C"]
    print("ok")
