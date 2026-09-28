"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useEvent } from "@/components/event-context";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, json } from "@/lib/api";
import type { Dashboard, NormalizationRun } from "@/lib/types";
import { cn } from "@/lib/utils";

// Fields the API returns that lib/types.ts does not list yet (organizer-only).
export type { Outlier } from "@/lib/types";
export type Run = NormalizationRun;
export type Dash = Dashboard;

export type OrgTab = "overview" | "people" | "results" | "voting" | "settings" | "data" | "audit";

/** GET a JSON endpoint. 404 resolves to `data: null` with `missing: true` ("none yet"). Optional polling pauses while the tab is hidden. */
export function useApi<T>(path: string | null, { pollMs }: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const next = await api<T>(path);
      if (!alive.current) return;
      setData(next);
      setError(null);
      setMissing(false);
      setUpdatedAt(Date.now());
    } catch (e) {
      if (!alive.current) return;
      const err = e instanceof ApiError ? e : new ApiError(0, String(e));
      if (err.status === 404) {
        setData(null);
        setMissing(true);
        setError(null);
      } else setError(err);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  useEffect(() => {
    if (!pollMs) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      if (document.visibilityState === "visible") timer = setInterval(reload, pollMs);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") reload();
      start();
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pollMs, reload]);

  return { data, setData, error, missing, loading, reload, updatedAt };
}
export type ApiState<T> = ReturnType<typeof useApi<T>>;

/** What every tab may need from the console: the live dashboard, the latest normalization run, and tab navigation. */
export type ConsoleCtx = { dash: ApiState<Dash>; run: ApiState<Run>; go: (t: OrgTab) => void };

/** Re-render every `ms` so relative times stay fresh. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e));
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** ISO (UTC) → value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value → ISO UTC string, or null when empty. */
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/** POST /assignments at the event's target. Shared by the lifecycle rail, the integrity panel and People & judging. */
export function useTopUp(onDone: () => void) {
  const { event } = useEvent();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; warnings: string[] } | null>(null);
  async function topUp(reviews = event.reviews_per_project) {
    setBusy(true);
    try {
      const res = await api<{ created: number; warnings: string[] }>(`/v1/events/${event.slug}/assignments`, { method: "POST", body: json({ reviews_per_project: reviews }) });
      setResult(res);
      toast.success(
        res.created ? `${plural(res.created, "assignment")} created` : "Every project already has enough judges",
        res.warnings.length ? `${plural(res.warnings.length, "project")} could not reach the target. See People & judging.` : "Existing assignments and scores were not touched.",
      );
      onDone();
    } catch (e) {
      toast.error("Assignments not created", errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return { topUp, busy, result };
}

type SectionProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/** A titled block on a console tab: heading, one-line explanation, optional actions, then content. No box of its own. */
export function Section({ title, description, actions, className, children }: SectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-4", className)}>
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 max-w-3xl">
          <h2 id={id} className="font-display text-lg font-semibold tracking-tight text-fg">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** Inline error for a failed fetch, with retry. */
export function LoadError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <Callout
      tone="error"
      title="Could not load this"
      action={
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {error.status ? `${error.status}: ` : ""}
      {error.detail}
    </Callout>
  );
}
