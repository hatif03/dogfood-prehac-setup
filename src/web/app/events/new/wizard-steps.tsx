"use client";

import { RadioCards } from "@radix-ui/themes";
import { FileJson, Plus, Trash2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { EASE } from "@/components/amicro/presets";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataList } from "@/components/ui/data-list";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import type { EventDetail } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export type Row = { key: number; name: string; description: string };
export type CriterionRow = Row & { weight: number };
export type DateKey = "submissions_open_at" | "submissions_deadline" | "judging_deadline" | "voting_opens_at" | "voting_closes_at";

export type WizardState = {
  name: string;
  slug: string;
  slugTouched: boolean;
  tagline: string;
  description: string;
  dates: Record<DateKey, string>; // datetime-local values, viewer's timezone
  tracks: Row[];
  prizes: Row[];
  criteria: CriterionRow[];
  scale_min: number;
  scale_max: number;
  judging_mode: EventDetail["judging_mode"];
  reviews_per_project: number;
  voting_access: EventDetail["voting_access"];
  vote_mode: EventDetail["vote_mode"];
  quadratic_budget: number;
  max_team_size: number;
};

export type Errors = Record<string, string>;
type StepProps = { state: WizardState; set: (patch: Partial<WizardState>) => void; errors: Errors };

let nextKey = 1;
export const row = (name = "", description = ""): Row => ({ key: nextKey++, name, description });

export const DATE_FIELDS: { key: DateKey; label: string; hint: string }[] = [
  { key: "submissions_open_at", label: "Submissions open", hint: "Teams can start drafting." },
  { key: "submissions_deadline", label: "Submission deadline", hint: "The API refuses every change after this." },
  { key: "judging_deadline", label: "Judging deadline", hint: "Judges finish scoring by then." },
  { key: "voting_opens_at", label: "Community voting opens", hint: "Leave both voting dates empty to skip voting." },
  { key: "voting_closes_at", label: "Community voting closes", hint: "Tallies stay hidden until results are published." },
];

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 79);

export const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

export function BasicsStep({ state, set, errors, onImport, importing }: StepProps & { onImport: (file: File) => void; importing: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Event name" required error={errors.name} className="sm:col-span-2">
          <Input
            value={state.name}
            autoFocus
            maxLength={200}
            placeholder="Dogfood Hack 2026"
            onChange={(e) => set({ name: e.target.value, ...(state.slugTouched ? {} : { slug: slugify(e.target.value) }) })}
          />
        </Field>
        <Field label="Web address" required error={errors.slug} hint={<>The event lives at <span className="font-mono">/events/{state.slug || "…"}</span></>}>
          <Input value={state.slug} maxLength={79} onChange={(e) => set({ slug: e.target.value.toLowerCase(), slugTouched: true })} className="font-mono" />
        </Field>
        <Field label="Tagline" hint="One line shown under the event name." error={errors.tagline}>
          <Input value={state.tagline} maxLength={280} onChange={(e) => set({ tagline: e.target.value })} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea value={state.description} rows={5} onChange={(e) => set({ description: e.target.value })} placeholder="Theme, rules and who can enter. Shown on the event page." />
        </Field>
      </div>
      <Callout
        icon={FileJson}
        title="Already have a fixtures.json?"
        action={
          <Button asChild variant="secondary" size="sm" className={cn("focus-within:outline-2 focus-within:outline-(--focus-8)", importing && "pointer-events-none opacity-60")}>
            <label>
              {importing ? <Spinner label="Importing" /> : <FileJson aria-hidden />} Import fixtures.json
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onImport(f);
                }}
              />
            </label>
          </Button>
        }
      >
        Importing creates the whole event in one go: tracks, judges, projects and scores. You become its organizer, and you can skip the steps below.
      </Callout>
    </div>
  );
}

export function DatesStep({ state, set, errors }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">Pick the dates in your own timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}); the portal stores them as UTC. Every date can be changed later.</p>
      <div className="grid gap-5 sm:grid-cols-2">
        {DATE_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint} error={errors[f.key]}>
            <Input type="datetime-local" value={state.dates[f.key]} onChange={(e) => set({ dates: { ...state.dates, [f.key]: e.target.value } })} />
          </Field>
        ))}
      </div>
      <Timeline dates={state.dates} />
    </div>
  );
}

const dotColor = (key: DateKey) => (key.startsWith("voting") ? "bg-violet" : key === "judging_deadline" ? "bg-cyan" : "bg-accent");

function Timeline({ dates }: { dates: Record<DateKey, string> }) {
  const points = DATE_FIELDS.filter((f) => dates[f.key]).map((f) => ({ ...f, t: new Date(dates[f.key]).getTime() })).sort((a, b) => a.t - b.t);
  if (points.length < 2) return null;
  const min = Math.min(...points.map((p) => p.t));
  const max = Math.max(...points.map((p) => p.t));
  return (
    <div className="rounded-(--radius-4) bg-surface px-5 pt-5 pb-3" aria-hidden>
      <div className="relative h-1.5 rounded-full bg-surface-3">
        {points.map((p) => (
          <motion.span
            key={p.key}
            layout
            className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-(--gray-2)", dotColor(p.key))}
            style={{ left: `${max === min ? 50 : ((p.t - min) / (max - min)) * 100}%` }}
            title={p.label}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {points.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", dotColor(p.key))} />
            {p.label}: <span className="text-fg">{formatDate(p.t, { year: undefined })}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function RowsEditor({ title, hint, rows, onChange, errorPrefix, errors, addLabel }: { title: string; hint: string; rows: Row[]; onChange: (rows: Row[]) => void; errorPrefix: string; errors: Errors; addLabel: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <motion.li
              key={r.key}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid gap-2 rounded-(--radius-4) bg-surface p-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
                <Field error={errors[`${errorPrefix}.${i}`]}>
                  <Input aria-label={`${title} ${i + 1} name`} value={r.name} placeholder="Name" maxLength={200} onChange={(e) => onChange(rows.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))} />
                </Field>
                <Input aria-label={`${title} ${i + 1} description`} value={r.description} placeholder="Description (optional)" onChange={(e) => onChange(rows.map((x) => (x.key === r.key ? { ...x, description: e.target.value } : x)))} />
                <Button size="icon" variant="ghost" aria-label={`Remove ${r.name || `row ${i + 1}`}`} onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
                  <Trash2 />
                </Button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <Button variant="outline" size="sm" className="self-start" onClick={() => onChange([...rows, row()])}>
        <Plus /> {addLabel}
      </Button>
    </section>
  );
}

export function TeamsStep({ state, set, errors }: StepProps) {
  return (
    <div className="flex flex-col gap-8">
      <Field label="Largest team" error={errors.max_team_size} hint="People per team, 1 to 20. Solo entrants count as a team of one." className="max-w-xs">
        <Input type="number" min={1} max={20} value={state.max_team_size} onChange={(e) => set({ max_team_size: Number(e.target.value) })} />
      </Field>
      <RowsEditor
        title="Tracks"
        hint="Categories teams enter. Judges are matched to tracks. Remove them all for one open category."
        rows={state.tracks}
        onChange={(tracks) => set({ tracks })}
        errorPrefix="tracks"
        errors={errors}
        addLabel="Add track"
      />
      <RowsEditor title="Prizes" hint="Shown on the event page and above the results." rows={state.prizes} onChange={(prizes) => set({ prizes })} errorPrefix="prizes" errors={errors} addLabel="Add prize" />
    </div>
  );
}

const SEGMENT_COLORS = ["bg-accent", "bg-cyan", "bg-violet", "bg-amber", "bg-coral"];

type Choice<V extends string> = { value: V; title: string; body: string; warn?: string };

function Choices<V extends string>({ label, value, onChange, options }: { label: string; value: V; onChange: (v: V) => void; options: Choice<V>[] }) {
  return (
    <RadioCards.Root value={value} onValueChange={(v) => onChange(v as V)} columns={{ initial: "1", sm: "2" }} aria-label={label}>
      {options.map((o) => (
        <RadioCards.Item key={o.value} value={o.value} className="cursor-pointer items-start justify-start text-left">
          <span className="flex flex-col gap-1">
            <span className="font-medium text-fg">{o.title}</span>
            <span className="text-sm text-muted">{o.body}</span>
            {o.warn && (
              <span className="mt-1 flex gap-1.5 text-sm text-amber-11">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {o.warn}
              </span>
            )}
          </span>
        </RadioCards.Item>
      ))}
    </RadioCards.Root>
  );
}

const JUDGING: Choice<WizardState["judging_mode"]>[] = [
  { value: "rubric", title: "Rubric scores", body: "Judges score each criterion. Totals are adjusted for how lenient each judge is." },
  { value: "pairwise", title: "Pairwise comparison", body: "Judges pick the better of two projects. The ranking is fitted from those choices (Bradley–Terry)." },
];

const ACCESS: Choice<WizardState["voting_access"]>[] = [
  { value: "email_gated", title: "Email-gated", body: "One ballot per confirmed email address. A little friction, good protection. Recommended." },
  { value: "open", title: "Open link", body: "Anyone with the link, one ballot per browser. Easiest to join, easiest to game." },
  { value: "authenticated", title: "Signed-in accounts", body: "One ballot per portal account. Voters must register first." },
  { value: "link", title: "Single-use links", body: "You make links and hand them out in the room. Whoever holds one votes once." },
];

const MODES: Choice<WizardState["vote_mode"]>[] = [
  { value: "one_person_one_vote", title: "One person, one vote", body: "Each voter picks one project. Simple to explain and to audit." },
  {
    value: "quadratic",
    title: "Quadratic",
    body: "Voters spread a budget of credits; n votes on one project cost n² credits, so a loud minority cannot dominate.",
    warn: "Extra identities become more valuable. Pair it with email-gated voting or single-use links, not open links.",
  },
];

export function JudgingStep({ state, set, errors }: StepProps) {
  const total = state.criteria.reduce((s, c) => s + c.weight, 0) || 1;
  const update = (key: number, patch: Partial<CriterionRow>) => set({ criteria: state.criteria.map((c) => (c.key === key ? { ...c, ...patch } : c)) });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">How judges decide</h3>
        <Choices label="Judging mode" value={state.judging_mode} onChange={(judging_mode) => set({ judging_mode })} options={JUDGING} />
        <Field label="Judges per project" error={errors.reviews_per_project} hint="How many judges review each project. 3 is a good start." className="max-w-xs">
          <Input type="number" min={1} max={20} value={state.reviews_per_project} onChange={(e) => set({ reviews_per_project: Number(e.target.value) })} />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h3 className="font-semibold">Rubric</h3>
          <p className="text-sm text-muted">
            {state.judging_mode === "pairwise" ? "Shown to judges as guidance for their comparisons. " : ""}Weights are relative: the portal turns them into
            percentages and shows judges the weighted total as they score.
          </p>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          {state.criteria.map((c, i) => (
            <motion.div
              key={c.key}
              className={cn("h-full", SEGMENT_COLORS[i % SEGMENT_COLORS.length])}
              animate={{ width: `${(c.weight / total) * 100}%` }}
              transition={{ duration: 0.3, ease: EASE }}
            />
          ))}
        </div>
        {errors.criteria && (
          <p className="text-sm text-coral-11" role="alert">
            {errors.criteria}
          </p>
        )}
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {state.criteria.map((c, i) => (
              <motion.li
                key={c.key}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="rounded-(--radius-4) bg-surface p-4"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <span className={cn("mt-3.5 size-2.5 shrink-0 rounded-full", SEGMENT_COLORS[i % SEGMENT_COLORS.length])} aria-hidden />
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                    <Field error={errors[`criteria.${i}`]}>
                      <Input aria-label={`Criterion ${i + 1} name`} value={c.name} placeholder="Criterion" onChange={(e) => update(c.key, { name: e.target.value })} />
                    </Field>
                    <Input aria-label={`Criterion ${i + 1} description`} value={c.description} placeholder="What judges look for" onChange={(e) => update(c.key, { description: e.target.value })} />
                  </div>
                  <span className="mt-2.5 w-12 text-right text-sm font-medium tabular-nums">{Math.round((c.weight / total) * 100)}%</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${c.name || "criterion"}`}
                    disabled={state.criteria.length === 1}
                    onClick={() => set({ criteria: state.criteria.filter((x) => x.key !== c.key) })}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="mt-3 pl-5">
                  <Slider aria-label={`${c.name || "Criterion"} weight`} value={c.weight} onValueChange={(weight) => update(c.key, { weight })} min={1} max={10} />
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={state.criteria.length >= 20}
          onClick={() => set({ criteria: [...state.criteria, { ...row(), weight: 3 }] })}
        >
          <Plus /> Add criterion
        </Button>
        <div className="grid max-w-md grid-cols-2 gap-4">
          <Field label="Lowest score" error={errors.scale}>
            <Input type="number" min={0} max={99} value={state.scale_min} onChange={(e) => set({ scale_min: Number(e.target.value) })} />
          </Field>
          <Field label="Highest score">
            <Input type="number" min={1} max={100} value={state.scale_max} onChange={(e) => set({ scale_max: Number(e.target.value) })} />
          </Field>
        </div>
      </section>
    </div>
  );
}

export function VotingStep({ state, set, errors }: StepProps) {
  return (
    <div className="flex flex-col gap-8">
      {!state.dates.voting_opens_at && (
        <Callout title="No voting dates set">You left the voting dates empty, so there is no community vote yet. These settings apply if you add dates later.</Callout>
      )}
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Who can vote</h3>
        <Choices label="Who can vote" value={state.voting_access} onChange={(voting_access) => set({ voting_access })} options={ACCESS} />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">How votes count</h3>
        <Choices label="How votes count" value={state.vote_mode} onChange={(vote_mode) => set({ vote_mode })} options={MODES} />
        {state.vote_mode === "quadratic" && (
          <Field label="Credits per voter" error={errors.quadratic_budget} hint="25 credits lets someone put 5 votes on one project, or 1 vote on each of 25." className="max-w-xs">
            <Input type="number" min={1} max={1000} value={state.quadratic_budget} onChange={(e) => set({ quadratic_budget: Number(e.target.value) })} />
          </Field>
        )}
      </section>
    </div>
  );
}

const MODE_LABEL = {
  rubric: "Rubric scores",
  pairwise: "Pairwise comparison",
  email_gated: "Email-gated",
  authenticated: "Signed-in accounts",
  link: "Single-use links",
  open: "Open link",
  one_person_one_vote: "One person, one vote",
  quadratic: "Quadratic",
} as const;

export function ReviewStep({ state }: { state: WizardState }) {
  const total = state.criteria.reduce((s, c) => s + c.weight, 0) || 1;
  const items = [
    { label: "Name", value: state.name },
    { label: "Address", value: <span className="font-mono">/events/{state.slug}</span> },
    { label: "Tagline", value: state.tagline || "None" },
    ...DATE_FIELDS.map((f) => ({ label: f.label, value: state.dates[f.key] ? formatDate(state.dates[f.key]) : "Not set" })),
    { label: "Teams", value: `Up to ${state.max_team_size} people` },
    { label: "Tracks", value: state.tracks.filter((t) => t.name.trim()).map((t) => t.name).join(", ") || "One open category" },
    { label: "Prizes", value: state.prizes.filter((t) => t.name.trim()).map((t) => t.name).join(", ") || "None" },
    { label: "Judging", value: `${MODE_LABEL[state.judging_mode]}, ${state.reviews_per_project} judges per project` },
    {
      label: "Rubric",
      value: `${state.criteria.map((c) => `${c.name || "Unnamed"} ${Math.round((c.weight / total) * 100)}%`).join(" · ")}, scored ${state.scale_min} to ${state.scale_max}`,
    },
    {
      label: "Voting",
      value: `${MODE_LABEL[state.voting_access]} · ${MODE_LABEL[state.vote_mode]}${state.vote_mode === "quadratic" ? ` (${state.quadratic_budget} credits)` : ""}`,
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Check the details, then create the event. You can change any of this later from the organizer console.</p>
      <DataList items={items} />
    </div>
  );
}
