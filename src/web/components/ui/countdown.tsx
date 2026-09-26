"use client";

import { useEffect, useRef, useState } from "react";
import { cn, countdownParts, durationWords, formatDate } from "@/lib/utils";
import { Tooltip } from "./tooltip";

type CountdownProps = {
  target: Date | string | number;
  closedLabel?: React.ReactNode;
  onComplete?: () => void;
  /** Ticking `2d 04:13:09` instead of words. Use only where the seconds matter. */
  compact?: boolean;
  className?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Time left in words ("13 days"), with the exact local time in a tooltip. Write the verb around it:
 * `Voting closes in <Countdown … />`. Renders on the server too; the text is refreshed after hydration.
 */
export function Countdown({ target, closedLabel = "Closed", onComplete, compact = false, className }: CountdownProps) {
  const targetMs = new Date(target).getTime();
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, targetMs - now);
  const fast = compact || left < 3_600_000;
  const completed = useRef(false);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), fast ? 1000 : 30_000);
    return () => clearInterval(t);
  }, [fast]);

  useEffect(() => {
    if (left === 0 && !completed.current) {
      completed.current = true;
      onComplete?.();
    }
  }, [left, onComplete]);

  if (left === 0) return <span className={cn("font-medium text-coral-11", className)}>{closedLabel}</span>;

  if (compact) {
    const p = countdownParts(new Date(targetMs), new Date(now));
    return (
      <span role="timer" suppressHydrationWarning className={cn("font-mono tabular-nums text-fg", className)}>
        {p.days > 0 && `${p.days}d `}
        {pad(p.hours)}:{pad(p.minutes)}:{pad(p.seconds)}
      </span>
    );
  }

  return (
    <Tooltip content={formatDate(targetMs, { weekday: "short", timeZoneName: "short" })}>
      <time
        dateTime={new Date(targetMs).toISOString()}
        tabIndex={0}
        suppressHydrationWarning
        className={cn("cursor-help font-medium text-fg underline decoration-line-strong decoration-dotted underline-offset-4", className)}
      >
        {durationWords(left)}
      </time>
    </Tooltip>
  );
}
