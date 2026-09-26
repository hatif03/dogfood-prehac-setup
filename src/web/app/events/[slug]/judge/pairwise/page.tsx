"use client";

import { ArrowLeft, Check, FolderGit2, Scale, SkipForward } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { EASE } from "@/components/amicro/presets";
import { useEvent } from "@/components/event-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, json } from "@/lib/api";
import type { PairCard, PairNext } from "@/lib/types";
import { cn } from "@/lib/utils";
import { JudgeRefusal } from "../judge-refusal";

type Side = "left" | "right";

export default function PairwisePage() {
  const { event } = useEvent();
  const toast = useToast();
  const slug = event.slug;
  const [next, setNext] = useState<PairNext | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [chosen, setChosen] = useState<Side | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(0); // comparisons made on this visit

  const load = useCallback(async () => {
    try {
      const n = await api<PairNext>(`/v1/events/${slug}/pairwise/next`);
      setNext(n);
      setChosen(null);
      return n;
    } catch (err) {
      setFailure(err instanceof ApiError ? err : new ApiError(0, "Could not reach the API"));
      return null;
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function choose(side: Side) {
    if (!next || next.done || busy) return;
    const winner = next[side];
    const loser = next[side === "left" ? "right" : "left"];
    setBusy(true);
    setChosen(side);
    try {
      await Promise.all([
        api(`/v1/events/${slug}/pairwise`, { method: "POST", body: json({ winner_id: winner.id, loser_id: loser.id }) }),
        new Promise((r) => setTimeout(r, 350)), // let the pick register before the next pair comes in
      ]);
      setSession((s) => s + 1);
      await load();
    } catch (err) {
      setChosen(null);
      toast.error("Could not record your choice", err instanceof ApiError ? err.detail : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (busy || !next || next.done) return;
    setBusy(true);
    await load();
    setBusy(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      if (t.closest?.('textarea, input, select, [contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") void choose("left");
      else if (k === "arrowright" || k === "d") void choose("right");
      else if (k === "s") void skip();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (failure) {
    if (failure.status === 401 || failure.status === 403) return <JudgeRefusal status={failure.status} slug={slug} next={`/events/${slug}/judge/pairwise`} />;
    return (
      <EmptyState
        icon={Scale}
        title="Pairs did not load"
        description={failure.detail}
        action={
          <Button variant="secondary" onClick={() => location.reload()}>
            Try again
          </Button>
        }
      />
    );
  }

  const compared = next?.compared ?? 0;
  const possible = next && !next.done ? next.possible : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Compare in pairs</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Pick the better project of the two. Every project gets compared; you never see the same pair twice.</p>
        </div>
        <Button variant="secondary" size="sm" href={`/events/${slug}/judge`} className="self-start sm:self-auto">
          <ArrowLeft /> Your reviews
        </Button>
      </header>

      {!next ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading the next pair">
          <Skeleton className="h-72 rounded-(--radius-4)" />
          <Skeleton className="h-72 rounded-(--radius-4)" />
        </div>
      ) : next.done ? (
        <Finished compared={next.compared} session={session} slug={slug} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Progress value={possible ? (compared / possible) * 100 : 0} className="max-w-56 flex-1" aria-label="Pairs compared" />
              <span className="text-sm text-muted tabular-nums" aria-live="polite">
                {compared} of {possible} pairs compared
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void skip()} disabled={busy} aria-keyshortcuts="S">
              <SkipForward /> Skip this pair <Kbd className="hidden sm:inline-flex">S</Kbd>
            </Button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${next.left.id}:${next.right.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="grid gap-4 md:grid-cols-2 md:gap-6"
            >
              <Choice card={next.left} side="left" chosen={chosen} disabled={busy} onChoose={choose} />
              <Choice card={next.right} side="right" chosen={chosen} disabled={busy} onChoose={choose} />
            </motion.div>
          </AnimatePresence>

          <p className="hidden text-center text-sm text-muted sm:block">
            Choose with a click, <Kbd>←</Kbd> or <Kbd>→</Kbd>. Judge the project, not the pitch.
          </p>
        </>
      )}
    </div>
  );
}

function Choice({ card, side, chosen, disabled, onChoose }: { card: PairCard; side: Side; chosen: Side | null; disabled: boolean; onChoose: (s: Side) => void }) {
  const won = chosen === side;
  const lost = chosen !== null && !won;
  const arrow = side === "left" ? "←" : "→";
  return (
    <Card className={cn("flex flex-col transition-[opacity,box-shadow] duration-200", lost && "opacity-50", won && "shadow-[inset_0_0_0_2px_var(--accent-9)]")}>
      <button
        type="button"
        onClick={() => onChoose(side)}
        disabled={disabled}
        aria-keyshortcuts={side === "left" ? "ArrowLeft" : "ArrowRight"}
        aria-pressed={won}
        className="group flex min-h-48 flex-1 cursor-pointer flex-col items-start gap-3 p-6 text-left transition-colors hover:bg-tint disabled:cursor-default sm:p-8 md:min-h-64"
      >
        {card.track ? <Badge tone="neutral">{card.track}</Badge> : null}
        <h2 className="text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">{card.title}</h2>
        <p className="text-base leading-relaxed text-muted">{card.summary || "No summary given."}</p>
        <span className={cn("mt-auto inline-flex items-center gap-2 pt-6 text-sm font-medium", won ? "text-accent-11" : "text-muted group-hover:text-fg")}>
          {won ? <Check className="size-4" aria-hidden /> : <Kbd className="hidden sm:inline-flex">{arrow}</Kbd>}
          {won ? "Chosen" : "This one is better"}
        </span>
      </button>
      {card.repo_url && (
        <a
          href={card.repo_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 border-t border-line px-6 py-3 text-sm text-muted transition-colors hover:bg-tint hover:text-fg sm:px-8"
        >
          <FolderGit2 className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{card.repo_url.replace(/^https?:\/\//, "")}</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </Card>
  );
}

function Finished({ compared, session, slug }: { compared: number; session: number; slug: string }) {
  return (
    <EmptyState
      icon={Scale}
      title={compared ? "No pairs left for you." : "Nothing to compare yet."}
      description={
        compared
          ? `You made ${compared} ${compared === 1 ? "comparison" : "comparisons"}${session > 0 ? `, ${session} of them just now` : ""}. The organizer turns them into a ranking and checks it against the rubric scores.`
          : "Comparing needs at least two submitted projects in your tracks. Check back once more are in."
      }
      action={
        <Button href={`/events/${slug}/judge`} variant="secondary">
          <ArrowLeft /> Back to your reviews
        </Button>
      }
    />
  );
}
