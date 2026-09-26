"use client";

import { ArrowRight, Check, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { QueueItem, Rubric } from "@/lib/types";

type AllDoneProps = {
  items: QueueItem[];
  rubric: Rubric;
  slug: string;
  readOnly: boolean;
  onOpen: (item: QueueItem) => void;
  /** Open the next project still to score. */
  onContinue: () => void;
};

/** The summary: what you submitted, and a way back into any review. A primary action only while something is left. */
export function AllDone({ items, rubric, slug, readOnly, onOpen, onContinue }: AllDoneProps) {
  const scored = items
    .filter((i) => i.score?.submitted && i.score.weighted != null)
    .map((i) => ({ item: i, w: i.score!.weighted! }))
    .sort((a, b) => b.w - a.w);
  const mean = scored.length ? scored.reduce((s, x) => s + x.w, 0) / scored.length : null;
  const span = rubric.scale_max - rubric.scale_min || 1;
  const pct = (w: number) => ((w - rubric.scale_min) / span) * 100;
  const left = items.length - scored.length;

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-3 text-fg" aria-hidden>
            {left === 0 ? <Check className="size-5" /> : <span className="font-mono text-sm tabular-nums">{left}</span>}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-tight text-fg">
              {left === 0 ? `All ${items.length} reviews are in.` : `${left} of ${items.length} still to score.`}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
              {left > 0
                ? "This summary counts submitted reviews only."
                : readOnly
                  ? "Judging has closed, so these are final. Thank you for your time."
                  : "You can reopen any review below and resubmit until judging closes."}{" "}
              These are your numbers only. The organizer normalizes across judges before anything is ranked.
            </p>
            {left > 0 && !readOnly && (
              <Button className="mt-4" onClick={onContinue}>
                Score the next project <ArrowRight />
              </Button>
            )}
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-(--radius-3) border border-line bg-line">
          {[
            { label: "Submitted", value: String(scored.length) },
            { label: "Your average", value: mean === null ? "–" : mean.toFixed(2) },
            { label: "Your range", value: scored.length ? `${scored[scored.length - 1].w.toFixed(1)}–${scored[0].w.toFixed(1)}` : "–" },
          ].map((s) => (
            <div key={s.label} className="bg-surface px-3 py-3 sm:px-4">
              <dt className="text-xs text-muted">{s.label}</dt>
              <dd className="mt-0.5 font-mono text-lg font-semibold text-fg tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card asChild>
        <section aria-labelledby="your-reviews" className="p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="your-reviews" className="font-semibold tracking-tight text-fg">
              Your reviews, highest first
            </h3>
            <span className="text-xs text-muted">
              Weighted, out of {rubric.scale_max}. {readOnly ? "Open one to read it." : "Open one to revise it."}
            </span>
          </div>
          <ol className="mt-3 flex flex-col">
            {scored.length === 0 && <li className="py-4 text-sm text-muted">Nothing submitted yet.</li>}
            {scored.map(({ item, w }) => (
              <li key={item.assignment_id}>
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="group grid w-full grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1.5 rounded-(--radius-2) px-2 py-2 text-left transition-colors hover:bg-tint sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_3rem]"
                >
                  <span className="truncate text-sm text-fg">{item.project.title}</span>
                  <span className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-tint-strong sm:col-span-1 sm:row-start-auto">
                    <span className="block h-full rounded-full bg-muted" style={{ width: `${pct(w)}%` }} />
                  </span>
                  <span className="col-start-2 row-start-1 text-right font-mono text-sm text-fg tabular-nums sm:col-start-auto sm:row-start-auto">{w.toFixed(2)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </Card>

      <div className="flex flex-col items-start justify-between gap-3 rounded-(--radius-4) border border-line px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-start gap-3">
          <Scale className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-sm text-muted">
            <span className="font-medium text-fg">Want a second opinion?</span> Compare projects two at a time. Head-to-head choices drift less over a long afternoon than scores do.
          </p>
        </div>
        <Button href={`/events/${slug}/judge/pairwise`} variant="secondary" className="shrink-0">
          Compare in pairs
        </Button>
      </div>
    </div>
  );
}
