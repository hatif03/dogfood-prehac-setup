// Adapted from Amicro (MIT), https://github.com/Subhan-code/Amicro--Micro-transitions-
// Amicro's motion rules: exponential ease-out for reveals, 250–400 ms entrances, snappy springs for feedback.
export const EASE = [0.16, 1, 0.3, 1] as const;
export const SPRING = { type: "spring", stiffness: 400, damping: 28, mass: 0.8 } as const;
