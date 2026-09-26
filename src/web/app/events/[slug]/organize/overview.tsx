"use client";

import { TextField } from "@radix-ui/themes";
import { ArrowDown, ArrowUp, ArrowUpDown, CircleCheck, CircleDot, Clock, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useEvent } from "@/components/event-context";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { DashboardJudge } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { type ConsoleCtx, type Dash, LoadError, type Outlier, Section, errMsg, plural, useNow, useTopUp } from "./shared";

export function OverviewTab({ dash, run, go }: ConsoleCtx) {
  const now = useNow(5000);
  const { data, error, loading, reload, updatedAt } = dash;

  if (loading && !data) return <OverviewSkeleton />;
  if (error && !data) return <LoadError error={error} onRetry={reload} />;
  if (!data) return null;
  const ago = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : 0;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Kpis data={data} />
        <p className="text-sm text-muted" aria-live="off">
          {error ? <span className="text-coral-11">Reconnecting… </span> : null}
          Updated {ago < 5 ? "just now" : `${ago}s ago`}. Refreshes every 5 seconds while this tab is open.
        </p>
      </div>
      <Integrity data={data} outliers={run.data?.outliers ?? null} onChanged={reload} go={go} />
      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
        <JudgeProgress judges={data.judges} now={now} />
        <div className="flex flex-col gap-10">
          <Coverage coverage={data.coverage} />
          <ActivityFeed activity={data.activity} now={now} onAudit={() => go("audit")} />
        </div>
      </div>
    </div>
  );
}

function Kpis({ data }: { data: Dash }) {
  const { event } = useEvent();
  const k = data.kpis;
  const items = [
    { label: "Projects", value: k.projects, hint: "public, duplicates excluded" },
    { label: "Judges", value: k.judges, hint: plural(event.tracks.length, "track") },
    { label: "Reviews", value: `${k.reviews_submitted}/${k.reviews_assigned}`, hint: `${Math.round(k.completion * 100)}% submitted` },
    { label: "Below target", value: k.projects_below_target, hint: `projects under ${data.coverage.target} reviews`, warn: k.projects_below_target > 0 },
    { label: "Not started", value: k.judges_not_started, hint: "judges with no review in", warn: k.judges_not_started > 0 },
    { label: "Votes", value: k.votes, hint: event.voting_open ? "voting is open" : "community ballots" },
  ];
  return (
    <Card className="overflow-hidden">
      <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-6">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col gap-0.5 bg-(--color-panel-solid) px-4 py-3">
            <dt className="text-sm text-muted">{it.label}</dt>
            <dd className={cn("text-2xl font-semibold tabular-nums", it.warn ? "text-amber-11" : "text-fg")}>{it.value}</dd>
            <dd className="text-xs text-muted">{it.hint}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Integrity({ data, outliers, onChanged, go }: { data: Dash; outliers: Outlier[] | null; onChanged: () => void; go: ConsoleCtx["go"] }) {
  const { event } = useEvent();
  const toast = useToast();
  const top = useTopUp(onChanged);
  const i = data.integrity;
  const target = data.coverage.target;
  const outlierCount = i.outlier_reviews ?? outliers?.length ?? 0;

  async function clearFlag(d: Dash["integrity"]["duplicates"][number]) {
    try {
      await api(`/v1/events/${event.slug}/projects/${d.project_id}/flags/clear`, { method: "POST" });
      toast.success(`${d.title} is back in judging`, "The flag is kept as evidence in the audit log.");
      onChanged();
    } catch (e) {
      toast.error("Flag not cleared", errMsg(e));
    }
  }

  const clean = [
    !i.under_reviewed.length && "under-reviewed projects",
    !i.constant_raters.length && "constant raters",
    !i.duplicates.length && "duplicate submissions",
    !outlierCount && "outlier reviews",
    !i.shared_ip_ballots && "shared-IP ballots",
  ].filter(Boolean) as string[];

  return (
    <Section title="Integrity" description="What the portal caught, and what it does about each. Nothing here is removed without you.">
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {i.under_reviewed.length > 0 && (
          <Callout
            tone="warning"
            title={`${plural(i.under_reviewed.length, "project has", "projects have")} fewer than ${target} submitted reviews`}
            action={
              <Button size="sm" variant="secondary" loading={top.busy} onClick={() => top.topUp()}>
                Top up assignments
              </Button>
            }
          >
            <p>
              {data.kpis.completion < 1 ? "Some may only be waiting on judges who have not finished. " : ""}Top up sends them to the least busy eligible judges; existing scores stay.
            </p>
            <p className="mt-1">
              {i.under_reviewed.slice(0, 8).map((p, n) => (
                <span key={p.project_id}>
                  {n > 0 && ", "}
                  <Link href={`/events/${event.slug}/projects/${p.project_id}`} className="underline underline-offset-2 hover:text-fg">
                    {p.title}
                  </Link>{" "}
                  ({p.reviews})
                </span>
              ))}
              {i.under_reviewed.length > 8 && ` and ${i.under_reviewed.length - 8} more`}
            </p>
          </Callout>
        )}
        {i.constant_raters.length > 0 && (
          <Callout
            tone="warning"
            title={`${plural(i.constant_raters.length, "judge gives", "judges give")} every project the same score`}
            action={
              <Button size="sm" variant="secondary" onClick={() => go("results")}>
                Open Results
              </Button>
            }
          >
            <p>{i.constant_raters.map((j) => `${j.name}${j.external_id ? ` (${j.external_id})` : ""}`).join(", ")}.</p>
            <p className="mt-1">Their scores cannot tell projects apart, so normalization leaves them out by default. You can keep them in Results.</p>
          </Callout>
        )}
        {i.duplicates.length > 0 && (
          <Callout tone="warning" title={`${plural(i.duplicates.length, "duplicate submission")} hidden`}>
            <p>Flagged at submission and kept out of the gallery, ballots and ranking. The original stays in.</p>
            <ul className="mt-2 flex flex-col gap-2">
              {i.duplicates.map((d) => (
                <li key={d.project_id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-medium text-fg">{d.title}</span>: {d.reason}.{" "}
                    {d.duplicate_of && (
                      <Link href={`/events/${event.slug}/projects/${d.duplicate_of}`} className="underline underline-offset-2 hover:text-fg">
                        View the original
                      </Link>
                    )}
                  </span>
                  <AlertDialog
                    title="Not a duplicate?"
                    description={`"${d.title}" goes back into the gallery, ballots and judging. The flag stays as evidence and this decision is written to the audit log under your name.`}
                    confirmLabel="Return to judging"
                    onConfirm={() => clearFlag(d)}
                    trigger={
                      <Button size="sm" variant="secondary">
                        Not a duplicate
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          </Callout>
        )}
        {outlierCount > 0 && (
          <Callout tone="warning" title={`${plural(outlierCount, "review sits", "reviews sit")} far from the consensus`}>
            <p>One judge scored one project much higher or lower than the model expects. Could be a typo, a conflict of interest, or a judge who saw something others missed. Check them; nothing is dropped.</p>
            {outliers && outliers.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {outliers.slice(0, 8).map((o) => (
                  <li key={`${o.judge_id}-${o.project_id}`}>
                    <span className="font-medium text-fg">{o.judge}</span> on{" "}
                    <Link href={`/events/${event.slug}/projects/${o.project_id}`} className="underline underline-offset-2 hover:text-fg">
                      {o.title || "a project"}
                    </Link>
                    : {o.residual > 0 ? "+" : "−"}
                    {Math.abs(o.residual).toFixed(2)} points ({Math.abs(o.z).toFixed(1)} SD {o.residual > 0 ? "above" : "below"})
                  </li>
                ))}
              </ul>
            )}
          </Callout>
        )}
        {i.shared_ip_ballots > 0 && (
          <Callout tone="info" title={`${plural(i.shared_ip_ballots, "ballot")} from shared addresses`}>
            From an address that cast more than three ballots. Still counted: venue Wi-Fi is normal, so this is a signal to look at, not a verdict.
          </Callout>
        )}
        {clean.length > 0 && (
          <Callout tone="success" title={clean.length === 5 ? "Nothing to check" : "Clear"}>
            No {clean.join(", ")}.
          </Callout>
        )}
      </div>
    </Section>
  );
}

type SortKey = "status" | "name" | "reviews" | "active";
const STATUS = {
  not_started: { label: "Not started", icon: CircleDot, cls: "text-amber-11", order: 0 },
  in_progress: { label: "In progress", icon: Clock, cls: "text-cyan-11", order: 1 },
  done: { label: "Done", icon: CircleCheck, cls: "text-accent-11", order: 2 },
} as const;
const PAGE = 10;

function JudgeProgress({ judges, now }: { judges: DashboardJudge[]; now: number }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pct = (j: DashboardJudge) => (j.assigned ? j.completed / j.assigned : 0);
    const cmp: Record<SortKey, (a: DashboardJudge, b: DashboardJudge) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      reviews: (a, b) => pct(a) - pct(b),
      status: (a, b) => STATUS[a.status].order - STATUS[b.status].order || pct(a) - pct(b),
      active: (a, b) => (a.last_activity ?? "").localeCompare(b.last_activity ?? ""),
    };
    return judges
      .filter((j) => !needle || `${j.name} ${j.email} ${j.external_id ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => sort.dir * cmp[sort.key](a, b) || a.name.localeCompare(b.name));
  }, [judges, q, sort]);
  const shown = all || q ? rows : rows.slice(0, PAGE);

  const head = (key: SortKey, label: string, className?: string) => {
    const on = sort.key === key;
    const Icon = on ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <TH className={className} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          onClick={() => setSort({ key, dir: on ? (-sort.dir as 1 | -1) : 1 })}
          className="inline-flex cursor-pointer items-center gap-1 rounded-(--radius-1) hover:text-fg focus-visible:outline-2 focus-visible:outline-(--focus-8)"
        >
          {label}
          <Icon aria-hidden className={cn("size-3.5", on ? "text-fg" : "text-subtle")} />
        </button>
      </TH>
    );
  };

  return (
    <Section
      title="Judge progress"
      description="Least finished first, so you know who to nudge. Drafts do not count as submitted."
      actions={
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search judges" aria-label="Search judges by name, email or id" size="2" className="w-full sm:w-60">
          <InputIcon />
        </Input>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={Search} title={judges.length ? "No judge matches" : "No judges yet"} description={judges.length ? "Try a different name or id." : "Invite judges from People & judging."} />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                {head("name", "Judge")}
                {head("reviews", "Reviews")}
                <TH className="hidden text-right md:table-cell">Mean</TH>
                {head("status", "Status")}
                {head("active", "Last active", "hidden sm:table-cell")}
              </TR>
            </THead>
            <TBody>
              {shown.map((j) => {
                const s = STATUS[j.status];
                return (
                  <TR key={j.judge_id}>
                    <TD>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-fg">{j.name}</span>
                        {j.constant_rater && <Badge tone="amber">Same score for all</Badge>}
                      </div>
                      {j.external_id && <div className="font-mono text-xs text-muted">{j.external_id}</div>}
                    </TD>
                    <TD>
                      <div className="flex min-w-24 items-center gap-2">
                        <span className="w-12 shrink-0 font-mono text-sm whitespace-nowrap tabular-nums">
                          {j.completed}/{j.assigned}
                        </span>
                        <Progress value={j.assigned ? (j.completed / j.assigned) * 100 : 0} tone={j.status === "done" ? "accent" : "neutral"} className="hidden max-w-24 sm:block" aria-label={`${j.name}: ${j.completed} of ${j.assigned}`} />
                      </div>
                    </TD>
                    <TD className="hidden text-right font-mono tabular-nums md:table-cell">{j.mean_score != null ? j.mean_score.toFixed(2) : "–"}</TD>
                    <TD>
                      <span className={cn("inline-flex items-center gap-1.5 text-sm whitespace-nowrap", s.cls)}>
                        <s.icon aria-hidden className="size-4" />
                        {s.label}
                      </span>
                    </TD>
                    <TD className="hidden text-sm whitespace-nowrap text-muted sm:table-cell">{j.last_activity ? relativeTime(j.last_activity, now) : "Never"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {!q && rows.length > PAGE && (
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll(!all)}>
              {all ? "Show fewer" : `Show all ${rows.length} judges`}
            </Button>
          )}
        </>
      )}
    </Section>
  );
}

function InputIcon() {
  return (
    <TextField.Slot>
      <Search aria-hidden className="size-4" />
    </TextField.Slot>
  );
}

function Coverage({ coverage }: { coverage: Dash["coverage"] }) {
  const max = Math.max(coverage.target + 1, ...coverage.histogram.map((h) => h.reviews));
  const counts = new Map(coverage.histogram.map((h) => [h.reviews, h.projects]));
  const bins = Array.from({ length: max + 1 }, (_, r) => ({ reviews: r, projects: counts.get(r) ?? 0 }));
  const peak = Math.max(1, ...bins.map((b) => b.projects));
  const total = bins.reduce((n, b) => n + b.projects, 0);
  const met = bins.filter((b) => b.reviews >= coverage.target).reduce((n, b) => n + b.projects, 0);

  return (
    <Section title="Review coverage" description={`Projects by number of reviews. Target: ${coverage.target}.`}>
      <figure className="flex flex-col gap-2">
        <div className="flex h-36 items-end gap-1.5 border-b border-line-strong" role="img" aria-label={bins.map((b) => `${b.projects} projects with ${b.reviews} reviews`).join(", ")}>
          {bins.map((b) => (
            <div key={b.reviews} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className={cn("font-mono text-xs tabular-nums", b.projects ? "text-fg" : "text-subtle")}>{b.projects}</span>
              <div
                className={cn("w-full max-w-12 rounded-t-(--radius-1)", b.projects === 0 ? "bg-tint-strong" : b.reviews < coverage.target ? "bg-amber" : "bg-accent")}
                style={{ height: `${b.projects ? Math.max(4, (b.projects / peak) * 80) : 1}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {bins.map((b) => (
            <span key={b.reviews} className={cn("flex-1 text-center font-mono text-xs tabular-nums", b.reviews === coverage.target ? "font-semibold text-fg" : "text-muted")}>
              {b.reviews}
            </span>
          ))}
        </div>
        <figcaption className="text-sm text-muted">
          <span className="font-medium text-fg">{met}</span> of {total} projects meet the target
          {total - met > 0 && (
            <>
              ; <span className="font-medium text-amber-11">{total - met}</span> below
            </>
          )}
          .
        </figcaption>
      </figure>
    </Section>
  );
}

function ActivityFeed({ activity, now, onAudit }: { activity: Dash["activity"]; now: number; onAudit: () => void }) {
  return (
    <Section title="Activity" description="Latest entries from the audit log." actions={<Button variant="ghost" size="sm" onClick={onAudit}>Open audit log</Button>}>
      {activity.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {activity.slice(0, 8).map((a) => (
            <li key={a.seq} className="flex flex-col gap-0.5 py-2.5 first:pt-0">
              <p className="text-sm leading-snug text-fg">{a.summary}</p>
              <p className="text-xs text-muted">
                <time dateTime={a.at}>{relativeTime(a.at, now)}</time> · <span className="font-mono">{a.action}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-24 rounded-(--radius-4)" />
      <Skeleton className="h-28 rounded-(--radius-4)" />
      <Skeleton className="h-96 rounded-(--radius-4)" />
    </div>
  );
}
