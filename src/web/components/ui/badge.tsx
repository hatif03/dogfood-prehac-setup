import { Badge as RadixBadge } from "@radix-ui/themes";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "accent" | "cyan" | "violet" | "coral" | "amber";

// `accent` follows the Theme accent (lime): positive state only.
const COLORS = { neutral: "gray", accent: undefined, cyan: "cyan", violet: "violet", coral: "tomato", amber: "amber" } as const;

type BadgeProps = Omit<React.ComponentProps<typeof RadixBadge>, "color"> & {
  tone?: BadgeTone;
  /** Leading status dot. */
  dot?: boolean;
};

export function Badge({ tone = "neutral", dot = false, className, children, ...props }: BadgeProps) {
  return (
    <RadixBadge color={COLORS[tone]} variant="soft" radius="full" className={cn("whitespace-nowrap", className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </RadixBadge>
  );
}
