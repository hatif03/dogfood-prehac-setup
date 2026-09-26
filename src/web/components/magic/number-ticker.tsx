"use client";

import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

type NumberTickerProps = {
  value: number;
  startValue?: number;
  decimals?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
};

export function NumberTicker({
  value,
  startValue = 0,
  decimals = 0,
  delay = 0,
  prefix = "",
  suffix = "",
  className,
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const target = useMotionValue(startValue);
  const spring = useSpring(target, { damping: 40, stiffness: 140 });
  const inView = useInView(ref, { once: true });
  const fmt = useMemo(
    () => new Intl.NumberFormat("en", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    [decimals],
  );

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      target.jump(value);
      spring.jump(value);
      return;
    }
    const t = setTimeout(() => target.set(value), delay * 1000);
    return () => clearTimeout(t);
  }, [inView, reduce, value, delay, target, spring]);

  useEffect(
    () =>
      spring.on("change", (v) => {
        if (ref.current) ref.current.textContent = `${prefix}${fmt.format(v)}${suffix}`;
      }),
    [spring, fmt, prefix, suffix],
  );

  return (
    <span ref={ref} className={cn("inline-block font-mono tabular-nums tracking-tight", className)}>
      {`${prefix}${fmt.format(startValue)}${suffix}`}
    </span>
  );
}
