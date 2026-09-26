"use client";

import { Check, CircleDashed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useEvent } from "@/components/event-context";
import { fireConfetti } from "@/components/magic/confetti";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/ui/countdown";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, json } from "@/lib/api";
import type { EventDetail } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { type ConsoleCtx, type Dash, type Run, errMsg, plural, useTopUp } from "./shared";

const STAGES = ["Setup", "Submissions", "Judging", "Voting", "Results", "Archive"] as const;
type Stage = 0 | 1 | 2 | 3 | 4 | 5;

const past = (iso: string | null) => Boolean(iso && new Date(iso).getTime() <= Date.now());
const day = (iso: string) => formatDate(iso, { year: undefined, hour: undefined, minute: undefined });

/** A run is stale when reviews were submitted after it. */
export const runIsStale = (run: Run | null, dash: Dash | null) => Boolean(run && dash && run.reviews_used < dash.kpis.reviews_submitted);

/** Where the event is. Judging with the voting window over (or never set up) and a fresh run counts as Results. */
function stageOf(e: EventDetail, dash: Dash, run: Run | null): Stage {
  if (e.archived) return 5;
  if (e.phase === "upcoming") return 0;
  if (e.phase === "submissions_open") return 1;
  if (e.phase === "voting") return 3;
  if (e.phase === "results") return 4;
  const reviewed = dash.kpis.reviews_assigned > 0 && dash.kpis.completion >= 1 && dash.kpis.projects_below_target === 0;
  if (past(e.voting_closes_at)) return 4;
  if (!e.voting_opens_at && reviewed && run && !runIsStale(run, dash)) return 4;
  return 2;
}

function caption(i: Stage, e: EventDetail, d: Dash) {
  switch (i) {
    case 0:
      return `${plural(e.tracks.length, "track")} · ${plural(e.rubric?.criteria.length ?? 0, "criterion", "criteria")}`;
    case 1:
      return plural(d.kpis.projects, "project");
    case 2:
      return e.judging_mode === "pairwise" ? plural(d.kpis.judges, "judge") : `${d.kpis.reviews_submitted} of ${d.kpis.reviews_assigned} reviews`;
    case 3:
      if (!e.voting_opens_at) return "Not set up";
      return past(e.voting_opens_at) ? plural(d.kpis.votes, "vote") : `Opens ${day(e.voting_opens_at)}`;
    case 4:
      return e.results_published ? "Public" : "Hidden";
    case 5:
      return e.archived ? "Read-only" : "Not yet";
  }
}

export function LifecycleRail({ dash, run, go }: ConsoleCtx) {
  const { event } = useEvent();
  if (!dash.data) {
    return dash.error ? null : <Skeleton className="h-36 w-full rounded-(--radius-4)" />;
  }
  const stage = stageOf(event, dash.data, run.data);
  const votingSkipped = stage > 3 && !event.voting_opens_at;

  return (
    <section aria-label="Event lifecycle" className="overflow-hidden rounded-(--radius-4) border border-line bg-surface">
      <ol className="hidden grid-cols-6 border-b border-line sm:grid">
        {STAGES.map((label, idx) => {
          const i = idx as Stage;
          const state = i === 3 && votingSkipped ? "skipped" : i < stage || (i === 5 && event.archived) ? "done" : i === stage ? "current" : "next";
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className={cn("relative flex min-w-0 flex-col gap-0.5 px-4 py-3", state === "current" && "bg-tint", idx > 0 && "border-l border-line")}
            >
              {state === "current" && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
              <span className={cn("flex items-center gap-2 text-sm font-medium", state === "next" || state === "skipped" ? "text-muted" : "text-fg")}>
                <StepMark state={state} />
                {label}
                <span className="sr-only">{state === "done" ? "(done)" : state === "current" ? "(current stage)" : state === "skipped" ? "(not used)" : ""}</span>
              </span>
              <span className="truncate pl-6 text-xs text-muted">{state === "skipped" ? "Not used" : caption(i, event, dash.data!)}</span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-3 border-b border-line px-4 pt-3 pb-3 sm:hidden">
        <span className="text-sm text-muted">
          Stage {stage + 1} of 6 · <span className="font-medium text-fg">{STAGES[stage]}</span>
        </span>
        <span aria-hidden className="ml-auto flex gap-1">
          {STAGES.map((s, i) => (
            <span key={s} className={cn("h-1.5 w-4 rounded-full", i < stage || (i === stage && event.archived) ? "bg-accent-11/60" : i === stage ? "bg-accent" : "bg-tint-strong")} />
          ))}
        </span>
      </div>
      <NextAction stage={stage} dash={dash} run={run} go={go} />
    </section>
  );
}

function StepMark({ state }: { state: "done" | "current" | "next" | "skipped" }) {
  if (state === "done")
    return (
      <span aria-hidden className="grid size-4 place-items-center rounded-full bg-accent-11/15 text-accent-11">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  if (state === "skipped") return <CircleDashed aria-hidden className="size-4 text-subtle" />;
  return (
    <span aria-hidden className={cn("grid size-4 place-items-center rounded-full border", state === "current" ? "border-accent" : "border-line-strong")}>
      {state === "current" && <span className="size-2 rounded-full bg-accent" />}
    </span>
  );
}

function NextAction({ stage, dash, run, go }: { stage: Stage } & ConsoleCtx) {
  const { event, refresh } = useEvent();
  const router = useRouter();
  const toast = useToast();
  const d = dash.data!;
  const k = d.kpis;
  const top = useTopUp(dash.reload);
  const base = `/v1/events/${event.slug}`;

  const after = async () => {
    await refresh();
    router.refresh();
    dash.reload();
  };

  async function attempt(fn: () => Promise<unknown>, ok: string, okDetail: string, fail: string) {
    try {
      await fn();
      await after();
      toast.success(ok, okDetail);
      return true;
    } catch (e) {
      toast.error(fail, errMsg(e));
      return false;
    }
  }

  const [normalizing, setNormalizing] = useState(false);
  async function normalize() {
    setNormalizing(true);
    try {
      const params = run.data?.params ?? { lambda_judge: 2, lambda_project: 1, drop_constant_raters: true };
      const next = await api<Run>(`${base}/normalization`, { method: "POST", body: json(params) });
      run.setData(next);
      toast.success("Normalization complete", `${plural(next.reviews_used, "review")} used. See the Results tab.`);
    } catch (e) {
      toast.error("Normalization failed", errMsg(e));
    } finally {
      setNormalizing(false);
    }
  }

  let headline: React.ReactNode;
  let detail: React.ReactNode = null;
  let action: React.ReactNode = null;

  const below = k.projects_below_target;
  const target = d.coverage.target;

  if (stage === 5) {
    headline = "This event is archived";
    detail = "Everything is read-only for everyone. The full record is one download away.";
    action = (
      <Button href={`${base}/archive.zip`} download>
        Download archive.zip
      </Button>
    );
  } else if (stage === 0) {
    headline = event.submissions_open_at ? (
      <>
        Submissions open in <Countdown target={event.submissions_open_at} />
      </>
    ) : (
      "Set the event up"
    );
    detail = "Check tracks, prizes, dates and the rubric before teams arrive.";
    action = <Button onClick={() => go("settings")}>Review settings</Button>;
  } else if (stage === 1) {
    headline = event.submissions_deadline ? (
      <>
        {plural(k.projects, "project")} in · submissions close in <Countdown target={event.submissions_deadline} />
      </>
    ) : (
      `${plural(k.projects, "project")} submitted so far`
    );
    detail = k.judges ? `${plural(k.judges, "judge")} ready. Assign reviews once the deadline passes, so late projects are included.` : "No judges yet. Invite them now so they are ready when submissions close.";
    action = <Button onClick={() => go("people")}>{k.judges ? "Review judges" : "Invite judges"}</Button>;
  } else if (stage === 2) {
    if (k.judges === 0) {
      headline = "No judges yet";
      detail = event.judging_mode === "pairwise" ? "Invite judges; they compare projects two at a time." : "Invite judges, then assign reviews.";
      action = <Button onClick={() => go("people")}>Invite judges</Button>;
    } else if (event.judging_mode === "pairwise") {
      headline = `${plural(k.judges, "judge")} comparing projects two at a time`;
      detail = "Fit the pairwise ranking in Results when enough pairs are in, then publish from there.";
      action = <Button onClick={() => go("results")}>Open Results</Button>;
    } else if (k.reviews_assigned > 0 && k.completion < 1) {
      headline = `${k.reviews_submitted} of ${k.reviews_assigned} reviews submitted`;
      detail = k.judges_not_started ? `${plural(k.judges_not_started, "judge has", "judges have")} not started. The judge table shows who to nudge.` : "Judges are working through their queues.";
      action = <Button onClick={() => go("overview")}>See judge progress</Button>;
    } else if (k.reviews_assigned === 0 || below > 0) {
      headline = k.reviews_assigned === 0 ? "No reviews are assigned yet" : `${plural(below, "project is", "projects are")} below ${target} reviews`;
      detail = `Top up gives every project ${target} judges. Existing assignments and scores stay as they are.`;
      action = (
        <Button onClick={() => top.topUp()} loading={top.busy}>
          {k.reviews_assigned === 0 ? "Assign reviews" : "Top up assignments"}
        </Button>
      );
    } else if (!run.data || runIsStale(run.data, d)) {
      headline = run.data ? "New reviews since the last normalization" : "Every project is reviewed";
      detail = "Normalization removes each judge's harshness or leniency before ranking. Nothing becomes public.";
      action = <Button onClick={normalize} loading={normalizing}>
        Run normalization
      </Button>;
    } else {
      headline = event.voting_opens_at ? (
        <>
          Ranking ready · voting opens in <Countdown target={event.voting_opens_at} />
        </>
      ) : (
        "Ranking ready"
      );
      detail = "Results can be published once community voting closes.";
      action = <Button onClick={() => go("voting")}>Review voting</Button>;
    }
  } else if (stage === 3) {
    headline = event.voting_closes_at ? (
      <>
        Voting closes in <Countdown target={event.voting_closes_at} />
      </>
    ) : (
      "Voting is open with no closing time"
    );
    detail = `${plural(k.votes, "vote")} so far. Results stay hidden until voting closes.`;
    action = (
      <AlertDialog
        title="Close voting now?"
        description="Ballots stop being accepted immediately. You can reopen the window from the Voting tab."
        confirmLabel="Close voting"
        onConfirm={async () => {
          await attempt(() => api(base, { method: "PATCH", body: json({ voting_closes_at: new Date().toISOString() }) }), "Voting closed", "No more ballots are accepted.", "Voting not closed");
        }}
        trigger={<Button>Close voting now</Button>}
      />
    );
  } else if (!event.results_published) {
    const needsRun = !run.data || runIsStale(run.data, d);
    const over = event.voting_opens_at ? "Voting is over" : "Judging is done";
    headline = needsRun ? `${over}. Normalize, then publish` : `${over} and the ranking is ready`;
    detail = needsRun ? "Run normalization so the published ranking includes every review." : "Publishing opens the results page, results.csv and the results.published webhook.";
    action = needsRun ? (
      <Button onClick={normalize} loading={normalizing}>
        Run normalization
      </Button>
    ) : (
      <AlertDialog
        title="Publish results?"
        description="The ranking becomes public on the results page, in results.csv and through the results.published webhook. You can unpublish later, but people may already have seen it."
        confirmLabel="Publish results"
        onConfirm={async () => {
          const ok = await attempt(() => api(`${base}/publish`, { method: "POST", body: json({ published: true }) }), "Results are public", "The results page and exports now show the ranking.", "Results not published");
          if (ok) fireConfetti("sides");
        }}
        trigger={<Button>Publish results</Button>}
      />
    );
  } else {
    headline = "Results are public";
    detail = "When prizes are handed out, archive the event to freeze it for good.";
    action = (
      <AlertDialog
        danger
        title={`Archive ${event.name}?`}
        description="Everything becomes read-only for everyone: no submissions, scores, votes or setting changes. Download archive.zip first if you want an offline copy."
        confirmLabel="Archive the event"
        onConfirm={async () => {
          await attempt(() => api(`${base}/archive`, { method: "POST", body: json({ archived: true }) }), "Event archived", "It is now read-only for everyone.", "Not archived");
        }}
        trigger={<Button>Archive the event</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0" aria-live="polite">
        <p className="text-sm font-medium text-subtle">Next step</p>
        <p className="text-base font-semibold text-fg">{headline}</p>
        {detail && <p className="mt-0.5 text-sm text-muted">{detail}</p>}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
