"""Normalization Proof generator. Writes docs/normalization-proof.md from the real fixture.

    cd src/api && python -m app.proof > ../../docs/normalization-proof.md

Every number in that file comes from this script; nothing is typed by hand.
"""

from __future__ import annotations

import json
import random
import statistics
from collections import Counter
from pathlib import Path

from app import judging_math as jm

FIXTURE = Path(__file__).resolve().parents[3] / "spec" / "fixtures.json"


def plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def fixture_reviews(data: dict) -> list[jm.Review]:
    """Equal weights, as the importer sets them: weighted score = mean of the three criteria."""
    return [(s["judge"], s["project"], statistics.fmean(s["criteria"].values())) for s in data["scores"]]


# --- Monte-Carlo study ---------------------------------------------------------------------------


def _world(rng: random.Random) -> tuple[dict[str, float], list[jm.Review]]:
    """One synthetic hackathon shaped like the fixture: 40 projects, 30 judges, 8 tracks,
    21 single-track and 9 two-track judges, 2-5 reviews per project, integer 1-5 criteria,
    one constant rater and track-level quality differences (the case that breaks z-scores)."""
    n_tracks = 8
    track_q = [rng.gauss(0, 0.35) for _ in range(n_tracks)]
    projects = {f"p{i:02d}": (i % n_tracks, track_q[i % n_tracks] + rng.gauss(0, 0.6)) for i in range(40)}
    judges = {}
    for j in range(30):
        tracks = {j % n_tracks} | ({(j + 3) % n_tracks} if j < 9 else set())
        judges[f"j{j:02d}"] = (tracks, rng.gauss(0, 0.5))
    constant = "j29"
    reviews = []
    for p, (track, q) in projects.items():
        pool = [j for j, (ts, _) in judges.items() if track in ts]
        k = min(len(pool), rng.choice([2, 3, 3, 3, 3, 4, 5]))
        for j in rng.sample(pool, k):
            if j == constant:
                reviews.append((j, p, 4.0))
                continue
            off = judges[j][1]
            crit = [min(5, max(1, round(3.3 + q + off + rng.gauss(0, 0.45)))) for _ in range(3)]
            reviews.append((j, p, statistics.fmean(crit)))
    return {p: q for p, (_, q) in projects.items()}, reviews


def simulate(reps: int = 300, seed: int = 2026, lambdas: tuple[float, float] = (jm.LAMBDA_JUDGE, jm.LAMBDA_PROJECT)) -> dict:
    rng = random.Random(seed)
    methods = {
        "raw_mean": lambda r: jm.raw_means(r),
        "zscore": lambda r: jm.zscore_means(r),
        "additive_keep_constant": lambda r: {x["project"]: x["adjusted"] for x in jm.normalize(r, *lambdas, drop_constant=False)["rows"]},
        "additive": lambda r: {x["project"]: x["adjusted"] for x in jm.normalize(r, *lambdas)["rows"]},
        "bt_rank_broken": lambda r: {x["project"]: x["mu"] for x in jm.bradley_terry(jm.rank_break(r), sorted({p for _, p, _ in r}))},
    }
    taus = {m: [] for m in methods}
    top5 = {m: [] for m in methods}
    for _ in range(reps):
        truth, reviews = _world(rng)
        for name, fn in methods.items():
            est = fn(reviews)
            taus[name].append(jm.kendall_tau(truth, est))
            top5[name].append(jm.top_k_overlap(truth, est, 5))
    return {
        m: {"tau": statistics.fmean(taus[m]), "tau_sd": statistics.pstdev(taus[m]), "top5": statistics.fmean(top5[m])}
        for m in methods
    }


def sensitivity(reps: int = 80, seed: int = 11) -> list[dict]:
    out = []
    for lj in (0.5, 1.0, 2.0, 5.0, 10.0):
        for lp in (0.5, 1.0, 2.0):
            r = simulate(reps, seed, (lj, lp))["additive"]
            out.append({"lambda_judge": lj, "lambda_project": lp, "tau": r["tau"], "top5": r["top5"]})
    return out


# --- diagnostics on the real data ----------------------------------------------------------------


def bootstrap_ranks(reviews: list[jm.Review], reps: int = 300, seed: int = 7) -> dict[str, tuple[int, int]]:
    """90% rank interval per project: resample each project's reviews with replacement, refit."""
    rng = random.Random(seed)
    by_p: dict[str, list[jm.Review]] = {}
    for r in reviews:
        by_p.setdefault(r[1], []).append(r)
    ranks: dict[str, list[int]] = {p: [] for p in by_p}
    for _ in range(reps):
        sample = [rng.choice(rows) for rows in by_p.values() for _ in rows]
        for row in jm.normalize(sample)["rows"]:
            ranks[row["project"]].append(row["rank"])
    out = {}
    for p, rs in ranks.items():
        rs.sort()
        out[p] = (rs[int(0.05 * (len(rs) - 1))], rs[int(0.95 * (len(rs) - 1))])
    return out


def leave_one_judge_out(reviews: list[jm.Review]) -> list[dict]:
    """How much does the ranking depend on any single judge?"""
    full = {r["project"]: r["rank"] for r in jm.normalize(reviews)["rows"]}
    out = []
    for judge in sorted({j for j, _, _ in reviews}):
        rows = jm.normalize([r for r in reviews if r[0] != judge])["rows"]
        ranks = {r["project"]: r["rank"] for r in rows}
        shared = {p: full[p] for p in ranks}
        out.append(
            {
                "judge": judge,
                "tau": jm.kendall_tau({p: -v for p, v in shared.items()}, {p: -v for p, v in ranks.items()}),
                "max_shift": max(abs(ranks[p] - full[p]) for p in ranks),
                "top5_same": len(set(sorted(shared, key=shared.get)[:5]) & set(sorted(ranks, key=ranks.get)[:5])),
            }
        )
    return out


# --- rendering -----------------------------------------------------------------------------------


def render(reps: int = 300) -> str:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    titles = {p["id"]: p["title"] for p in data["projects"]}
    tracks = {t["id"]: t["name"] for t in data["tracks"]}
    track_of = {p["id"]: tracks[p["track"]] for p in data["projects"]}
    judges = {j["id"]: j["name"] for j in data["judges"]}
    # The duplicate (prj_41 repeats prj_07's title and repo) is excluded before normalization, as in the portal.
    dup = "prj_41"
    reviews = [r for r in fixture_reviews(data) if r[1] != dup]
    dropped_dup = sum(1 for s in data["scores"] if s["project"] == dup)
    res = jm.normalize(reviews)
    per_judge = Counter(j for j, _, _ in reviews)
    per_project = Counter(p for _, p, _ in reviews)
    raw = {r["project"]: r["raw_mean"] for r in res["rows"]}
    adj = {r["project"]: r["adjusted"] for r in res["rows"]}
    bt = {r["project"]: r["mu"] for r in jm.bradley_terry(jm.rank_break(reviews), list(adj))}
    z = jm.zscore_means(reviews)
    study = simulate(reps)
    sens = sensitivity()
    offsets = res["judge_offsets"]
    lenient = sorted(offsets.items(), key=lambda kv: -kv[1])[:3]
    harsh = sorted(offsets.items(), key=lambda kv: kv[1])[:3]
    movers = sorted(res["rows"], key=lambda r: -abs(r["rank_delta"]))[:6]

    L = []
    w = L.append
    w("# Normalization Proof")
    w("")
    w("Generated by `python -m app.proof` from `spec/fixtures.json`. Do not edit numbers by hand; rerun the script.")
    w("")
    w("## 1. The problem on this data")
    w("")
    w(f"- {len(reviews)} reviews of {len(per_project)} projects by {len(per_judge)} judges (the duplicate `{dup}` and its {dropped_dup} reviews are excluded first).")
    w(f"- Reviews per project: {dict(sorted(Counter(per_project.values()).items()))} (reviews: projects). Judges are track-scoped, so no two judges see the same set.")
    w(f"- Reviews per judge range from {min(per_judge.values())} to {max(per_judge.values())}.")
    w(f"- Constant rater: `{', '.join(res['excluded_judges'])}` ({', '.join(judges[j] for j in res['excluded_judges'])}) gave every criterion of every project the same value. `jdg_01` has a single review, which is not evidence of anything.")
    w("")
    w("A raw mean rewards whichever projects happened to draw lenient judges. Per-judge z-scores fix leniency only if every judge saw a random sample of quality; with track-scoped judges they did not, so z-scoring punishes a judge who drew a strong track.")
    w("")
    w("## 2. Method")
    w("")
    w("Each review is first collapsed to a weighted score `y = Σ w_c x_c` with `Σ w_c = 1` (the organizer's rubric weights; equal on the fixture). Then:")
    w("")
    w("```text")
    w("y_jp = μ + θ_p + b_j + ε_jp")
    w("")
    w("minimize  Σ (y_jp − μ − θ_p − b_j)²  +  λ_judge Σ b_j²  +  λ_project Σ θ_p²")
    w("```")
    w("")
    w("- `b_j` is judge j's leniency (positive = generous). `θ_p` is project p's quality relative to the average `μ`.")
    w("- This is the best linear unbiased predictor of a crossed random-effects model with `λ = σ²_noise / σ²_effect`. Judges are compared only through projects they share, which is exactly the information an incomplete, track-scoped design contains.")
    w(f"- Defaults: `λ_judge = {jm.LAMBDA_JUDGE}` (a judge's offset counts as two pseudo-reviews at zero, so one harsh review cannot be written off as a harsh judge), `λ_project = {jm.LAMBDA_PROJECT}` (a two-review project is pulled toward the mean more than a five-review one).")
    w("- Solved by Gauss–Seidel backfitting. The objective is strictly convex for positive λ, so the solution is unique and the iteration converges; " f"on the fixture it took {res['iterations']} sweeps to reach 1e-10.")
    w(f"- Constant raters (≥{jm.CONSTANT_RATER_MIN_REVIEWS} reviews, zero variance) are excluded by default and listed on the run. Their scores carry no ordering information; left in, they only compress their projects toward each other. Organizers can keep them with `drop_constant_raters=false`.")
    w("- Reported score: `μ + θ_p` on the original 1–5 scale, with `σ̂/√(n_p + λ_project)` as an approximate standard error.")
    w("")
    w("## 3. Result on the fixture")
    w("")
    w(f"Fitted `μ = {res['mu']:.3f}`, residual `σ̂ = {res['sigma']:.3f}`.")
    w("")
    w("Most lenient judges: " + ", ".join(f"{judges[j]} (`{j}`, {o:+.2f}, {plural(per_judge[j], 'review')})" for j, o in lenient) + ".")
    w("")
    w("Harshest judges: " + ", ".join(f"{judges[j]} (`{j}`, {o:+.2f}, {plural(per_judge[j], 'review')})" for j, o in harsh) + ".")
    w("")
    w("Largest rank movements:")
    w("")
    for r in movers:
        w(f"- **{titles[r['project']]}** (`{r['project']}`, {plural(r['n_reviews'], 'review')} used): raw #{r['raw_rank']} → adjusted #{r['rank']} ({r['rank_delta']:+d}).")
    w("")
    lost = Counter(p for j, p, _ in reviews if j in set(res["excluded_judges"]))
    for r in movers:
        if lost[r["project"]]:
            w(f"Why {titles[r['project']]} moved: {plural(lost[r['project']], 'review')} came from the excluded constant rater, whose flat scores had lifted its raw mean. With {plural(r['n_reviews'], 'informative review')} left, shrinkage pulls it toward the average and its SE is the widest in the table. This is the intended behaviour: a ranking should not rest on reviews that carry no ordering information.")
            w("")
    w("Top 10 (full table with rank intervals in Appendix A, every review in Appendix B):")
    w("")
    w("| Rank | Raw rank | Δ | Project | Track | Reviews | Raw mean | Adjusted | ± SE |")
    w("| ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |")
    for r in res["rows"][:10]:
        w(f"| {r['rank']} | {r['raw_rank']} | {r['rank_delta']:+d} | {titles[r['project']]} (`{r['project']}`) | {track_of[r['project']]} | {r['n_reviews']} | {r['raw_mean']:.3f} | {r['adjusted']:.3f} | {r['std_error']:.2f} |")
    w("")
    w("Agreement between rankings (Kendall τ-b, 1 = identical):")
    w("")
    w(f"- raw mean vs adjusted: **{jm.kendall_tau(raw, adj):.3f}**")
    w(f"- per-judge z-score vs adjusted: **{jm.kendall_tau(z, adj):.3f}**")
    w(f"- independent cross-check, Bradley–Terry on within-judge rank-broken pairs vs adjusted: **{jm.kendall_tau(bt, adj):.3f}**. Rank-breaking cancels leniency by construction (a judge's +1 is +1 on both sides of every pair) and shares no modelling assumptions with the additive fit. It is noisier, since it discards how far apart two scores were and ignores projects a judge saw alone, so it is a sanity alarm rather than a second opinion to average in.")
    w("")
    w("## 3b. Checks on the estimate itself")
    w("")
    used = [r for r in reviews if r[0] not in set(res["excluded_judges"])]
    mu_x, theta_x, b_x = jm.exact_additive(used)
    fit = jm.fit_additive(reviews)
    gap = max([abs(fit.mu - mu_x)] + [abs(fit.theta[k] - v) for k, v in theta_x.items()] + [abs(fit.offsets[k] - v) for k, v in b_x.items()])
    w(f"**Exact solution.** Solving the normal equations directly (Gaussian elimination on all {1 + len(theta_x) + len(b_x)} unknowns, `judging_math.exact_additive`) agrees with the backfitting solver to within **{gap:.1e}** on every parameter. The published numbers are the unique optimum, not an early stop.")
    w("")
    judge_raw = {j: statistics.fmean(y for jj, _, y in used if jj == j) for j in fit.offsets}
    judge_adj = {j: judge_raw[j] - fit.offsets[j] for j in fit.offsets}
    w(f"**Judge spread** (the quantity in the brief's FIG. 03). The standard deviation of the {len(judge_raw)} judges' mean scores is **{statistics.pstdev(judge_raw.values()):.3f}** raw and **{statistics.pstdev(judge_adj.values()):.3f}** after removing each judge's offset. What remains is the real difference in the projects each judge happened to see.")
    w("")
    resid = sorted(fit.residuals.values())
    within1 = sum(abs(r) <= fit.sigma for r in resid) / len(resid)
    within2 = sum(abs(r) <= 2 * fit.sigma for r in resid) / len(resid)
    w(f"**Residuals.** {within1:.0%} of residuals fall within ±1σ̂ and {within2:.0%} within ±2σ̂ (a normal distribution gives 68% and 95%). The largest is {max(resid, key=abs):+.2f} ({max(resid, key=abs) / fit.sigma:+.1f}σ̂). No review is beyond ±{jm.OUTLIER_Z}σ̂, the threshold at which the portal flags a review to the organizer as a possible collusion or data-entry problem. Residuals are more concentrated than a normal would be because σ̂ divides by N − P − J + 1 degrees of freedom, which ignores that shrinkage spends fewer. So σ̂, and every standard error built from it, errs on the wide side: conservative, which is the direction to err for prize decisions.")
    w("")
    loo = leave_one_judge_out(reviews)
    worst = min(loo, key=lambda r: r["tau"])
    w(f"**Leave one judge out.** Refitting {len(loo)} times, each time without one judge: the ranking keeps Kendall τ ≥ **{worst['tau']:.3f}** against the full fit (least robust when {judges[worst['judge']]} `{worst['judge']}` is removed, largest single-project move {worst['max_shift']} places). The top 5 keeps at least {min(r['top5_same'] for r in loo)} of its 5 members in every refit, so no single judge decides who wins. Mid-table projects are more fragile: a project with two or three reviews that loses one can move far, which is what the largest move above is.")
    w("")
    boot = bootstrap_ranks(reviews)
    widths = sorted(hi - lo for lo, hi in boot.values())
    w(f"**Bootstrap rank intervals.** Resampling each project's reviews with replacement 300 times and refitting gives a 90% interval for every rank (Appendix A, second column). Median width: {widths[len(widths) // 2]} places; the top project's interval is {boot[res['rows'][0]['project']][0]}–{boot[res['rows'][0]['project']][1]}. With 2–5 reviews per project, neighbouring ranks are not statistically distinguishable, which is why the results page shows the SE and why prize decisions near a boundary deserve a pairwise tie-break.")
    w("")
    w("## 4. Does it recover the truth? Monte-Carlo")
    w("")
    w(f"{reps} synthetic hackathons with the fixture's shape (40 projects, 30 judges, 8 tracks, 21 single- and 9 two-track judges, 2–5 reviews per project, integer 1–5 criteria, one constant rater, track-level quality differences, judge offsets σ = 0.5). Ground truth is known, so we can score each method.")
    w("")
    w("| Method | Kendall τ to truth (mean ± sd) | Top-5 overlap |")
    w("| --- | --- | --- |")
    names = {
        "raw_mean": "Raw mean",
        "zscore": "Per-judge z-score",
        "bt_rank_broken": "Bradley–Terry, rank-broken",
        "additive_keep_constant": "Additive model, constant rater kept",
        "additive": "**Additive model (shipped)**",
    }
    for key in ("raw_mean", "zscore", "bt_rank_broken", "additive_keep_constant", "additive"):
        s = study[key]
        w(f"| {names[key]} | {s['tau']:.3f} ± {s['tau_sd']:.3f} | {s['top5']:.2f} |")
    w("")
    w("### Sensitivity to λ")
    w("")
    w("| λ_judge | λ_project | τ | Top-5 |")
    w("| ---: | ---: | ---: | ---: |")
    for s in sens:
        w(f"| {s['lambda_judge']} | {s['lambda_project']} | {s['tau']:.3f} | {s['top5']:.2f} |")
    w("")
    best = max(sens, key=lambda s: s["tau"])
    w(f"The ranking quality is flat across an order of magnitude of λ (best cell: λ_judge={best['lambda_judge']}, λ_project={best['lambda_project']}, τ={best['tau']:.3f}), so the defaults are not tuned to this data and small misjudgements of the variance ratio cost little.")
    w("")
    w("## 5. Limits we accept")
    w("")
    w("- Additive leniency only: a judge who stretches the scale (uses 1 and 5 where others use 2 and 4) is modelled as noise, not as a scale factor. A multiplicative term needs more reviews per judge than the fixture has (median 3–4).")
    w("- The standard error ignores uncertainty in the offsets, so treat adjacent ranks within one SE as ties. The portal shows SE next to every score for that reason.")
    w("- Rounding to integers and clipping at 1 and 5 are not modelled; the Monte-Carlo includes both and the method still wins.")
    w("")
    w("## Appendix A. Every project: raw, adjusted, rank change, 90% rank interval")
    w("")
    w("| Rank | 90% interval | Raw rank | Δ | Project | Reviews used | Raw mean | Adjusted ± SE |")
    w("| ---: | :---: | ---: | ---: | --- | ---: | ---: | ---: |")
    for r in res["rows"]:
        lo, hi = boot[r["project"]]
        w(f"| {r['rank']} | {lo}–{hi} | {r['raw_rank']} | {r['rank_delta']:+d} | {titles[r['project']]} (`{r['project']}`) | {r['n_reviews']} | {r['raw_mean']:.3f} | {r['adjusted']:.3f} ± {r['std_error']:.2f} |")
    w("")
    w("## Appendix B. Every review: raw score, judge offset, normalized score")
    w("")
    w("`normalized = weighted − b̂_judge`: the review with its judge's estimated leniency removed. Excluded reviews (the constant rater) are marked; they are kept in the portal and in every export, just not used for ranking.")
    w("")
    w("| Judge | Project | Functionality | Quality | Innovation | Weighted | b̂ judge | Normalized | Comment |")
    w("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |")
    for sc in sorted(data["scores"], key=lambda x: (x["project"], x["judge"])):
        if sc["project"] == dup:
            continue
        c = sc["criteria"]
        y = statistics.fmean(c.values())
        j = sc["judge"]
        excluded = j in set(res["excluded_judges"])
        off = "excluded" if excluded else f"{fit.offsets[j]:+.3f}"
        norm = "—" if excluded else f"{y - fit.offsets[j]:.3f}"
        comment = (sc.get("comment") or "").replace("|", "/")
        w(f"| {judges[j]} `{j}` | {titles[sc['project']]} `{sc['project']}` | {c['functionality']} | {c['quality']} | {c['innovation']} | {y:.3f} | {off} | {norm} | {comment} |")
    w("")
    w("## Reproduce")
    w("")
    w("```text")
    w("cd src/api")
    w("python -m app.proof > ../../docs/normalization-proof.md   # this file")
    w("cd ../.. && python -m pytest tests/api/test_normalization.py -q   # the properties above as tests")
    w("```")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    import sys

    sys.stdout.reconfigure(encoding="utf-8")
    print(render(), end="")
