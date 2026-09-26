const COLORS = ["#d4ff4f", "#5eead4", "#a78bfa", "#eceee9"];

type ConfettiVariant = "burst" | "sides";

function prefersReducedMotion() {
  return typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fires confetti. No-op on the server and when the user prefers reduced motion. */
export async function fireConfetti(variant: ConfettiVariant = "burst") {
  if (prefersReducedMotion()) return;
  const confetti = (await import("canvas-confetti")).default;
  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 9999 };

  if (variant === "burst") {
    await confetti({ ...base, particleCount: 120, spread: 80, startVelocity: 42, origin: { y: 0.65 } });
    return;
  }

  const end = Date.now() + 900;
  const frame = () => {
    confetti({ ...base, particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
    confetti({ ...base, particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
