"use client";

import { AnimatePresence, motion } from "motion/react";
import { AnimatedCheck } from "@/components/ui/animated-check";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Slider } from "@/components/ui/slider";
import type { QueueItem, Rubric } from "@/lib/types";
import { cn } from "@/lib/utils";

export type FormState = { values: Record<string, number>; comment: string };

export const COMMENT_MAX = 5000;
/** Scales with this many steps or fewer get one button per score; wider ones get a slider. */
const PICKER_MAX_STEPS = 7;

export function formFromItem(item: QueueItem): FormState {
  return {
    values: Object.fromEntries((item.score?.cells ?? []).map((c) => [c.criterion_id, c.value])),
    comment: item.score?.comment ?? "",
  };
}

export function sameForm(a: FormState, b: FormState) {
  const ka = Object.keys(a.values);
  return a.comment === b.comment && ka.length === Object.keys(b.values).length && ka.every((k) => a.values[k] === b.values[k]);
}

/** Weights arrive normalized (sum 1), so the total is Σ w·x. With criteria missing it is the mean over the scored ones. */
export function weightedTotal(rubric: Rubric, values: Record<string, number>) {
  const scored = rubric.criteria.filter((c) => values[c.id] !== undefined);
  const w = scored.reduce((s, c) => s + c.weight, 0);
  const total = w > 0 ? scored.reduce((s, c) => s + c.weight * values[c.id], 0) / w : null;
  return { total, scored: scored.length, complete: scored.length === rubric.criteria.length };
}

export const critInputId = (criterionId: string) => `crit-${criterionId}`;

/** Focus the control for a criterion: the slider thumb, or the picked (else first) score button. */
export function focusCriterionControl(criterionId: string) {
  const el = document.getElementById(critInputId(criterionId));
  const target = el?.getAttribute("role") === "radiogroup" ? (el.querySelector<HTMLElement>("input:checked") ?? el.querySelector<HTMLElement>("input")) : el;
  target?.focus();
}

type ScoreFormProps = {
  rubric: Rubric;
  form: FormState;
  onChange: (next: FormState) => void;
  focusIdx: number;
  onFocusIdx: (i: number) => void;
  readOnly: boolean;
  saving: "draft" | "submit" | null;
  submitted: boolean;
  dirty: boolean;
  celebrating: boolean;
  /** No other project is left to score after this one. */
  last: boolean;
  onSaveDraft: () => void;
  onSubmit: () => void;
};

export function ScoreForm({ rubric, form, onChange, focusIdx, onFocusIdx, readOnly, saving, submitted, dirty, celebrating, last, onSaveDraft, onSubmit }: ScoreFormProps) {
  const { total, scored, complete } = weightedTotal(rubric, form.values);
  const steps = rubric.scale_max - rubric.scale_min + 1;
  const picker = steps <= PICKER_MAX_STEPS;
  const keys = `${rubric.scale_min}–${Math.min(rubric.scale_max, 9)}`;
  const status = readOnly
    ? "Judging has closed. Read only."
    : saving
      ? "Saving…"
      : dirty
        ? "Unsaved. Switching projects saves a draft."
        : submitted
          ? "Submitted. You can change it and resubmit until judging closes."
          : scored > 0
            ? "Draft saved. Only you can see it."
            : "Not scored yet.";

  return (
    <Card asChild className="overflow-visible">
      <section aria-labelledby="score-heading" className="relative">
        <div className="border-b border-line px-5 pt-5 pb-4 sm:px-6">
          <h3 id="score-heading" className="text-base font-semibold tracking-tight text-fg">
            Your scores
          </h3>
          <p className="mt-1 text-sm text-muted">
            {rubric.scale_min} is weakest, {rubric.scale_max} is strongest.
            <span className="hidden sm:inline"> Number keys score the highlighted criterion and move to the next.</span>
          </p>
        </div>

        <ol>
          {rubric.criteria.map((c, i) => {
            const value = form.values[c.id];
            const focused = i === focusIdx && !readOnly;
            const nameId = `${critInputId(c.id)}-name`;
            return (
              <li
                key={c.id}
                onFocus={() => onFocusIdx(i)}
                onPointerDown={() => onFocusIdx(i)}
                className={cn(
                  "grid gap-3 border-b border-line px-5 py-4 transition-colors sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] md:items-center md:gap-8",
                  focused && "bg-tint",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span id={nameId} className="font-medium text-fg">
                      {c.name}
                    </span>
                    <span className="text-sm text-muted tabular-nums">
                      <span className="sr-only">weight </span>
                      {Math.round(c.weight * 100)}%
                    </span>
                    {focused && <Kbd className="hidden sm:inline-flex">{keys}</Kbd>}
                  </div>
                  {c.description && <p className="mt-1 text-sm leading-relaxed text-muted">{c.description}</p>}
                </div>
                {picker ? (
                  <ScorePicker
                    id={critInputId(c.id)}
                    labelledBy={nameId}
                    value={value}
                    min={rubric.scale_min}
                    max={rubric.scale_max}
                    disabled={readOnly}
                    onChange={(v) => onChange({ ...form, values: { ...form.values, [c.id]: v } })}
                  />
                ) : (
                  <Slider
                    id={critInputId(c.id)}
                    aria-label={c.name}
                    value={value ?? rubric.scale_min}
                    onValueChange={(v) => onChange({ ...form, values: { ...form.values, [c.id]: v } })}
                    min={rubric.scale_min}
                    max={rubric.scale_max}
                    step={1}
                    ticks={steps <= 11 && Array.from({ length: steps }, (_, n) => String(rubric.scale_min + n))}
                    disabled={readOnly}
                    formatValue={(v) => (value === undefined ? "–" : String(v))}
                    className={cn(value === undefined && "[&_.rt-SliderRange]:opacity-0 [&_.rt-SliderThumb]:opacity-40 [&_button.font-semibold]:font-normal [&_button.font-semibold]:text-subtle")}
                  />
                )}
              </li>
            );
          })}
        </ol>

        <div className="px-5 py-4 sm:px-6">
          <Field label="Comment (optional)" hint={form.comment.length > COMMENT_MAX * 0.9 ? `${form.comment.length} of ${COMMENT_MAX} characters.` : "Only you and the organizers can read it."}>
            <Textarea
              rows={3}
              maxLength={COMMENT_MAX}
              value={form.comment}
              disabled={readOnly}
              placeholder="What stood out, what broke, what you would ask the team."
              onChange={(e) => onChange({ ...form, comment: e.target.value })}
            />
          </Field>
        </div>

        <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-b-(--radius-4) border-t border-line bg-(--color-panel-solid) px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <div className="shrink-0">
              <div className="text-xs text-muted">Weighted total{!complete && scored > 0 ? " so far" : ""}</div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-semibold tracking-tight text-fg tabular-nums">{total === null ? "–" : total.toFixed(2)}</span>
                <span className="text-sm text-muted">out of {rubric.scale_max}</span>
              </div>
            </div>
            <p role="status" aria-live="polite" className={cn("min-w-0 text-sm", dirty && !saving ? "text-amber-11" : "text-muted")}>
              {status}
            </p>
          </div>
          {!readOnly && (
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
              <Button variant="secondary" onClick={onSaveDraft} loading={saving === "draft"} disabled={saving !== null || celebrating} aria-keyshortcuts="S">
                Save draft <Kbd className="hidden sm:inline-flex">S</Kbd>
              </Button>
              <Button onClick={onSubmit} loading={saving === "submit"} disabled={saving !== null || celebrating} aria-keyshortcuts="Control+Enter">
                {last ? "Submit and finish" : "Submit and next"}
                <Kbd className="hidden border-accent-fg/25 bg-accent-fg/10 text-accent-fg sm:inline-flex">Ctrl ↵</Kbd>
              </Button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {celebrating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-20 grid place-items-center rounded-[inherit] bg-(--color-panel-solid)/90"
              role="status"
            >
              <div className="flex flex-col items-center gap-2">
                <AnimatedCheck size={56} label="Review submitted" />
                <div className="font-semibold text-fg">Submitted</div>
                {total !== null && (
                  <div className="text-sm text-muted tabular-nums">
                    {total.toFixed(2)} out of {rubric.scale_max}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </Card>
  );
}

type ScorePickerProps = {
  id: string;
  labelledBy: string;
  value: number | undefined;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
};

/** One large button per score, as a native radio group: Tab reaches it, ← → change the pick, number keys work from the page. */
function ScorePicker({ id, labelledBy, value, min, max, disabled, onChange }: ScorePickerProps) {
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="grid gap-1 rounded-(--radius-3) bg-surface-2 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((n) => {
        const on = value === n;
        return (
          <label
            key={n}
            className={cn(
              "grid h-11 place-items-center rounded-(--radius-2) font-mono text-base tabular-nums transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus-8)",
              on ? "bg-fg font-semibold text-bg shadow-card" : "text-muted",
              !on && !disabled && "cursor-pointer hover:bg-tint-strong hover:text-fg",
              disabled && !on && "opacity-60",
            )}
          >
            <input type="radio" name={id} value={n} checked={on} disabled={disabled} onChange={() => onChange(n)} className="sr-only" />
            {n}
          </label>
        );
      })}
    </div>
  );
}
