import { Progress as RadixProgress } from "@radix-ui/themes";

// `accent` follows the Theme accent: completion and positive progress.
const COLORS = { accent: undefined, cyan: "cyan", violet: "violet", amber: "amber", coral: "tomato", neutral: "gray" } as const;

type ProgressProps = {
  /** 0–100 */
  value: number;
  tone?: keyof typeof COLORS;
  className?: string;
  "aria-label"?: string;
};

export function Progress({ value, tone = "accent", className, "aria-label": ariaLabel }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value));
  return <RadixProgress value={pct} color={COLORS[tone]} size="2" className={className} aria-label={ariaLabel} />;
}
