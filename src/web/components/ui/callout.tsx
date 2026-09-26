import { Callout as RadixCallout } from "@radix-ui/themes";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";

export type CalloutTone = "info" | "success" | "warning" | "error";

const TONES: Record<CalloutTone, { color: "gray" | "cyan" | "amber" | "tomato" | undefined; icon: LucideIcon }> = {
  info: { color: "gray", icon: Info },
  success: { color: undefined, icon: CircleCheck },
  warning: { color: "amber", icon: TriangleAlert },
  error: { color: "tomato", icon: CircleAlert },
};

type CalloutProps = {
  tone?: CalloutTone;
  /** Bold first line. */
  title?: React.ReactNode;
  icon?: LucideIcon;
  /** Buttons or links under the text. */
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
};

/** A message inside the page flow (integrity warnings, "voting is closed"). For transient feedback use useToast(). */
export function Callout({ tone = "info", title, icon, action, className, children }: CalloutProps) {
  const t = TONES[tone];
  const Icon = icon ?? t.icon;
  return (
    <RadixCallout.Root color={t.color} variant="soft" className={className} role={tone === "error" ? "alert" : undefined}>
      <RadixCallout.Icon>
        <Icon className="size-4" aria-hidden />
      </RadixCallout.Icon>
      <div className="flex flex-col gap-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {children && <div className="text-sm leading-relaxed">{children}</div>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
    </RadixCallout.Root>
  );
}
