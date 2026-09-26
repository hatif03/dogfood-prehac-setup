"use client";

import { Inbox, Plus, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useEvent } from "@/components/event-context";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, json } from "@/lib/api";
import type { AuditEntry, Person, Role, Rubric, Track } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { type ConsoleCtx, LoadError, Section, errMsg, plural, useApi, useTopUp } from "./shared";

type Invite = { email: string; track_ids: string[]; accepted_at: string | null; created_at: string };

export function JudgingTab({ dash }: ConsoleCtx) {
  return (
    <div className="flex flex-col gap-12">
      <div className="grid items-start gap-12 xl:grid-cols-2">
        <Assignments dash={dash} />
        <Invites />
      </div>
      <People />
      <RubricEditor />
    </div>
  );
}

function TrackPicker({ tracks, value, onChange }: { tracks: Track[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!tracks.length) return <p className="text-sm text-muted">This event has no tracks.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tracks.map((t) => {
        const on = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== t.id) : [...value, t.id])}
            className={cn(
              "h-8 cursor-pointer rounded-full border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-(--focus-8)",
              on ? "border-accent bg-accent/15 font-medium text-fg" : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg",
            )}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

const trackNames = (tracks: Track[], ids: string[]) => (ids.length ? ids.map((id) => tracks.find((t) => t.id === id)?.name ?? "unknown").join(", ") : "All tracks");

function Assignments({ dash }: Pick<ConsoleCtx, "dash">) {
  const { event } = useEvent();
  const [n, setN] = useState(event.reviews_per_project);
  const top = useTopUp(dash.reload);
  const k = dash.data?.kpis;

  return (
    <Section
      title="Assignments"
      description="Top up gives every project this many judges. Existing assignments and scores are never touched."
    >
      {k ? (
        <DataList
          items={[
            { label: "Assigned", value: plural(k.reviews_assigned, "review") },
            { label: "Submitted", value: `${k.reviews_submitted} (${Math.round(k.completion * 100)}%)` },
            { label: "Below target", value: <span className={k.projects_below_target ? "font-medium text-amber-11" : undefined}>{plural(k.projects_below_target, "project")}</span> },
          ]}
        />
      ) : (
        <Skeleton className="h-20" />
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Reviews per project" className="w-40">
          <Input type="number" min={1} max={20} value={n} onChange={(e) => setN(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
        </Field>
        <Button variant="secondary" onClick={() => top.topUp(n)} loading={top.busy}>
          Top up assignments
        </Button>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
        <li>Judges never review their own team&apos;s project.</li>
        <li>Track-scoped judges only get projects in their tracks.</li>
        <li>The least busy eligible judge goes first.</li>
      </ul>
      {top.result && top.result.warnings.length > 0 && (
        <Callout tone="warning" title={`${plural(top.result.warnings.length, "project")} could not reach ${n}`}>
          <ul className="flex flex-col gap-1">
            {top.result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}
    </Section>
  );
}

function Invites() {
  const { event } = useEvent();
  const toast = useToast();
  const path = `/v1/events/${event.slug}/judge-invites`;
  const list = useApi<Invite[]>(path);
  const [emails, setEmails] = useState("");
  const [tracks, setTracks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ email: string; link: string }[]>([]);
  const parsed = useMemo(() => [...new Set(emails.split(/[\s,;]+/).map((e) => e.trim()).filter((e) => e.includes("@")))], [emails]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.length) return;
    setBusy(true);
    try {
      const res = await api<{ invited: { email: string; link: string }[] }>(path, { method: "POST", body: json({ emails: parsed, track_ids: tracks }) });
      setSent(res.invited);
      setEmails("");
      toast.success(`${plural(res.invited.length, "invite")} sent`, "They are in the local Mailpit inbox.");
      list.reload();
    } catch (err) {
      toast.error("Invites not sent", errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Invite judges"
      description="Each judge gets a single-use link by email. Mail goes to the local Mailpit inbox, never an outside service."
      actions={
        <Button variant="ghost" size="sm" href="http://localhost:8025" target="_blank" rel="noreferrer">
          <Inbox /> Open Mailpit
        </Button>
      }
    >
      <form onSubmit={send} className="flex flex-col gap-4">
        <Field label="Emails" hint={parsed.length ? `${plural(parsed.length, "address", "addresses")} found` : "One per line, or separated by commas."}>
          <Textarea rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={"ada@example.org\ngrace@example.org"} />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-fg">
            Tracks <span className="font-normal text-muted">(none selected means all tracks)</span>
          </legend>
          <TrackPicker tracks={event.tracks} value={tracks} onChange={setTracks} />
        </fieldset>
        <Button type="submit" variant="secondary" loading={busy} disabled={!parsed.length} className="self-start">
          Send {parsed.length > 1 ? `${parsed.length} invites` : "invite"}
        </Button>
      </form>

      {sent.length > 0 && (
        <Callout tone="success" title="Invite links (also emailed)" action={<Button size="sm" variant="ghost" onClick={() => setSent([])}>Dismiss</Button>}>
          <ul className="flex flex-col gap-1.5" aria-live="polite">
            {sent.map((s) => (
              <li key={s.link} className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{s.email}</span>
                <CopyButton value={s.link} label="Copy link" />
              </li>
            ))}
          </ul>
        </Callout>
      )}

      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <Skeleton className="h-24" />
      ) : !list.data?.length ? (
        <p className="text-sm text-muted">No invites sent yet.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <Table>
            <THead>
              <TR>
                <TH>Email</TH>
                <TH className="hidden sm:table-cell">Tracks</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {list.data.map((i) => (
                <TR key={i.email + i.created_at}>
                  <TD>
                    <div className="break-all">{i.email}</div>
                    <div className="text-xs text-muted">sent {relativeTime(i.created_at)}</div>
                  </TD>
                  <TD className="hidden text-muted sm:table-cell">{trackNames(event.tracks, i.track_ids)}</TD>
                  <TD>{i.accepted_at ? <Badge tone="accent">Accepted</Badge> : <Badge tone="amber">Pending</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

const ROLE_TONE: Record<Role, BadgeTone> = { organizer: "violet", admin: "violet", judge: "cyan", participant: "neutral", visitor: "neutral" };
type Filter = "all" | "judge" | "organizer" | "participant";

function People() {
  const { event } = useEvent();
  const toast = useToast();
  const people = useApi<Person[]>(`/v1/events/${event.slug}/people`);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"judge" | "organizer">("judge");
  const [tracks, setTracks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const all = people.data ?? [];
  const needle = q.trim().toLowerCase();
  const rows = all
    .filter((p) => filter === "all" || p.role === filter || (filter === "organizer" && p.role === "admin"))
    .filter((p) => !needle || `${p.display_name} ${p.email} ${p.external_id ?? ""}`.toLowerCase().includes(needle));
  const count = (r: Role) => all.filter((p) => p.role === r).length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/v1/events/${event.slug}/roles`, { method: "POST", body: json({ user_email: email.trim(), role, track_ids: role === "judge" ? tracks : [] }) });
      toast.success(`${email.trim()} is now ${role === "judge" ? "a judge" : "an organizer"}`);
      setEmail("");
      setTracks([]);
      people.reload();
    } catch (err) {
      toast.error("Role not added", errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="People" description="Everyone with a role in this event. The API checks the role on every request.">
      <Card className="p-4">
        <form onSubmit={add} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
          <Field label="Add an existing account">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.org" />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as "judge" | "organizer")}>
              <option value="judge">Judge</option>
              <option value="organizer">Organizer</option>
            </Select>
          </Field>
          <Button type="submit" variant="secondary" loading={busy} disabled={!email.includes("@")}>
            Add role
          </Button>
          <p className="text-sm text-muted md:col-span-3">For someone without an account, send an invite instead.</p>
          {role === "judge" && (
            <fieldset className="md:col-span-3">
              <legend className="mb-2 text-sm font-medium text-fg">
                Judge tracks <span className="font-normal text-muted">(none means all)</span>
              </legend>
              <TrackPicker tracks={event.tracks} value={tracks} onChange={setTracks} />
            </fieldset>
          )}
        </form>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl<Filter>
            aria-label="Filter by role"
            value={filter}
            onValueChange={setFilter}
            items={[
              { value: "all", label: `All ${all.length}` },
              { value: "judge", label: `Judges ${count("judge")}` },
              { value: "organizer", label: `Organizers ${count("organizer") + count("admin")}` },
              { value: "participant", label: `Participants ${count("participant")}` },
            ]}
          />
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people by name, email or id" size="2" className="w-full sm:w-60" />
      </div>

      {people.error ? (
        <LoadError error={people.error} onRetry={people.reload} />
      ) : people.loading ? (
        <Skeleton className="h-48" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title={all.length ? "Nobody matches" : "Nobody here yet"} description={all.length ? "Try another filter or name." : "Invite judges above, or add an existing account by email."} />
      ) : (
        <div className="max-h-[560px] overflow-y-auto">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH className="hidden md:table-cell">Email</TH>
                <TH>Role</TH>
                <TH className="hidden sm:table-cell">Tracks</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((p) => (
                <TR key={p.user_id + p.role}>
                  <TD>
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium">{p.display_name || p.email}</span>
                      {!p.claimed && <Badge tone="amber">Not signed in yet</Badge>}
                    </div>
                    {p.external_id && <div className="font-mono text-xs text-muted">{p.external_id}</div>}
                    <div className="text-xs break-all text-muted md:hidden">{p.email}</div>
                  </TD>
                  <TD className="hidden text-muted md:table-cell">{p.email}</TD>
                  <TD>
                    <Badge tone={ROLE_TONE[p.role]}>{p.role[0].toUpperCase() + p.role.slice(1)}</Badge>
                  </TD>
                  <TD className="hidden text-muted sm:table-cell">{p.role === "judge" ? trackNames(event.tracks, p.track_ids) : "–"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

type Row = { uid: string; id?: string; key?: string; name: string; description: string; weight: number };

const toRows = (r: Rubric | null): Row[] =>
  (r?.criteria ?? []).map((c) => ({ uid: c.id, id: c.id, key: c.key, name: c.name, description: c.description, weight: Math.round(c.weight * 100) / 10 }));

function RubricEditor() {
  const { event, refresh } = useEvent();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() => toRows(event.rubric));
  const [min, setMin] = useState(event.rubric?.scale_min ?? 1);
  const [max, setMax] = useState(event.rubric?.scale_max ?? 5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = rows.reduce((s, r) => s + r.weight, 0);
  const initial = JSON.stringify([toRows(event.rubric), event.rubric?.scale_min, event.rubric?.scale_max]);
  const dirty = JSON.stringify([rows, min, max]) !== initial;
  const invalid = !rows.length || total <= 0 || rows.some((r) => !r.name.trim()) || min >= max;
  const share = (w: number) => (total ? Math.round((w / total) * 100) : 0);

  const patch = (uid: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...p } : r)));
  const reset = () => {
    setRows(toRows(event.rubric));
    setMin(event.rubric?.scale_min ?? 1);
    setMax(event.rubric?.scale_max ?? 5);
    setError(null);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api<Rubric>(`/v1/events/${event.slug}/rubric`, {
        method: "PUT",
        body: json({
          scale_min: min,
          scale_max: max,
          criteria: rows.map((r) => ({ id: r.id, key: r.key, name: r.name.trim(), description: r.description, weight: r.weight })),
        }),
      });
      // The PUT returns the rubric; the recompute count lives in the audit entry it wrote.
      const [entry] = await api<AuditEntry[]>(`/v1/events/${event.slug}/audit?action=rubric.update&limit=1`).catch(() => []);
      const n = entry?.summary.match(/(\d+) reviews recomputed/)?.[1];
      const next = await refresh();
      setRows(toRows(next.rubric));
      toast.success(n ? `${n} reviews recomputed` : "Rubric saved", "Every stored total now uses the new weights. The audit log keeps before and after.");
    } catch (e) {
      setError(errMsg(e));
      toast.error("Rubric not saved", errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Rubric"
      description="Weights are relative; the portal turns them into percentages. Saving recomputes every stored review total."
      actions={
        <>
          {dirty && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Reset
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={save} loading={busy} disabled={!dirty || invalid}>
            Save rubric
          </Button>
        </>
      }
    >
      {error && <Callout tone="error" title="Rubric not saved">{error}</Callout>}
      <div className="max-w-full overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH>Criterion</TH>
              <TH className="hidden md:table-cell">What judges look for</TH>
              <TH className="min-w-48">Weight</TH>
              <TH>
                <span className="sr-only">Remove</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.uid}>
                <TD className="min-w-40">
                  <Input size="2" value={r.name} onChange={(e) => patch(r.uid, { name: e.target.value })} placeholder="Criterion name" aria-label="Criterion name" />
                  <div className="mt-2 md:hidden">
                    <Input size="2" value={r.description} onChange={(e) => patch(r.uid, { description: e.target.value })} placeholder="What judges look for" aria-label={`${r.name} description`} />
                  </div>
                </TD>
                <TD className="hidden md:table-cell">
                  <Input size="2" value={r.description} onChange={(e) => patch(r.uid, { description: e.target.value })} placeholder="What judges look for" aria-label={`${r.name} description`} />
                </TD>
                <TD>
                  <div className="flex items-center gap-3">
                    <Slider value={r.weight} onValueChange={(v) => patch(r.uid, { weight: v })} min={0} max={10} step={0.1} showValue={false} formatValue={(v) => `${v.toFixed(1)} (${share(v)}%)`} aria-label={`${r.name || "Criterion"} weight`} className="flex-1" />
                    <span className="w-10 text-right font-mono text-sm tabular-nums">{share(r.weight)}%</span>
                  </div>
                </TD>
                <TD>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${r.name || "criterion"}`} onClick={() => setRows((rs) => rs.filter((x) => x.uid !== r.uid))} disabled={rows.length === 1}>
                    <Trash2 />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { uid: `new-${Date.now()}`, name: "", description: "", weight: 1 }])}>
          <Plus /> Add criterion
        </Button>
        <div className="flex items-start gap-3">
          <Field label="Scale from" className="w-28">
            <Input type="number" value={min} onChange={(e) => setMin(Number(e.target.value))} />
          </Field>
          <Field label="to" className="w-28" error={min >= max ? "Must be above the start" : undefined}>
            <Input type="number" value={max} onChange={(e) => setMax(Number(e.target.value))} />
          </Field>
        </div>
      </div>
      <p className="text-sm text-muted">Criteria that already have scores cannot be removed. Set their weight to 0 instead.</p>
    </Section>
  );
}
