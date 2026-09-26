"use client";

import { FlaskConical, Swords } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useEvent } from "@/components/event-context";
import { fireConfetti } from "@/components/magic/confetti";
import { RankShift } from "@/components/magic/rank-shift";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, json } from "@/lib/api";
import type { PairwiseRanking } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { runIsStale } from "./lifecycle";
import { type ConsoleCtx, LoadError, type Run, Section, errMsg, plural, useApi } from "./shared";
import { SlopeChart } from "./slope-chart";

type PairJudge = { judge_id: string; name: string; reliability: number; online_reliability: number; comparisons: number };
type PairwiseFit = {
  id: string;
  created_at: string;
  params: { prior: number; comparisons: number; judges?: PairJudge[]; kendall_tau_weighted_vs_plain?: number | null; kendall_tau_weighted_vs_crowd?: number | null };
  ranking: (PairwiseRanking[number] & { crowd_mu?: number })[];
};

const DEFAULTS = { lambda_judge: 2, lambda_project: 1, drop_constant_raters: true };

export function ResultsTab({ dash, run, go }: ConsoleCtx) {
  const { event } = useEvent();
  const pairwise = event.judging_mode === "pairwise";
  return (
    <div className="flex flex-col gap-12">
      <Publication hasRun={Boolean(run.data) || pairwise} go={go} />
      {pairwise && <Pairwise />}
      {(!pairwise || run.data) && (
        <Section
          title="Normalization"
          description="Fits score = overall mean + project quality + judge offset, then ranks projects with each judge's harshness or leniency removed."
        >
          <Controls key={run.data?.id ?? "none"} run={run} />
          {run.data && runIsStale(run.data, dash.data) && (
            <Callout tone="warning" title="Reviews came in after this run">
              {run.data.reviews_used} reviews were used; {dash.data?.kpis.reviews_submitted} are submitted now. Run it again before publishing.
            </Callout>
          )}
          {run.error ? (
            <LoadError error={run.error} onRetry={run.reload} />
          ) : run.loading ? (
            <Skeleton className="h-64" />
          ) : !run.data ? (
            <EmptyState icon={FlaskConical} title="No normalization run yet" description="Run it once reviews are in. Nothing becomes public until you publish." />
          ) : (
            <RunView run={run.data} />
          )}
        </Section>
      )}
      {!pairwise && <Pairwise />}
      <Section title="Downloads" description="Organizer-only until results are published.">
        <div className="flex flex-wrap gap-2">
          {["results", "normalization", "scores"].map((k) => (
            <Button key={k} variant="secondary" size="sm" href={`/v1/events/${event.slug}/export/${k}.csv`} download>
              {k}.csv
            </Button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Publication({ hasRun, go }: { hasRun: boolean; go: ConsoleCtx["go"] }) {
  const { event, refresh } = useEvent();
  const router = useRouter();
  const toast = useToast();
  const [blocked, setBlocked] = useState<string | null>(null);
  const published = event.results_published;

  async function set(next: boolean) {
    setBlocked(null);
    try {
      await api(`/v1/events/${event.slug}/publish`, { method: "POST", body: json({ published: next }) });
      await refresh();
      router.refresh();
      if (next) {
        fireConfetti("sides");
        toast.success("Results are public", "The results page, results.csv and webhooks now show the ranking.");
      } else toast.info("Results hidden again", "Nothing was deleted.");
    } catch (e) {
      setBlocked(errMsg(e));
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div aria-live="polite">
        <p className="flex items-center gap-2 text-base font-semibold">
          <span aria-hidden className={cn("size-2.5 rounded-full", published ? "bg-accent" : "bg-line-strong")} />
          {published ? "Results are public" : "Results are hidden"}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {published
            ? "Anyone can see the ranking on the results page. Unpublishing hides it again; nothing is deleted."
            : event.voting_open
              ? "Voting is open. The API refuses to publish until it closes, so the ranking cannot sway the vote."
              : hasRun
                ? "Only organizers see the ranking. Publishing opens the results page, results.csv and the results.published webhook."
                : "Run normalization first; publishing shows its ranking."}
        </p>
        {blocked && (
          <Callout tone="error" className="mt-3" title="Not changed" action={event.voting_open ? <Button size="sm" variant="secondary" onClick={() => go("voting")}>Go to Voting</Button> : undefined}>
            {blocked}
          </Callout>
        )}
      </div>
      {published ? (
        <AlertDialog
          title="Hide the results?"
          description="The results page and results.csv go back to organizers only. People who already looked may have copies."
          confirmLabel="Unpublish"
          onConfirm={() => set(false)}
          trigger={<Button variant="secondary">Unpublish</Button>}
        />
      ) : (
        <AlertDialog
          title="Publish results?"
          description="The ranking becomes public on the results page, in results.csv and through the results.published webhook. You can unpublish later, but people may already have seen it."
          confirmLabel="Publish results"
          onConfirm={() => set(true)}
          trigger={
            <Button variant="secondary" disabled={!hasRun || event.voting_open}>
              Publish results
            </Button>
          }
        />
      )}
    </Card>
  );
}

function Controls({ run }: { run: ConsoleCtx["run"] }) {
  const { event } = useEvent();
  const toast = useToast();
  const p = run.data?.params ?? DEFAULTS;
  const [lj, setLj] = useState(p.lambda_judge);
  const [lp, setLp] = useState(p.lambda_project);
  const [drop, setDrop] = useState(p.drop_constant_raters);
  const [busy, setBusy] = useState(false);
  const custom = lj !== DEFAULTS.lambda_judge || lp !== DEFAULTS.lambda_project || drop !== DEFAULTS.drop_constant_raters;

  async function go() {
    setBusy(true);
    try {
      const next = await api<Run>(`/v1/events/${event.slug}/normalization`, { method: "POST", body: json({ lambda_judge: lj, lambda_project: lp, drop_constant_raters: drop }) });
      run.setData(next);
      toast.success("Normalization complete", `${plural(next.reviews_used, "review")} used. Logged to the audit chain.`);
    } catch (e) {
      toast.error("Normalization failed", errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="λ judge" hint="Higher needs more evidence before calling a judge harsh or lenient.">
          <Slider value={lj} onValueChange={setLj} min={0} max={10} step={0.5} formatValue={(v) => v.toFixed(1)} />
        </Field>
        <Field label="λ project" hint="Higher pulls projects with few reviews toward the mean, so one generous judge cannot crown a project.">
          <Slider value={lp} onValueChange={setLp} min={0} max={10} step={0.5} formatValue={(v) => v.toFixed(1)} />
        </Field>
      </div>
      <Switch checked={drop} onCheckedChange={setDrop} label="Leave out constant raters" description="Judges who gave every project the same score cannot tell projects apart; left in, they only squash their projects together." />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={go} loading={busy}>
          Run normalization
        </Button>
        {custom && (
          <Button
            variant="ghost"
            onClick={() => {
              setLj(DEFAULTS.lambda_judge);
              setLp(DEFAULTS.lambda_project);
              setDrop(DEFAULTS.drop_constant_raters);
            }}
          >
            Back to defaults
          </Button>
        )}
      </div>
    </Card>
  );
}

const tau = (v: number | null | undefined) => (v == null ? "n/a" : `τ = ${v.toFixed(2)}`);

function RunView({ run }: { run: Run }) {
  const [all, setAll] = useState(false);
  const cc = run.cross_check;
  const excluded = run.excluded_judges ?? [];
  return (
    <>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">This run</h3>
          <DataList
            items={[
              { label: "Ran", value: formatDate(run.created_at) },
              { label: "Settings", value: `λ judge ${run.params.lambda_judge}, λ project ${run.params.lambda_project}, constant raters ${run.params.drop_constant_raters ? "left out" : "kept"}` },
              { label: "Reviews used", value: run.reviews_used },
              { label: "Left out", value: excluded.length ? excluded.map((j) => j.name).join(", ") : "Nobody" },
              { label: "Overall mean", value: <span className="font-mono">{run.mu.toFixed(3)}</span> },
              { label: "Residual spread", value: <span className="font-mono">{run.sigma.toFixed(3)}</span> },
            ]}
          />
        </div>
        {cc && (
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">Cross-check</h3>
            <p className="text-sm text-muted">Kendall τ is 1 when two rankings agree exactly and 0 when they are unrelated. {cc.method}, {cc.pairs} pairs.</p>
            <DataList
              items={[
                { label: "Other model", value: <span><span className="font-mono">{tau(cc.kendall_tau_bt_vs_adjusted)}</span> <span className="text-muted">· Bradley–Terry on the same scores. High means the ranking is not an artifact of the method.</span></span> },
                { label: "Raw vs adjusted", value: <span><span className="font-mono">{tau(cc.kendall_tau_raw_vs_adjusted)}</span> <span className="text-muted">· below 1 means judge bias was moving projects.</span></span> },
              ]}
            />
          </div>
        )}
      </div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-base font-semibold">Rank shift</h3>
          <p className="text-sm text-muted">Where each project sat on raw means (left) and where it lands once judge bias is removed (right).</p>
          {run.rows.length ? <SlopeChart rows={run.rows} /> : <p className="text-sm text-muted">No scored projects yet.</p>}
        </div>
        <JudgeOffsets run={run} />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Ranking</h3>
        <Table>
          <THead>
            <TR>
              <TH className="w-14">Rank</TH>
              <TH className="hidden w-20 sm:table-cell">Shift</TH>
              <TH>Project</TH>
              <TH className="hidden md:table-cell">Track</TH>
              <TH className="hidden text-right sm:table-cell">Reviews</TH>
              <TH className="hidden text-right sm:table-cell">Raw mean</TH>
              <TH className="text-right">Adjusted ± SE</TH>
            </TR>
          </THead>
          <TBody>
            {(all ? run.rows : run.rows.slice(0, 20)).map((r) => (
              <TR key={r.project.id}>
                <TD className="font-mono tabular-nums">{r.rank}</TD>
                <TD className="hidden sm:table-cell">
                  <RankShift delta={r.raw_rank - r.rank} />
                </TD>
                <TD>
                  <div className="font-medium">{r.project.title}</div>
                  <div className="text-xs text-muted">{r.project.team}</div>
                </TD>
                <TD className="hidden text-muted md:table-cell">{r.project.track ?? "–"}</TD>
                <TD className="hidden text-right font-mono tabular-nums sm:table-cell">{r.n_reviews}</TD>
                <TD className="hidden text-right font-mono text-muted tabular-nums sm:table-cell">{r.raw_mean.toFixed(2)}</TD>
                <TD className="text-right font-mono whitespace-nowrap tabular-nums">
                  {r.adjusted.toFixed(2)} <span className="text-muted">± {r.std_error.toFixed(2)}</span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {run.rows.length > 20 && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll(!all)}>
            {all ? "Show the top 20" : `Show all ${run.rows.length} projects`}
          </Button>
        )}
      </div>
    </>
  );
}

function JudgeOffsets({ run }: { run: Run }) {
  const offsets = [...(run.judge_offsets ?? [])].filter((o) => !o.excluded).sort((a, b) => b.offset - a.offset);
  const maxAbs = Math.max(0.01, ...offsets.map((o) => Math.abs(o.offset)));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="text-base font-semibold">Judge offsets</h3>
      <p className="text-sm text-muted">Each judge&apos;s estimated bias in score points, subtracted before ranking. Right of centre is lenient, left is harsh.</p>
      {offsets.length === 0 ? (
        <p className="text-sm text-muted">No judge offsets on this run.</p>
      ) : (
        <ul className="flex max-h-140 flex-col gap-1 overflow-y-auto pr-1">
          {offsets.map((o) => (
            <li key={o.judge_id} className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_48px] items-center gap-2 text-sm">
              <span className="truncate text-muted">{o.name}</span>
              <div className="relative h-3" aria-hidden>
                <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                <div
                  className={cn("absolute inset-y-0.5 rounded-sm", o.offset >= 0 ? "left-1/2 bg-accent" : "right-1/2 bg-coral")}
                  style={{ width: `${(Math.abs(o.offset) / maxAbs) * 50}%` }}
                />
              </div>
              <span className={cn("text-right font-mono tabular-nums", o.offset >= 0 ? "text-accent-11" : "text-coral-11")}>
                {o.offset >= 0 ? "+" : "−"}
                {Math.abs(o.offset).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {(run.excluded_judges ?? []).length > 0 && (
        <p className="text-sm text-muted">Left out as constant raters: {run.excluded_judges!.map((j) => j.name).join(", ")}.</p>
      )}
    </div>
  );
}

function Pairwise() {
  const { event } = useEvent();
  const toast = useToast();
  const fit = useApi<PairwiseFit>(`/v1/events/${event.slug}/pairwise`);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const next = await api<PairwiseFit>(`/v1/events/${event.slug}/pairwise/fit`, { method: "POST" });
      fit.setData(next);
      toast.success("Pairwise ranking fitted", `${plural(next.params.comparisons, "comparison")} used.`);
    } catch (e) {
      toast.error("Fit failed", errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const ranking = fit.data?.ranking ?? [];
  const judges = [...(fit.data?.params.judges ?? [])].sort((a, b) => a.reliability - b.reliability);
  const weak = judges.filter((j) => j.reliability < 0.5);

  return (
    <Section
      title="Pairwise ranking"
      description={
        event.judging_mode === "pairwise"
          ? "Judges pick the better of two projects. The model turns wins into a strength μ with a standard error, and learns how reliable each judge is."
          : "This event scores with a rubric. Pairwise comparisons, if any were made, still fit here as an independent check."
      }
      actions={
        <Button variant="secondary" onClick={go} loading={busy}>
          Fit pairwise ranking
        </Button>
      }
    >
      {fit.error ? (
        <LoadError error={fit.error} onRetry={fit.reload} />
      ) : fit.loading ? (
        <Skeleton className="h-24" />
      ) : !fit.data ? (
        <EmptyState icon={Swords} title="No pairwise fit yet" description="Fit once judges have compared some pairs." />
      ) : !ranking.length ? (
        <p className="text-sm text-muted">Fitted on {plural(fit.data.params.comparisons, "comparison")}: nothing to rank yet.</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            {plural(fit.data.params.comparisons, "comparison")} · prior {fit.data.params.prior} · fitted {formatDate(fit.data.created_at)}
          </p>
          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Table>
              <THead>
                <TR>
                  <TH className="w-12">Rank</TH>
                  <TH>Project</TH>
                  <TH className="text-right">μ ± SE</TH>
                  <TH className="text-right">W–L</TH>
                  <TH className="hidden text-right sm:table-cell">Live μ</TH>
                </TR>
              </THead>
              <TBody>
                {ranking.map((r, i) => (
                  <TR key={r.submission_id}>
                    <TD className="font-mono tabular-nums">{i + 1}</TD>
                    <TD className="font-medium">{r.title}</TD>
                    <TD className="text-right font-mono whitespace-nowrap tabular-nums">
                      {r.mu.toFixed(2)} <span className="text-muted">± {r.se.toFixed(2)}</span>
                    </TD>
                    <TD className="text-right font-mono tabular-nums">
                      {r.wins}–{r.losses}
                    </TD>
                    <TD className="hidden text-right font-mono text-muted tabular-nums sm:table-cell">{r.crowd_mu != null ? r.crowd_mu.toFixed(2) : "–"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex flex-col gap-3">
              <h3 className="text-base font-semibold">Judge reliability</h3>
              <p className="text-sm text-muted">The chance that a judge&apos;s pick reflects the better project, from 0 to 1. At 0.5 a pick is a coin flip, and the model weighs each judge by it.</p>
              {weak.length > 0 && (
                <Callout tone="warning" title={`${plural(weak.length, "judge is", "judges are")} below 0.5`}>
                  {weak.map((j) => j.name).join(", ")} {weak.length === 1 ? "tends" : "tend"} to pick the opposite of everyone else. The model already discounts them; check for a mix-up (left and right swapped?) or a conflict of interest.
                </Callout>
              )}
              {judges.length === 0 ? (
                <p className="text-sm text-muted">No per-judge numbers on this fit.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Judge</TH>
                      <TH className="text-right">Reliability</TH>
                      <TH className="hidden text-right sm:table-cell">Live</TH>
                      <TH className="text-right">Pairs</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {judges.map((j) => (
                      <TR key={j.judge_id}>
                        <TD>
                          <span className="font-medium">{j.name}</span> {j.reliability < 0.5 && <Badge tone="amber">Low</Badge>}
                        </TD>
                        <TD className={cn("text-right font-mono tabular-nums", j.reliability < 0.5 && "text-amber-11")}>{j.reliability.toFixed(2)}</TD>
                        <TD className="hidden text-right font-mono text-muted tabular-nums sm:table-cell">{j.online_reliability.toFixed(2)}</TD>
                        <TD className="text-right font-mono tabular-nums">{j.comparisons}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              <p className="text-sm text-muted">Reliability is fitted on all comparisons at once; Live is the running estimate used to pick the next pair.</p>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}
