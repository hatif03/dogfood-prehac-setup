import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-(--radius-4) border border-dashed border-line-strong px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-2 grid size-10 place-items-center rounded-(--radius-3) bg-surface-2 text-muted">
          <Icon className="size-5" aria-hidden />
        </div>
      )}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
