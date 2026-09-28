"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useEvent } from "@/components/event-context";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { api, json } from "@/lib/api";
import type { EventDetail } from "@/lib/types";
import { Section, errMsg, fromLocalInput, plural, toLocalInput } from "./shared";

/** Save → refresh the event context and the server layout (the event bar shows name and dates). Keeps the API's detail per section. */
function useSaver() {
  const { refresh } = useEvent();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function save(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      await fn();
      const next = await refresh();
      router.refresh();
      toast.success(ok);
      return next;
    } catch (e) {
      setErrors((cur) => ({ ...cur, [key]: errMsg(e) }));
      toast.error("Not saved", errMsg(e));
      return null;
    } finally {
      setBusy(null);
    }
  }
  return { busy, errors, save };
}

export function SettingsTab() {
  const saver = useSaver();
  return (
    <div className="flex flex-col gap-12">
      <div className="grid items-start gap-12 xl:grid-cols-2">
        <Basics saver={saver} />
        <Dates saver={saver} />
      </div>
      <div className="grid items-start gap-12 xl:grid-cols-2">
        <Tracks saver={saver} />
        <Prizes saver={saver} />
      </div>
      <Questions saver={saver} />
      <DangerZone />
    </div>
  );
}

type Saver = ReturnType<typeof useSaver>;

function SaveBar({ saver, k, dirty, disabled, onSave, onReset, label = "Save" }: { saver: Saver; k: string; dirty: boolean; disabled?: boolean; onSave: () => void; onReset: () => void; label?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {saver.errors[k] && (
        <Callout tone="error" title="Not saved">
          <span className="block first-letter:uppercase">{saver.errors[k]}.</span>
        </Callout>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onSave} disabled={!dirty || disabled} loading={saver.busy === k}>
          {label}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={onReset}>
            Discard changes
          </Button>
        )}
      </div>
    </div>
  );
}

type BasicsDraft = Pick<EventDetail, "name" | "tagline" | "description" | "judging_mode" | "reviews_per_project" | "max_team_size">;
const basicsOf = (e: EventDetail): BasicsDraft => ({
  name: e.name,
  tagline: e.tagline,
  description: e.description,
  judging_mode: e.judging_mode,
  reviews_per_project: e.reviews_per_project,
  max_team_size: e.max_team_size,
});

function Basics({ saver }: { saver: Saver }) {
  const { event } = useEvent();
  const [b, setB] = useState(() => basicsOf(event));
  const base = basicsOf(event);
  const changes = Object.fromEntries(
    (Object.keys(b) as (keyof BasicsDraft)[]).filter((k) => b[k] !== base[k]).map((k) => [k, typeof b[k] === "string" ? (b[k] as string).trim() : b[k]]),
  );
  const n = Object.keys(changes).length;
  const set = <K extends keyof BasicsDraft>(k: K, v: BasicsDraft[K]) => setB((cur) => ({ ...cur, [k]: v }));

  async function submit() {
    const next = await saver.save("basics", () => api(`/v1/events/${event.slug}`, { method: "PATCH", body: json(changes) }), `Saved ${plural(n, "change")}`);
    if (next) setB(basicsOf(next));
  }

  return (
    <Section title="Basics" description="Only the fields you change are sent.">
      <Field label="Name" required>
        <Input value={b.name} onChange={(e) => set("name", e.target.value)} maxLength={200} />
      </Field>
      <Field label="Tagline" hint={`${b.tagline.length} of 280 characters`}>
        <Input value={b.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={280} />
      </Field>
      <Field label="Description">
        <Textarea rows={4} value={b.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-fg" id="judging-mode">
          Judging mode
        </span>
        <SegmentedControl<EventDetail["judging_mode"]>
          aria-label="Judging mode"
          value={b.judging_mode}
          onValueChange={(v) => set("judging_mode", v)}
          items={[
            { value: "rubric", label: "Rubric scores" },
            { value: "pairwise", label: "Pairwise comparisons" },
          ]}
          className="self-start"
        />
        <p className="text-sm text-muted">
          {b.judging_mode === "rubric" ? "Judges score each assigned project on the weighted criteria." : "Judges pick the better of two projects; the model ranks the field from those picks."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reviews per project" hint="Target when assigning judges (1–20).">
          <Input type="number" min={1} max={20} value={b.reviews_per_project} onChange={(e) => set("reviews_per_project", Number(e.target.value))} />
        </Field>
        <Field label="Max team size" hint="Checked when people join a team.">
          <Input type="number" min={1} max={20} value={b.max_team_size} onChange={(e) => set("max_team_size", Number(e.target.value))} />
        </Field>
      </div>
      <SaveBar saver={saver} k="basics" dirty={n > 0} disabled={!b.name.trim()} onSave={submit} onReset={() => setB(base)} />
    </Section>
  );
}

const DATES = [
  { key: "starts_at", label: "Event starts" },
  { key: "ends_at", label: "Event ends" },
  { key: "submissions_open_at", label: "Submissions open" },
  { key: "submissions_deadline", label: "Submission deadline" },
  { key: "judging_deadline", label: "Judging deadline" },
] as const;
type DateKey = (typeof DATES)[number]["key"];
const datesOf = (e: EventDetail) => Object.fromEntries(DATES.map((f) => [f.key, toLocalInput(e[f.key])])) as Record<DateKey, string>;

function Dates({ saver }: { saver: Saver }) {
  const { event } = useEvent();
  const [d, setD] = useState(() => datesOf(event));
  const base = datesOf(event);
  const changes = Object.fromEntries(DATES.filter((f) => d[f.key] !== base[f.key]).map((f) => [f.key, fromLocalInput(d[f.key])]));
  const n = Object.keys(changes).length;

  async function submit() {
    const next = await saver.save("dates", () => api(`/v1/events/${event.slug}`, { method: "PATCH", body: json(changes) }), `Saved ${plural(n, "date")}`);
    if (next) setD(datesOf(next));
  }

  return (
    <Section title="Dates" description="Your local time, stored as UTC. Each date must come before the next. The voting window is on the Voting tab.">
      <div className="grid gap-4 sm:grid-cols-2">
        {DATES.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input type="datetime-local" value={d[f.key]} onChange={(e) => setD((cur) => ({ ...cur, [f.key]: e.target.value }))} />
          </Field>
        ))}
      </div>
      <SaveBar saver={saver} k="dates" dirty={n > 0} onSave={submit} onReset={() => setD(base)} label="Save dates" />
    </Section>
  );
}

type TrackRow = { uid: string; id?: string; name: string; description: string };
const tracksOf = (e: EventDetail): TrackRow[] => e.tracks.map((t) => ({ uid: t.id, id: t.id, name: t.name, description: t.description ?? "" }));

function Tracks({ saver }: { saver: Saver }) {
  const { event } = useEvent();
  const [rows, setRows] = useState(() => tracksOf(event));
  const dirty = JSON.stringify(rows) !== JSON.stringify(tracksOf(event));
  const patch = (uid: string, p: Partial<TrackRow>) => setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...p } : r)));

  async function submit() {
    const next = await saver.save("tracks", () => api(`/v1/events/${event.slug}/tracks`, { method: "PUT", body: json(rows.map((r) => ({ id: r.id, name: r.name.trim(), description: r.description }))) }), "Tracks saved");
    if (next) setRows(tracksOf(next));
  }

  return (
    <Section title="Tracks" description="Tracks that already have projects cannot be deleted.">
      <Rows
        rows={rows}
        noun="track"
        onRemove={(uid) => setRows((rs) => rs.filter((r) => r.uid !== uid))}
        render={(r) => (
          <>
            <Input size="2" value={r.name} onChange={(e) => patch(r.uid, { name: e.target.value })} placeholder="Track name" aria-label="Track name" />
            <Input size="2" value={r.description} onChange={(e) => patch(r.uid, { description: e.target.value })} placeholder="Description" aria-label={`${r.name || "Track"} description`} />
          </>
        )}
      />
      <Button variant="outline" size="sm" className="self-start" onClick={() => setRows((rs) => [...rs, { uid: `new-${Date.now()}`, name: "", description: "" }])}>
        <Plus /> Add track
      </Button>
      <SaveBar saver={saver} k="tracks" dirty={dirty} disabled={rows.some((r) => !r.name.trim())} onSave={submit} onReset={() => setRows(tracksOf(event))} label="Save tracks" />
    </Section>
  );
}

type PrizeRow = { uid: string; name: string; description: string; track_id: string };
const prizesOf = (e: EventDetail): PrizeRow[] => e.prizes.map((p) => ({ uid: p.id, name: p.name, description: p.description, track_id: p.track_id ?? "" }));

function Prizes({ saver }: { saver: Saver }) {
  const { event } = useEvent();
  const [rows, setRows] = useState(() => prizesOf(event));
  const dirty = JSON.stringify(rows) !== JSON.stringify(prizesOf(event));
  const patch = (uid: string, p: Partial<PrizeRow>) => setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...p } : r)));

  async function submit() {
    const next = await saver.save(
      "prizes",
      () => api(`/v1/events/${event.slug}/prizes`, { method: "PUT", body: json(rows.map((r) => ({ name: r.name.trim(), description: r.description, track_id: r.track_id || null }))) }),
      "Prizes saved",
    );
    if (next) setRows(prizesOf(next));
  }

  return (
    <Section title="Prizes" description="Optionally tie a prize to a track. Shown on the results page.">
      <Rows
        rows={rows}
        noun="prize"
        onRemove={(uid) => setRows((rs) => rs.filter((r) => r.uid !== uid))}
        render={(r) => (
          <>
            <Input size="2" value={r.name} onChange={(e) => patch(r.uid, { name: e.target.value })} placeholder="Prize name" aria-label="Prize name" />
            <Input size="2" value={r.description} onChange={(e) => patch(r.uid, { description: e.target.value })} placeholder="Description" aria-label={`${r.name || "Prize"} description`} />
            <Select value={r.track_id} onChange={(e) => patch(r.uid, { track_id: e.target.value })} aria-label={`${r.name || "Prize"} track`} className="h-8 text-sm">
              <option value="">Any track</option>
              {event.tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </>
        )}
      />
      <Button variant="outline" size="sm" className="self-start" onClick={() => setRows((rs) => [...rs, { uid: `new-${Date.now()}`, name: "", description: "", track_id: "" }])}>
        <Plus /> Add prize
      </Button>
      <SaveBar saver={saver} k="prizes" dirty={dirty} disabled={rows.some((r) => !r.name.trim())} onSave={submit} onReset={() => setRows(prizesOf(event))} label="Save prizes" />
    </Section>
  );
}

type QuestionRow = { uid: string; prompt: string; required: boolean };
const questionsOf = (e: EventDetail): QuestionRow[] =>
  (e.questions ?? []).map((q) => ({ uid: q.id, prompt: q.prompt, required: q.required }));

function Questions({ saver }: { saver: Saver }) {
  const { event } = useEvent();
  const [rows, setRows] = useState(() => questionsOf(event));
  const dirty = JSON.stringify(rows) !== JSON.stringify(questionsOf(event));
  const patch = (uid: string, p: Partial<QuestionRow>) => setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...p } : r)));

  async function submit() {
    const next = await saver.save(
      "questions",
      () =>
        api(`/v1/events/${event.slug}/questions`, {
          method: "PUT",
          body: json(
            rows.map((r) => ({
              ...(r.uid.startsWith("new-") ? {} : { id: r.uid }),
              prompt: r.prompt.trim(),
              required: r.required,
            })),
          ),
        }),
      "Questions saved",
    );
    if (next) setRows(questionsOf(next));
  }

  return (
    <Section title="Submission questions" description="Extra prompts on the submit form. Required ones block submit until answered.">
      <Rows
        rows={rows.map((r) => ({ ...r, name: r.prompt.slice(0, 40) || "Question" }))}
        noun="question"
        onRemove={(uid) => setRows((rs) => rs.filter((r) => r.uid !== uid))}
        render={(r) => (
          <>
            <Textarea
              value={r.prompt}
              onChange={(e) => patch(r.uid, { prompt: e.target.value })}
              placeholder="e.g. What is your open-source license?"
              rows={2}
              aria-label="Question prompt"
            />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={r.required} onChange={(e) => patch(r.uid, { required: e.target.checked })} />
              Required to submit
            </label>
          </>
        )}
      />
      <Button variant="outline" size="sm" className="self-start" onClick={() => setRows((rs) => [...rs, { uid: `new-${Date.now()}`, prompt: "", required: false }])}>
        <Plus /> Add question
      </Button>
      <SaveBar saver={saver} k="questions" dirty={dirty} disabled={rows.some((r) => !r.prompt.trim())} onSave={submit} onReset={() => setRows(questionsOf(event))} label="Save questions" />
    </Section>
  );
}

function Rows<R extends { uid: string; name: string }>({ rows, noun, render, onRemove }: { rows: R[]; noun: string; render: (r: R) => React.ReactNode; onRemove: (uid: string) => void }) {
  if (!rows.length) return <p className="text-sm text-muted">No {noun}s yet.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line border-y border-line">
      {rows.map((r) => (
        <li key={r.uid} className="flex items-start gap-2 py-2">
          <div className="grid min-w-0 flex-1 gap-2 sm:auto-cols-fr sm:grid-flow-col">{render(r)}</div>
          <Button variant="ghost" size="icon" aria-label={`Remove ${r.name || noun}`} onClick={() => onRemove(r.uid)}>
            <Trash2 />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function DangerZone() {
  const { event, refresh } = useEvent();
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const archived = event.archived;

  async function setArchived(next: boolean) {
    setError(null);
    try {
      await api(`/v1/events/${event.slug}/archive`, { method: "POST", body: json({ archived: next }) });
      await refresh();
      router.refresh();
      toast.success(next ? "Event archived" : "Event unarchived", next ? "It is read-only for everyone now." : "Changes are allowed again.");
    } catch (e) {
      setError(errMsg(e));
      toast.error(next ? "Not archived" : "Not unarchived", errMsg(e));
    }
  }

  return (
    <Section title="Danger zone" description="Freeze the event once it is over, and keep a copy that works without this server.">
      <div className="flex flex-col divide-y divide-line rounded-(--radius-4) border border-coral/40">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Download everything</p>
            <p className="text-sm text-muted">archive.zip: every stage as CSV, the full JSON export, the audit chain and the signing key, for your records.</p>
          </div>
          <Button variant="secondary" href={`/v1/events/${event.slug}/archive.zip`} download className="shrink-0">
            Download archive.zip
          </Button>
        </div>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{archived ? "This event is archived" : "Archive the event"}</p>
            <p className="text-sm text-muted">
              {archived
                ? "Read-only for everyone: no submissions, scores, votes, comments or setting changes."
                : `Makes the event read-only for everyone: no submissions, scores, votes, comments or setting changes.${event.voting_open ? " Close voting first." : ""}`}
            </p>
            {error && (
              <Callout tone="error" className="mt-3" title={archived ? "Not unarchived" : "Not archived"}>
                {error}
              </Callout>
            )}
          </div>
          {archived ? (
            <AlertDialog
              title="Unarchive this event?"
              description="Organizers, judges and participants can change things again. This is written to the audit log."
              confirmLabel="Unarchive"
              onConfirm={() => setArchived(false)}
              trigger={
                <Button variant="secondary" className="shrink-0">
                  Unarchive
                </Button>
              }
            />
          ) : (
            <AlertDialog
              danger
              title={`Archive ${event.name}?`}
              description="Everything becomes read-only for everyone: no submissions, scores, votes, comments or setting changes. Download archive.zip first if you want an offline copy."
              confirmLabel="Archive the event"
              onConfirm={() => setArchived(true)}
              trigger={
                <Button variant="danger" className="shrink-0" disabled={event.voting_open}>
                  Archive event
                </Button>
              }
            />
          )}
        </div>
      </div>
    </Section>
  );
}
