import Link from "next/link";
import { cn } from "@/lib/utils";

/** Homage mark (not the Raptors trademark): claw grid on a lifted panel. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 place-items-center rounded-(--radius-3) border border-line bg-surface-2 shadow-(--shadow-1)",
        className,
      )}
    >
      <span className="relative size-3.5">
        <span className="absolute left-0 top-0 size-2 rounded-[2px] bg-accent" />
        <span className="absolute bottom-0 right-0 size-1.5 rounded-[1px] bg-muted/80" />
        <span className="absolute right-0 top-1 size-1 rounded-full bg-accent/50" />
      </span>
    </span>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-(--radius-2)" aria-label="Portal home">
      <LogoMark />
      <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Portal</span>
    </Link>
  );
}
