"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type AnimatedCheckProps = {
  size?: number;
  delay?: number;
  className?: string;
  label?: string;
};

/** Circle + tick that draw themselves. Re-mount (change `key`) to replay. */
export function AnimatedCheck({ size = 40, delay = 0, className, label = "Saved" }: AnimatedCheckProps) {
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={cn("text-accent-11", className)}
    >
      <motion.circle
        cx="20"
        cy="20"
        r="17"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeOpacity={0.35}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay, duration: 0.45, ease: "easeOut" }}
      />
      <motion.path
        d="M12.5 20.5l5 5 10-11"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ delay: delay + 0.3, duration: 0.35, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}
