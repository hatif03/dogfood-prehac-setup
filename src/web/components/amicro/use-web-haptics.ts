// Adapted from Amicro (MIT), https://github.com/Subhan-code/Amicro--Micro-transitions-
"use client";

import { useCallback } from "react";

export type HapticsType = "light" | "medium" | "heavy" | "success" | "warning" | "error";

const PATTERNS: Record<HapticsType, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [15, 60, 15],
  warning: [30, 60, 30],
  error: [60, 60, 60, 60, 60],
};

/** Vibration feedback on devices that support it (Android Chrome); a silent no-op elsewhere. */
export function useWebHaptics() {
  const trigger = useCallback((type: HapticsType = "light") => {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    try {
      return navigator.vibrate(PATTERNS[type]);
    } catch {
      return false;
    }
  }, []);
  return { trigger };
}
