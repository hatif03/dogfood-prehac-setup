"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useEvent } from "@/components/event-context";
import { RankShift } from "@/components/magic/rank-shift";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { api, ApiError } from "@/lib/api";
import type { Results } from "@/lib/types";
import { Podium, type PodiumEntry } from "./podium";
import { f2, Locked, Method, PopularVote, PreviewBanner } from "./sections";

type State = { status: "loading" } | { status: "locked"; reason: string } | { status: "error"; reason: string } | { status: "ok"; data: Results };

export default function ResultsPage() {
  const { event } = useEvent();
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ok", data: await api<Results>(`/v1/events/${event.slug}/results`) });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "locked", reason: err.detail });
      else setState({ status: "error", reason: err instanceof ApiError ? err.detail : "Could not reach the server" });
    }
  }, [event.slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const header = (
    <PageHeader
      title="Results"
      description={
        event.judging_mode === "pairwise"
          ? "Judges picked the better of two projects; the ranking is fitted from those choices."
          : "Ranked by judges' rubric scores, adjusted for how lenient or strict each judge was."
      }
    />
  );

  if (state.status === "loading") {
    return (
      <div aria-busy>
        {header}
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="mt-8 h-96" />
      </div>
    );
  }
  if (state.status === "locked") {
    return (
      <>
        {header}
        <Locked reason={state.reason} />
      </>
    );
  }
  if (state.status === "error") {
    return (
      <>
        {header}
        <Callout tone="error" title="Results could not load" action={<Button variant="secondary" size="sm" onClick={load}>Try again</Button>} className="max-w-2xl">
          {state.reason}
        </Callout>
      </>
    );
  }

  const r = state.data;
  const run = r.judging;
  const pairwise = r.judging_mode === "pairwise" ? (r.pairwise?.ranking ?? []) : [];
  const podium: PodiumEntry[] = pairwise.length
    ? pairwise.slice(0, 3).map((p) => ({ id: p.submission_id, title: p.title, track: null, score: f2(p.mu), scoreLabel: "strength" }))
    : (run?.rows ?? []).slice(0, 3).map((row) => ({ id: row.project.id, title: row.project.title, team: row.project.team, track: row.project.track, score: f2(row.adjusted), scoreLabel: "adjusted" }));

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        {!r.published && <PreviewBanner slug={event.slug} />}
        {header}
      </div>

      {podium.length > 0 ? (
        <section aria-labelledby="podium-heading" className="-mt-6 flex flex-col gap-3">
          <h2 id="podium-heading" className="sr-only">
            Top three
          </h2>
          {r.prizes.length > 0 && <p className="text-sm text-muted">Prizes: {r.prizes.join(" · ")}</p>}
          <Podium entries={podium} slug={event.slug} celebrate={r.published} />
        </section>
      ) : (
        <Callout title="No ranking yet">The organizer has not computed a ranking for this event.</Callout>
      )}

      {pairwise.length > 0 && (
        <section aria-labelledby="pairwise-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="pairwise-heading" className="text-lg font-semibold tracking-tight">
              Pairwise ranking
            </h2>
            {r.pairwise?.params && (
              <p className="text-sm text-muted">
                Bradley–Terry fit over {r.pairwise.params.comparisons} comparisons. ± is one standard error.
              </p>
            )}
          </div>
          <Table>
            <THead>
              <TR>
                <TH className="w-16">Rank</TH>
                <TH>Project</TH>
                <TH justify="end">Strength</TH>
                <TH justify="end" className="hidden sm:table-cell">
                  Won–lost
                </TH>
              </TR>
            </THead>
            <TBody>
              {pairwise.map((p, i) => (
                <TR key={p.submission_id}>
                  <TD className="tabular-nums">{i + 1}</TD>
                  <TD>
                    <Link href={`/events/${event.slug}/projects/${p.submission_id}`} className="font-medium text-fg hover:underline">
                      {p.title}
                    </Link>
                  </TD>
                  <TD justify="end" className="whitespace-nowrap tabular-nums">
                    {f2(p.mu)} <span className="text-muted">± {f2(p.se)}</span>
                  </TD>
                  <TD justify="end" className="hidden text-muted tabular-nums sm:table-cell">
                    {p.wins}–{p.losses}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      )}

      {run && run.rows.length > 0 && (
        <section aria-labelledby="ranking-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="ranking-heading" className="text-lg font-semibold tracking-tight">
              {pairwise.length ? "Rubric ranking (for comparison)" : "Full ranking"}
            </h2>
            <p className="text-sm text-muted">Adjusted for judge leniency. ± is one standard error.</p>
          </div>
          <Table>
            <THead>
              <TR>
                <TH className="w-16">Rank</TH>
                <TH className="hidden w-20 sm:table-cell">
                  <Tooltip content="Places moved compared with ranking by the raw average">
                    <span tabIndex={0} className="cursor-help underline decoration-line-strong decoration-dotted underline-offset-4">
                      Change
                    </span>
                  </Tooltip>
                </TH>
                <TH>Project</TH>
                <TH className="hidden md:table-cell">Track</TH>
                <TH justify="end" className="hidden sm:table-cell">
                  Reviews
                </TH>
                <TH justify="end">Adjusted</TH>
                <TH justify="end" className="hidden md:table-cell">
                  Raw average
                </TH>
              </TR>
            </THead>
            <TBody>
              {run.rows.map((row) => (
                <TR key={row.project.id}>
                  <TD className="font-medium tabular-nums">{row.rank}</TD>
                  <TD className="hidden sm:table-cell">
                    <RankShift delta={row.rank_delta} />
                  </TD>
                  <TD className="max-w-0 min-w-36">
                    <Link href={`/events/${event.slug}/projects/${row.project.id}`} className="block truncate font-medium text-fg hover:underline">
                      {row.project.title}
                    </Link>
                    <span className="block truncate text-muted">{row.project.team}</span>
                  </TD>
                  <TD className="hidden text-muted md:table-cell">{row.project.track ?? "None"}</TD>
                  <TD justify="end" className="hidden text-muted tabular-nums sm:table-cell">
                    {row.n_reviews}
                  </TD>
                  <TD justify="end" className="whitespace-nowrap tabular-nums">
                    {f2(row.adjusted)} <span className="text-muted">± {f2(row.std_error)}</span>
                  </TD>
                  <TD justify="end" className="hidden text-muted tabular-nums md:table-cell">
                    {f2(row.raw_mean)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {run && <Method run={run} />}
        <PopularVote rows={r.popular_vote} slug={event.slug} />
      </div>
    </div>
  );
}
