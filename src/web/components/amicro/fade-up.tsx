// Adapted from Amicro (MIT), https://github.com/Subhan-code/Amicro--Micro-transitions-
"use client";

import { motion } from "motion/react";
import { EASE } from "./presets";

type FadeUpProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  y?: number;
  /** Wait until scrolled into view (default). False animates on mount. */
  inView?: boolean;
};

export function FadeUp({ children, className, delay = 0, duration = 0.35, y = 10, inView = true }: FadeUpProps) {
  const shown = { opacity: 1, y: 0 };
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? undefined : shown}
      whileInView={inView ? shown : undefined}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay, duration, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
