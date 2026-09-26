// Adapted from Amicro (MIT), https://github.com/Subhan-code/Amicro--Micro-transitions-
"use client";

import { motion, useSpring } from "motion/react";
import { useRef } from "react";

type MagneticProps = {
  children: React.ReactNode;
  /** Share of the pointer offset the child follows. */
  strength?: number;
  className?: string;
};

/** Wraps a button or link so it leans toward the pointer. Pointer-only; touch and reduced motion see no movement. */
export function Magnetic({ children, strength = 0.25, className }: MagneticProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const spring = { stiffness: 150, damping: 15, mass: 0.6 };
  const x = useSpring(0, spring);
  const y = useSpring(0, spring);

  function onMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }

  function reset() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.span ref={ref} onPointerMove={onMove} onPointerLeave={reset} style={{ x, y }} className={`inline-flex ${className ?? ""}`}>
      {children}
    </motion.span>
  );
}
