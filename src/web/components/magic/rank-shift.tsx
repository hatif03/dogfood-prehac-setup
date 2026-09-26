"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type RankShiftProps = {
  /** Positive = moved up the ranking (e.g. raw rank 5 → normalized rank 2 is +3). */
  delta: number;
  className?: string;
};

export function RankShift({ delta, className }: RankShiftProps) {
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const tone = delta > 0 ? "text-accent-11 bg-accent/10" : delta < 0 ? "text-coral-11 bg-coral/10" : "text-muted bg-tint-strong";
  const label = delta > 0 ? `Up ${delta}` : delta < 0 ? `Down ${-delta}` : "No change";

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.6, y: delta >= 0 ? 6 : -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      aria-label={label}
      title={label}
      className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums", tone, className)}
    >
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {delta === 0 ? "0" : Math.abs(delta)}
    </motion.span>
  );
}
