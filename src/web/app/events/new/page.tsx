"use client";

import { ArrowLeft, ArrowRight, Check, LogIn } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EASE } from "@/components/amicro/presets";
import { fireConfetti } from "@/components/magic/confetti";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, json } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { EventDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  BasicsStep,
  DATE_FIELDS,
  DatesStep,
  type Errors,
  JudgingStep,
  ReviewStep,
  row,
  TeamsStep,
  toIso,
  VotingStep,
  type WizardState,
} from "./wizard-steps";

const STEPS = ["Basics", "Dates", "Teams and tracks", "Judging", "Voting", "Review"] as const;

const local = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function initialState(): WizardState {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const at = (days: number) => local(new Date(start.getTime() + days * 86_400_000));
  return {
    name: "",
    slug: "",
    slugTouched: false,
    tagline: "",
    description: "",
    dates: { submissions_open_at: at(0), submissions_deadline: at(2), judging_deadline: at(4), voting_opens_at: at(2), voting_closes_at: at(5) },
    tracks: [row("Open track", "Anything goes.")],
    prizes: [row("Grand prize", "Best overall project.")],
    criteria: [
      { ...row("Functionality", "Does it work end to end?"), weight: 4 },
      { ...row("Quality", "Code, design and polish."), weight: 3 },
      { ...row("Innovation", "Is the idea or approach new?"), weight: 3 },
    ],
    scale_min: 1,
    scale_max: 5,
    judging_mode: "rubric",
    reviews_per_project: 3,
    voting_access: "email_gated",
    vote_mode: "one_person_one_vote",
    quadratic_budget: 100,
    max_team_size: 5,
  };
}

function validate(step: number, s: WizardState): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (!s.name.trim()) e.name = "Give the event a name.";
    if (!/^[a-z0-9][a-z0-9-]{1,78}$/.test(s.slug)) e.slug = "2–79 characters: lowercase letters, numbers and dashes.";
  }
  if (step === 1) {
    const t = (k: keyof WizardState["dates"]) => (s.dates[k] ? new Date(s.dates[k]).getTime() : null);
    const before = (a: keyof WizardState["dates"], b: keyof WizardState["dates"], msg: string, strict = true) => {
      const x = t(a);
      const y = t(b);
      if (x !== null && y !== null && (strict ? x >= y : x > y)) e[b] = msg;
    };
    before("submissions_open_at", "submissions_deadline", "Must be after submissions open.");
    before("submissions_deadline", "judging_deadline", "Must be on or after the submission deadline.", false);
    before("voting_opens_at", "voting_closes_at", "Must be after voting opens.");
    if (Boolean(s.dates.voting_opens_at) !== Boolean(s.dates.voting_closes_at)) {
      e[s.dates.voting_opens_at ? "voting_closes_at" : "voting_opens_at"] = "Set both voting dates, or neither.";
    }
  }
  if (step === 2) {
    if (!(s.max_team_size >= 1 && s.max_team_size <= 20)) e.max_team_size = "Between 1 and 20.";
    s.tracks.forEach((r, i) => !r.name.trim() && r.description.trim() && (e[`tracks.${i}`] = "Name this track or remove it."));
    s.prizes.forEach((r, i) => !r.name.trim() && r.description.trim() && (e[`prizes.${i}`] = "Name this prize or remove it."));
  }
  if (step === 3) {
    s.criteria.forEach((c, i) => !c.name.trim() && (e[`criteria.${i}`] = "Name this criterion."));
    if (!s.criteria.length) e.criteria = "Add at least one criterion.";
    if (!(s.scale_min >= 0 && s.scale_max <= 100 && s.scale_min < s.scale_max)) e.scale = "Minimum must be below maximum (0–100).";
    if (!(s.reviews_per_project >= 1 && s.reviews_per_project <= 20)) e.reviews_per_project = "Between 1 and 20.";
  }
  if (step === 4) {
    if (s.vote_mode === "quadratic" && !(s.quadratic_budget >= 1 && s.quadratic_budget <= 1000)) e.quadratic_budget = "Between 1 and 1000.";
  }
  return e;
}

function payload(s: WizardState) {
  const named = (rows: WizardState["tracks"]) => rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), description: r.description.trim() }));
  return {
    name: s.name.trim(),
    slug: s.slug,
    tagline: s.tagline.trim(),
    description: s.description.trim(),
    ...Object.fromEntries(DATE_FIELDS.map((f) => [f.key, toIso(s.dates[f.key])])),
    judging_mode: s.judging_mode,
    voting_access: s.voting_access,
    vote_mode: s.vote_mode,
    reviews_per_project: s.reviews_per_project,
    quadratic_budget: s.quadratic_budget,
    max_team_size: s.max_team_size,
    tracks: named(s.tracks),
    prizes: named(s.prizes),
    rubric: {
      scale_min: s.scale_min,
      scale_max: s.scale_max,
      criteria: s.criteria.map((c) => ({ name: c.name.trim(), description: c.description.trim(), weight: c.weight })),
    },
  };
}

export default function NewEventPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, loading } = useAuth();
  const [state, setState] = useState(initialState);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<"create" | "import" | null>(null);

  const set = (patch: Partial<WizardState>) => {
    setState((s) => ({ ...s, ...patch }));
    setErrors({});
  };

  function go(to: number) {
    if (to > step) {
      for (let i = step; i < to; i++) {
        const e = validate(i, state);
        if (Object.keys(e).length) {
          setStep(i);
          setErrors(e);
          return;
        }
      }
    }
    setDir(to > step ? 1 : -1);
    setErrors({});
    setStep(to);
  }

  async function create() {
    setBusy("create");
    try {
      const event = await api<EventDetail>("/v1/events", { method: "POST", body: json(payload(state)) });
      void fireConfetti();
      toast.success(`${event.name} is live`, "You are its organizer. Invite judges next.");
      router.push(`/events/${event.slug}/organize`);
      router.refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not reach the server";
      toast.error("Could not create the event", msg);
      if (err instanceof ApiError && err.status === 409) {
        setStep(0);
        setErrors({ slug: msg });
      }
      setBusy(null);
    }
  }

  async function importFixture(file: File) {
    setBusy("import");
    try {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error("That file is not valid JSON.");
      }
      const res = await api<{ event: EventDetail; stats: Record<string, number> }>("/v1/import", { method: "POST", body: json(data) });
      void fireConfetti();
      toast.success(`Imported ${res.event.name}`, Object.entries(res.stats).map(([k, v]) => `${v} ${k}`).join(" · "));
      router.push(`/events/${res.event.slug}/organize`);
      router.refresh();
    } catch (err) {
      toast.error("Import failed", err instanceof Error ? (err instanceof ApiError ? err.detail : err.message) : undefined);
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="mt-8 h-96 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={LogIn}
          title="Sign in to create an event"
          description="Whoever creates an event becomes its organizer, so we need an account first."
          action={<Button href={`/login?next=${encodeURIComponent("/events/new")}`}>Sign in</Button>}
        />
      </div>
    );
  }

  const last = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader title="Create an event" description="Six short steps with sensible defaults. You can change everything later from the organizer console." />

      <nav aria-label="Steps" className="mb-6">
        <ol className="flex flex-wrap gap-x-1 gap-y-2">
          {STEPS.map((label, i) => {
            const active = i === step;
            const done = i < step;
            return (
              <li key={label} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex h-9 cursor-pointer items-center gap-2 rounded-(--radius-3) px-2.5 text-sm transition-colors hover:bg-tint",
                    active ? "font-medium text-fg" : done ? "text-fg" : "text-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full text-xs font-medium tabular-nums transition-colors",
                      done ? "bg-accent text-accent-fg" : active ? "bg-fg text-bg" : "bg-tint-strong text-muted",
                    )}
                  >
                    {done ? <Check className="size-3.5" strokeWidth={3} aria-label="done" /> : i + 1}
                  </span>
                  <span className={cn(!active && "hidden md:inline")}>{label}</span>
                </button>
                {i < STEPS.length - 1 && <span aria-hidden className="hidden h-px w-4 bg-line-strong md:block" />}
              </li>
            );
          })}
        </ol>
      </nav>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (last) void create();
          else go(step + 1);
        }}
        className="overflow-hidden rounded-(--radius-5) bg-(--color-panel-solid) shadow-(--shadow-2)"
      >
        <div className="relative p-5 sm:p-8">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -24 }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <h2 className="mb-6 text-lg font-semibold tracking-tight">{STEPS[step]}</h2>
              {step === 0 && <BasicsStep state={state} set={set} errors={errors} onImport={importFixture} importing={busy === "import"} />}
              {step === 1 && <DatesStep state={state} set={set} errors={errors} />}
              {step === 2 && <TeamsStep state={state} set={set} errors={errors} />}
              {step === 3 && <JudgingStep state={state} set={set} errors={errors} />}
              {step === 4 && <VotingStep state={state} set={set} errors={errors} />}
              {step === 5 && <ReviewStep state={state} />}
            </motion.div>
          </AnimatePresence>
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-8">
          <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0 || busy !== null}>
            <ArrowLeft /> Back
          </Button>
          <span className="hidden text-sm text-muted sm:block">
            Step {step + 1} of {STEPS.length}
          </span>
          <Button type="submit" loading={busy === "create"} disabled={busy === "import"}>
            {last ? (
              <>
                Create event
              </>
            ) : (
              <>
                Continue <ArrowRight />
              </>
            )}
          </Button>
        </footer>
      </form>
    </div>
  );
}
