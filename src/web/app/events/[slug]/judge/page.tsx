"use client";

import { ArrowDown, ArrowUp, ExternalLink, FolderGit2, Keyboard, ListChecks, Lock, PlayCircle, Scale, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EASE } from "@/components/amicro/presets";
import { useEvent } from "@/components/event-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { api, ApiError, json } from "@/lib/api";
import type { Queue, QueueItem, Rubric } from "@/lib/types";
import { AllDone } from "./all-done";
import { JudgeRefusal } from "./judge-refusal";
import { matchesFilter, QueueList, STATUS_LABEL, StatusIcon, statusOf, type QueueFilter } from "./queue-list";
import { focusCriterionControl, formFromItem, sameForm, ScoreForm, type FormState } from "./score-form";
import { ShortcutsDialog } from "./shortcuts-dialog";

type SaveResult = { id: string; weighted: number | null; submitted: boolean };
const SUMMARY = "summary";
const EMPTY: FormState = { values: {}, comment: "" };

function cellsOf(rubric: Rubric, form: FormState) {
  return rubric.criteria.filter((c) => form.values[c.id] !== undefined).map((c) => ({ criterion_id: c.id, value: form.values[c.id] }));
}

/** The next project still to score after `fromId`, wrapping around. May return `fromId` itself when it is the only one left. */
function nextTodo(items: QueueItem[], fromId: string) {
  const start = items.findIndex((i) => i.assignment_id === fromId);
  for (let k = 1; k <= items.length; k++) {
    const item = items[(start + k) % items.length];
    if (statusOf(item) !== "done") return item;
  }
  return null;
}

const SHORTCUTS = [
  { keys: [["J"], ["↓"]], label: "Next project" },
  { keys: [["K"], ["↑"]], label: "Previous project" },
  { keys: [["1–9"]], label: "Score the highlighted criterion, then move to the next" },
  { keys: [["0"]], label: "Score 10, on a 1–10 scale" },
  { keys: [["Tab"], ["]"]], label: "Next criterion" },
  { keys: [["Shift", "Tab"], ["["]], label: "Previous criterion" },
  { keys: [["←"], ["→"]], label: "Change the highlighted score by one" },
  { keys: [["S"], ["Ctrl", "S"]], label: "Save draft" },
  { keys: [["Ctrl", "↵"]], label: "Submit and go to the next project" },
  { keys: [["Esc"]], label: "Leave the comment box" },
  { keys: [["?"]], label: "Show this help" },
];

export default function JudgePage() {
  const { event } = useEvent();
  const toast = useToast();
  const rubric = event.rubric;
  const slug = event.slug;

  const [queue, setQueue] = useState<Queue | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [view, setView] = useState<string | null>(null); // assignment id or SUMMARY
  const [form, setForm] = useState<FormState>(EMPTY);
  const [baseline, setBaseline] = useState<FormState>(EMPTY);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [focusIdx, setFocusIdx] = useState(0);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [help, setHelp] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const viewRef = useRef<string | null>(null); // the open view, for async saves that finish after the judge moved on

  const items = queue?.items ?? [];
  const current = items.find((i) => i.assignment_id === view) ?? null;
  const readOnly = queue?.judging_closed ?? false;
  const dirty = current !== null && !sameForm(form, baseline);
  const done = items.filter((i) => statusOf(i) === "done").length;

  const open = useCallback((target: QueueItem | typeof SUMMARY) => {
    clearTimeout(advanceTimer.current);
    setCelebrating(false);
    viewRef.current = target === SUMMARY ? SUMMARY : target.assignment_id;
    if (target === SUMMARY) {
      setView(SUMMARY);
      setForm(EMPTY);
      setBaseline(EMPTY);
    } else {
      const f = formFromItem(target);
      setView(target.assignment_id);
      setForm(f);
      setBaseline(f);
    }
    setFocusIdx(0);
  }, []);

  useEffect(() => {
    let alive = true;
    api<Queue>(`/v1/events/${slug}/assignments/mine`)
      .then((q) => {
        if (!alive) return;
        setQueue(q);
        const first = q.items.find((i) => statusOf(i) !== "done");
        if (q.items.length) open(first ?? SUMMARY);
      })
      .catch((err) => alive && setFailure(err instanceof ApiError ? err : new ApiError(0, "Could not reach the API")));
    return () => {
      alive = false;
    };
  }, [slug, open]);

  // After switching, bring the top of the panel back into view if it is under the sticky bars.
  const mainRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < (parseFloat(getComputedStyle(el).scrollMarginTop) || 0)) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [view]);

  // Leaving the page with unsaved scores: let the browser ask.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function patchItem(list: QueueItem[], id: string, f: FormState, res: SaveResult) {
    return list.map((i) =>
      i.assignment_id === id
        ? { ...i, score: { id: res.id, cells: cellsOf(rubric!, f), comment: f.comment, submitted: res.submitted, weighted: res.weighted } }
        : i,
    );
  }

  function put(item: QueueItem, f: FormState, submitted: boolean) {
    return api<SaveResult>(`/v1/events/${slug}/assignments/${item.assignment_id}/score`, {
      method: "PUT",
      body: json({ cells: cellsOf(rubric!, f), comment: f.comment, submitted }),
    });
  }

  /** Switching away from a dirty form saves it silently. A submitted review stays submitted. */
  function goTo(target: QueueItem | typeof SUMMARY) {
    if (current && dirty && !readOnly && rubric) {
      const item = current;
      const f = form;
      const complete = rubric.criteria.every((c) => f.values[c.id] !== undefined);
      put(item, f, Boolean(item.score?.submitted) && complete)
        .then((res) => setQueue((q) => q && { ...q, items: patchItem(q.items, item.assignment_id, f, res) }))
        .catch((err: ApiError) => toast.error(`Could not autosave “${item.project.title}”`, err.detail));
    }
    open(target);
  }

  function step(delta: number) {
    if (!items.length) return;
    const list = items.filter((i) => matchesFilter(i, filter));
    const pool = list.length ? list : items;
    const idx = pool.findIndex((i) => i.assignment_id === view);
    const next = idx < 0 ? (delta > 0 ? (pool.find((i) => statusOf(i) !== "done") ?? pool[0]) : pool[pool.length - 1]) : pool[idx + delta];
    if (next) goTo(next);
  }

  function focusCriterion(i: number) {
    if (!rubric) return;
    const clamped = Math.max(0, Math.min(rubric.criteria.length - 1, i));
    setFocusIdx(clamped);
    focusCriterionControl(rubric.criteria[clamped].id);
  }

  async function save(submitted: boolean) {
    if (!current || !rubric || readOnly || saving || celebrating) return;
    const missing = rubric.criteria.findIndex((c) => form.values[c.id] === undefined);
    if (submitted && missing >= 0) {
      const left = rubric.criteria.filter((c) => form.values[c.id] === undefined).length;
      toast.error("Score every criterion before submitting", `${left} left, starting with ${rubric.criteria[missing].name}.`);
      focusCriterion(missing);
      return;
    }
    const item = current;
    const f = form;
    setSaving(submitted ? "submit" : "draft");
    try {
      const res = await put(item, f, submitted);
      setQueue((q) => q && { ...q, items: patchItem(q.items, item.assignment_id, f, res) });
      if (viewRef.current !== item.assignment_id) return; // moved on while saving: keep the new form as it is
      setBaseline(f);
      if (!submitted) {
        toast.success("Draft saved", "Only you can see it. Submit when you are ready.");
        return;
      }
      setCelebrating(true);
      const next = nextTodo(patchItem(items, item.assignment_id, f, res), item.assignment_id);
      advanceTimer.current = setTimeout(() => open(next ?? SUMMARY), 700);
    } catch (err) {
      toast.error(submitted ? "Could not submit" : "Could not save", err instanceof ApiError ? err.detail : undefined);
    } finally {
      setSaving(null);
    }
  }

  function setDigit(key: string) {
    if (!rubric || !current || readOnly || saving || celebrating) return;
    const d = Number(key);
    const v = d === 0 && rubric.scale_max === 10 ? 10 : d;
    if (v < rubric.scale_min || v > rubric.scale_max) return;
    const c = rubric.criteria[focusIdx];
    setForm((f) => ({ ...f, values: { ...f.values, [c.id]: v } }));
    if (focusIdx < rubric.criteria.length - 1) focusCriterion(focusIdx + 1);
  }

  // Re-registered each render so the handler always sees current state; cheap.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (help || e.defaultPrevented || !queue) return;
      const t = e.target as HTMLElement;
      // Score buttons are radios and sliders are ranges: shortcuts keep working on them.
      const typing = t.closest?.('textarea, select, [contenteditable="true"], input:not([type="range"]):not([type="radio"])');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        void save(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save(false);
        return;
      }
      if (typing) {
        if (e.key === "Escape") t.blur();
        return;
      }
      if (mod || e.altKey) return;
      const k = e.key;
      if (k === "j" || k === "J" || k === "ArrowDown") step(1);
      else if (k === "k" || k === "K" || k === "ArrowUp") step(-1);
      else if (k === "?") setHelp(true);
      else if (k === "s" || k === "S") void save(false);
      else if (k === "]") focusCriterion(focusIdx + 1);
      else if (k === "[") focusCriterion(focusIdx - 1);
      else if (/^[0-9]$/.test(k)) setDigit(k);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (failure) {
    if (failure.status === 401 || failure.status === 403) return <JudgeRefusal status={failure.status} slug={slug} next={`/events/${slug}/judge`} />;
    return (
      <EmptyState
        icon={Lock}
        title="Your queue did not load"
        description={failure.detail}
        action={
          <Button variant="secondary" onClick={() => location.reload()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!queue) return <ConsoleSkeleton />;
  if (!rubric) return <EmptyState icon={ListChecks} title="No rubric yet" description="The organizer has not set up the scoring rubric for this event." />;

  const pct = items.length ? (done / items.length) * 100 : 0;
  const left = items.length - done;
  const pairwiseHref = `/events/${slug}/judge/pairwise`;
  const upcoming = current ? nextTodo(items, current.assignment_id) : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Your reviews</h1>
          {items.length > 0 && (
            <div className="mt-3 flex max-w-md items-center gap-3">
              <Progress value={pct} className="flex-1" aria-label="Reviews submitted" />
              <span className="text-sm whitespace-nowrap text-muted tabular-nums">
                {left === 0 ? `All ${items.length} submitted` : `${left} of ${items.length} left`}
              </span>
            </div>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
            <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
            Only you and the organizers see your scores. The API refuses anyone else.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" href={pairwiseHref}>
            <Scale /> Compare in pairs
          </Button>
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => setHelp(true)} aria-keyshortcuts="?">
            <Keyboard /> Shortcuts <Kbd>?</Kbd>
          </Button>
        </div>
      </header>

      {readOnly && (
        <Callout tone="warning" icon={Lock}>
          Judging has closed. Your reviews are final and shown read only.
        </Callout>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nothing assigned to you yet"
          description="The organizer assigns projects once submissions close. They will appear here, one at a time."
          action={
            <Button variant={event.judging_mode === "pairwise" ? "primary" : "secondary"} href={pairwiseHref}>
              <Scale /> Compare in pairs
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
          {/* The project comes first in the DOM (and on phones); the queue sits beside it from lg up. */}
          <div ref={mainRef} className="min-w-0 scroll-mt-20 sm:scroll-mt-44 lg:col-start-2 lg:row-start-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view ?? "none"}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="min-w-0"
              >
                {current ? (
                  <div className="flex flex-col gap-4">
                    <ProjectPanel item={current} position={items.indexOf(current) + 1} total={items.length} onPrev={() => step(-1)} onNext={() => step(1)} />
                    <ScoreForm
                      rubric={rubric}
                      form={form}
                      onChange={setForm}
                      focusIdx={focusIdx}
                      onFocusIdx={setFocusIdx}
                      readOnly={readOnly}
                      saving={saving}
                      submitted={Boolean(current.score?.submitted)}
                      dirty={dirty}
                      celebrating={celebrating}
                      last={!upcoming || upcoming === current}
                      onSaveDraft={() => void save(false)}
                      onSubmit={() => void save(true)}
                    />
                  </div>
                ) : (
                  <AllDone
                    items={items}
                    rubric={rubric}
                    slug={slug}
                    readOnly={readOnly}
                    onOpen={goTo}
                    onContinue={() => {
                      const next = items.find((i) => statusOf(i) !== "done");
                      if (next) goTo(next);
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <aside
            aria-label="Your queue"
            className="rounded-(--radius-4) border border-line bg-surface p-3 lg:sticky lg:top-(--event-sticky-top) lg:col-start-1 lg:row-start-1"
          >
            <QueueList items={items} currentId={view} filter={filter} onFilter={setFilter} onSelect={goTo} />
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 pl-1 text-xs text-muted">
              <span className="hidden items-center gap-1 sm:flex">
                <Kbd>J</Kbd>
                <Kbd>K</Kbd> to move
              </span>
              <Button variant="ghost" size="sm" onClick={() => goTo(SUMMARY)} aria-current={view === SUMMARY ? "true" : undefined}>
                <ListChecks /> Summary
              </Button>
            </div>
          </aside>
        </div>
      )}

      <ShortcutsDialog open={help} onClose={() => setHelp(false)} rows={SHORTCUTS} />
    </div>
  );
}

function ProjectPanel({ item, position, total, onPrev, onNext }: { item: QueueItem; position: number; total: number; onPrev: () => void; onNext: () => void }) {
  const p = item.project;
  const status = statusOf(item);
  // Many teams open the description with the summary; do not show it twice.
  const description = (p.summary && p.description.startsWith(p.summary) ? p.description.slice(p.summary.length) : p.description).trim();
  const links = [
    { href: p.repo_url, label: "Repository", icon: FolderGit2 },
    { href: p.live_link, label: "Live app", icon: ExternalLink },
    { href: p.demo_video_url, label: "Demo video", icon: PlayCircle },
  ].filter((l) => l.href);

  return (
    <Card asChild className="p-5 sm:p-6">
      <article aria-labelledby="project-title">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted tabular-nums">
            Project {position} of {total}
          </p>
          <div className="flex gap-1">
            <Tooltip content="Previous project (K)">
              <Button variant="ghost" size="icon" onClick={onPrev} aria-label="Previous project" aria-keyshortcuts="K" disabled={position === 1}>
                <ArrowUp />
              </Button>
            </Tooltip>
            <Tooltip content="Next project (J)">
              <Button variant="ghost" size="icon" onClick={onNext} aria-label="Next project" aria-keyshortcuts="J" disabled={position === total}>
                <ArrowDown />
              </Button>
            </Tooltip>
          </div>
        </div>
        <h2 id="project-title" className="mt-1 text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">
          {p.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <span>
            by <span className="text-fg">{p.team}</span>
          </span>
          {p.track && <Badge tone="neutral">{p.track}</Badge>}
          <span className="inline-flex items-center gap-1.5">
            <StatusIcon status={status} />
            {STATUS_LABEL[status]}
          </span>
        </div>
        {p.summary && <p className="mt-4 max-w-3xl text-base leading-relaxed text-fg">{p.summary}</p>}
        {description && <p className="mt-3 max-w-3xl text-sm leading-relaxed whitespace-pre-line text-muted">{description}</p>}
        {links.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {links.map(({ href, label, icon: Icon }) => (
              <Button key={label} variant="secondary" size="sm" href={href} target="_blank" rel="noopener noreferrer">
                <Icon /> {label}
                <span className="sr-only">(opens in a new tab)</span>
              </Button>
            ))}
          </div>
        )}
      </article>
    </Card>
  );
}

function ConsoleSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading your queue">
      <Skeleton className="h-20 max-w-md" />
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Skeleton className="h-96 rounded-(--radius-4)" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48 rounded-(--radius-4)" />
          <Skeleton className="h-80 rounded-(--radius-4)" />
        </div>
      </div>
    </div>
  );
}
