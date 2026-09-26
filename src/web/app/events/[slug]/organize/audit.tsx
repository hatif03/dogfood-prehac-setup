"use client";

import { ChevronRight, Download, History, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useEvent } from "@/components/event-context";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { AuditEntry } from "@/lib/types";
import { formatDate, relativeTime } from "@/lib/utils";
import { LoadError, Section, errMsg, useApi } from "./shared";

const FILTERS = [
  { value: "", label: "Everything" },
  { value: "event", label: "Event settings" },
  { value: "role", label: "Roles" },
  { value: "judge", label: "Judge invites" },
  { value: "team", label: "Teams" },
  { value: "submission", label: "Submissions" },
  { value: "flag", label: "Flags" },
  { value: "import", label: "Imports" },
  { value: "assignment", label: "Assignments" },
  { value: "rubric", label: "Rubric" },
  { value: "score", label: "Scores" },
  { value: "normalization", label: "Normalization" },
  { value: "pairwise", label: "Pairwise" },
  { value: "results", label: "Results" },
  { value: "ballot", label: "Ballots" },
  { value: "vote", label: "Votes" },
  { value: "comment", label: "Comments" },
  { value: "apikey", label: "API keys" },
  { value: "webhook", label: "Webhooks" },
  { value: "records", label: "Records" },
  { value: "auth", label: "Sign-ins" },
] as const;
const PAGE = 100;

type Verify = { ok: boolean; checked: number; head?: string; broken_at_seq?: number };

const dayKey = (iso: string) => new Date(iso).toDateString();
const dayLabel = (iso: string) => formatDate(iso, { weekday: "long", hour: undefined, minute: undefined });
const time = (iso: string) => formatDate(iso, { year: undefined, month: undefined, day: undefined });

export function AuditTab() {
  const { event } = useEvent();
  const base = `/v1/events/${event.slug}/audit`;
  const [prefix, setPrefix] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (before?: number) => {
      setBusy(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ limit: String(PAGE) });
        if (prefix) qs.set("action", prefix);
        if (before) qs.set("before", String(before));
        const page = await api<AuditEntry[]>(`${base}?${qs}`);
        setItems((cur) => (before && cur ? [...cur, ...page] : page));
        setMore(page.length === PAGE);
      } catch (e) {
        setError(errMsg(e));
        setItems((cur) => cur ?? []);
      } finally {
        setBusy(false);
      }
    },
    [base, prefix],
  );

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const needle = q.trim().toLowerCase();
  const shown = (items ?? []).filter((a) => !needle || `${a.summary} ${a.actor} ${a.action}`.toLowerCase().includes(needle));
  const days: { key: string; label: string; entries: AuditEntry[] }[] = [];
  for (const a of shown) {
    const k = dayKey(a.at);
    if (days.at(-1)?.key !== k) days.push({ key: k, label: dayLabel(a.at), entries: [] });
    days.at(-1)!.entries.push(a);
  }

  return (
    <div className="flex flex-col gap-10">
      <Chain path={`${base}/verify`} csv={`/v1/events/${event.slug}/export/audit.csv`} />
      <Section title="Timeline" description="Every action that changed this event, newest first. Open an entry for its details and hashes.">
        <div className="grid gap-3 sm:grid-cols-[240px_minmax(0,1fr)]">
          <Field label="Show">
            <Select value={prefix} onChange={(e) => setPrefix(e.target.value)}>
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Search loaded entries">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, action or words in the summary" />
          </Field>
        </div>
        {error && <Callout tone="error" title="Audit log unavailable">{error}</Callout>}
        {items === null ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState icon={History} title="No entries" description={needle ? "Nothing loaded matches that search." : prefix ? "Nothing of this kind yet." : "The log starts with the first action."} />
        ) : (
          <div className="flex flex-col gap-6" aria-live="polite">
            {days.map((d) => (
              <section key={d.key} aria-label={d.label}>
                <h3 className="mb-1 text-sm font-semibold text-muted">{d.label}</h3>
                <ol className="flex flex-col divide-y divide-line border-y border-line">
                  {d.entries.map((a) => (
                    <li key={a.seq}>
                      <Entry entry={a} />
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
        {more && items && (
          <Button variant="secondary" className="self-start" loading={busy} onClick={() => load(items[items.length - 1].seq)}>
            Load older entries
          </Button>
        )}
      </Section>
    </div>
  );
}

function Entry({ entry: a }: { entry: AuditEntry }) {
  const hasPayload = Object.keys(a.payload ?? {}).length > 0;
  return (
    <details className="group">
      <summary className="grid cursor-pointer list-none grid-cols-[68px_minmax(0,1fr)_auto] items-start gap-3 py-2.5 hover:bg-tint focus-visible:outline-2 focus-visible:outline-(--focus-8) [&::-webkit-details-marker]:hidden">
        <time dateTime={a.at} title={formatDate(a.at)} className="pt-0.5 font-mono text-xs text-muted tabular-nums">
          {time(a.at)}
        </time>
        <div className="min-w-0">
          <p className="text-sm leading-snug text-fg">{a.summary}</p>
          <p className="mt-0.5 text-xs text-muted">
            {a.actor || "system"} · <span className="font-mono">{a.action}</span> · {relativeTime(a.at)}
          </p>
        </div>
        <span className="flex items-center gap-1 pt-0.5 font-mono text-xs text-muted tabular-nums">
          #{a.seq}
          <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
        </span>
      </summary>
      <div className="mb-3 sm:ml-20 flex flex-col gap-2 font-mono text-xs text-muted">
        {hasPayload && <pre className="max-h-72 overflow-auto rounded-(--radius-3) bg-surface-2 p-3 text-fg">{JSON.stringify(a.payload, null, 2)}</pre>}
        {a.resource && <div>resource {a.resource}</div>}
        <div className="break-all">hash {a.hash}</div>
        <div className="break-all">prev {a.prev_hash}</div>
      </div>
    </details>
  );
}

function Chain({ path, csv }: { path: string; csv: string }) {
  const v = useApi<Verify>(path);
  const actions = (
    <>
      <Button size="sm" variant="secondary" onClick={v.reload}>
        <RefreshCw /> Verify again
      </Button>
      <Button size="sm" variant="ghost" href={csv} download>
        <Download /> audit.csv
      </Button>
    </>
  );
  if (v.error) return <LoadError error={v.error} onRetry={v.reload} />;
  if (!v.data) return <Skeleton className="h-24" />;
  return v.data.ok ? (
    <Callout tone="success" title={`Chain intact: ${v.data.checked} entries re-hashed`} action={actions}>
      Each entry stores the SHA-256 of the one before it, so editing or deleting any row breaks every hash after it.
      {v.data.head && <span className="mt-1 block font-mono text-xs break-all">head {v.data.head}</span>}
    </Callout>
  ) : (
    <Callout tone="error" title={`Chain broken at entry #${v.data.broken_at_seq}`} action={actions}>
      An entry was changed after it was written. Treat everything from #{v.data.broken_at_seq} on as suspect. {v.data.checked} entries checked.
    </Callout>
  );
}
