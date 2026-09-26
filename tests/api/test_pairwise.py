"""Pairwise mode: Crowd-BT maths, active selection, and a full pairwise event through the API."""

import math
import random

from app import crowd_bt
from app import judging_math as jm
from conftest import login, register

E = "/v1/events/pw-hack"


def test_digamma_and_kl_are_exact_enough():
    assert abs(crowd_bt.digamma(1.0) + 0.5772156649015329) < 1e-9
    assert abs(crowd_bt.digamma(10.0) - 2.251752589066721) < 1e-9
    assert crowd_bt.kl_gaussian(0, 1, 0, 1) == 0
    assert abs(crowd_bt.kl_beta(3, 4, 3, 4)) < 1e-12


def test_crowd_bt_learns_order_and_flags_a_contrarian():
    truth = {p: s for p, s in zip("ABCDEF", (2.0, 1.2, 0.6, 0.0, -0.8, -1.5))}
    rng = random.Random(4)
    log = []
    for _ in range(300):
        a, b = rng.sample(sorted(truth), 2)
        p = 1 / (1 + math.exp(truth[b] - truth[a]))
        honest = (a, b) if rng.random() < p else (b, a)
        judge = rng.choice(["h1", "h2", "h3", "liar"])
        w, l = honest if judge != "liar" else honest[::-1]
        log.append((judge, w, l))
    fit, eta = crowd_bt.fit_em(log)
    assert eta["liar"] < 0.3 and min(eta[k] for k in ("h1", "h2", "h3")) > 0.9
    plain = jm.bradley_terry([(w, l) for _, w, l in log])
    tau = lambda r: jm.kendall_tau(truth, {x["project"]: x["mu"] for x in r})  # noqa: E731
    assert tau(fit) >= 0.8 and tau(fit) > tau(plain)  # the contrarian's votes stop counting


def test_choose_pair_balances_coverage_and_never_repeats():
    rng = random.Random(0)
    counts = {"A": 5, "B": 5, "C": 0, "D": 1}
    for _ in range(20):
        pair = crowd_bt.choose_pair(["A", "B", "C", "D"], counts, {("A", "B")}, rng)
        assert "C" in pair  # the least-compared project is always in the next pair
    all_seen = {("A", "B")}
    assert crowd_bt.choose_pair(["A", "B"], {}, all_seen, rng) is None


def test_em_never_decreases_the_likelihood():
    rng = random.Random(9)
    log = [(rng.choice("abc"), *rng.sample("PQRS", 2)) for _ in range(60)]
    lls = []
    for iters in (1, 3, 10, 50):
        fit, eta = crowd_bt.fit_em(log, iters=iters)
        mu = {r["project"]: r["mu"] for r in fit}
        ll = 0.0
        for k, w, l in log:
            p = 1 / (1 + math.exp(mu[l] - mu[w]))
            ll += math.log(eta[k] * p + (1 - eta[k]) * (1 - p))
        lls.append(ll)
    assert all(b >= a - 1e-6 for a, b in zip(lls, lls[1:]))


def test_weighted_bt_is_at_the_likelihood_optimum():
    comps = [("A", "B")] * 6 + [("B", "A")] * 2 + [("B", "C")] * 5 + [("C", "B")] * 3 + [("A", "C")] * 4
    fit = {r["project"]: r["mu"] for r in jm.bradley_terry(comps, prior=1.0, tol=1e-13)}
    items = sorted(fit)

    def loglik(mu):
        ll = sum(-math.log1p(math.exp(mu[l] - mu[w])) for w, l in comps)
        return ll + sum(mu[i] - 2 * math.log1p(math.exp(mu[i])) for i in items)  # prior=1 vs a reference at 0

    base = loglik(fit)
    for i in items:  # nudging any strength never improves the penalized likelihood
        for d in (-1e-3, 1e-3):
            nudged = {k: v + (d if k == i else 0) for k, v in fit.items()}
            assert loglik(nudged) <= base + 1e-9


def _pairwise_event(client):
    register(client, "pw-org@example.com")
    ev = client.post("/v1/events", json={"name": "PW", "slug": "pw-hack", "judging_mode": "pairwise", "submissions_deadline": "2030-01-01T00:00:00Z", "tracks": [{"name": "All"}]}).json()
    track = ev["tracks"][0]["id"]
    for i, title in enumerate(["Best", "Good", "Fine", "Weak"]):
        register(client, f"pw-p{i}@example.com")
        client.post(f"{E}/teams", json={"name": f"T{i}"})
        sid = client.post(f"{E}/projects", json={"title": title, "summary": "s", "track_id": track}).json()["id"]
        client.post(f"{E}/projects/{sid}/submit")
    for j in ("pw-j1", "pw-j2", "pw-liar"):
        register(client, f"{j}@example.com")
    login(client, "pw-org@example.com")
    for j in ("pw-j1", "pw-j2", "pw-liar"):
        client.post(f"{E}/roles", json={"user_email": f"{j}@example.com", "role": "judge"})
    return {"Best": 3, "Good": 2, "Fine": 1, "Weak": 0}


def test_pairwise_event_end_to_end(client):
    quality = _pairwise_event(client)
    for judge in ("pw-j1", "pw-j2", "pw-liar"):
        login(client, f"{judge}@example.com")
        for _ in range(6):
            nxt = client.get(f"{E}/pairwise/next").json()
            if nxt["done"]:
                break
            left, right = nxt["left"], nxt["right"]
            better = left if quality[left["title"]] > quality[right["title"]] else right
            worse = right if better is left else left
            if judge == "pw-liar":
                better, worse = worse, better
            assert client.post(f"{E}/pairwise", json={"winner_id": better["id"], "loser_id": worse["id"]}).status_code == 200
        assert client.get(f"{E}/pairwise/next").json()["done"] is True  # 4 projects = 6 pairs, then done
    login(client, "pw-org@example.com")
    fit = client.post(f"{E}/pairwise/fit").json()
    assert [r["title"] for r in fit["ranking"]] == ["Best", "Good", "Fine", "Weak"]
    rel = {j["name"]: j["reliability"] for j in fit["params"]["judges"]}
    assert rel["pw-liar"] < min(rel["pw-j1"], rel["pw-j2"])
    client.patch(E, json={"voting_opens_at": None, "voting_closes_at": None})
    assert client.post(f"{E}/publish", json={"published": True}).status_code == 200
    client.cookies.clear()
    results = client.get(f"{E}/results").json()
    assert results["judging_mode"] == "pairwise" and results["pairwise"]["ranking"][0]["title"] == "Best"


def test_pairwise_is_judges_only_and_track_scoped(client):
    _pairwise_event(client)
    login(client, "pw-p0@example.com")
    assert client.get(f"{E}/pairwise/next").status_code == 403
    login(client, "pw-org@example.com")
    assert client.get(f"{E}/pairwise/next").status_code == 403  # organizers do not judge
