// Adapted from Amicro (MIT), https://github.com/Subhan-code/Amicro--Micro-transitions-
"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

type TiltCardProps = {
  children: React.ReactNode;
  /** Degrees at the card's edge. Keep it small on content cards. */
  maxTilt?: number;
  className?: string;
};

export function TiltCard({ children, maxTilt = 4, className }: TiltCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const spring = { damping: 20, stiffness: 200, mass: 0.5 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [maxTilt, -maxTilt]), spring);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-maxTilt, maxTilt]), spring);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - r.left) / r.width - 0.5);
    y.set((e.clientY - r.top) / r.height - 0.5);
  }

  function reset() {
    x.set(0);
    y.set(0);
  }

  return (
    <div onPointerMove={onMove} onPointerLeave={reset} className={className} style={{ perspective: 900 }}>
      <motion.div style={{ rotateX, rotateY, transformStyle: "preserve-3d" }} className="h-full">
        {children}
      </motion.div>
    </div>
  );
}
