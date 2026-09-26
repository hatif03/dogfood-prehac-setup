import { FadeUp } from "@/components/amicro/fade-up";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <FadeUp inView={false} className={cn("flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <header className="flex max-w-2xl flex-col gap-2">
        {eyebrow && <div className="text-sm font-medium text-muted">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-fg">{title}</h1>
        {description && <p className="leading-relaxed text-muted">{description}</p>}
      </header>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </FadeUp>
  );
}
