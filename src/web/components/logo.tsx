import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-7 place-items-center rounded-(--radius-3) bg-accent", className)}>
      <span className="grid grid-cols-2 gap-[3px]">
        <span className="size-[5px] rounded-[1.5px] bg-accent-fg" />
        <span className="size-[5px] rounded-[1.5px] bg-accent-fg/35" />
        <span className="size-[5px] rounded-[1.5px] bg-accent-fg/35" />
        <span className="size-[5px] rounded-[1.5px] bg-accent-fg" />
      </span>
    </span>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-(--radius-2)" aria-label="Portal home">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-fg">Portal</span>
    </Link>
  );
}
