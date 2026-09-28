import { FadeUp } from "@/components/amicro/fade-up";
import { DinoArt } from "@/components/dino-art";
import { cn } from "@/lib/utils";

/** Only same-site paths survive `?next=`, so a crafted link cannot bounce people to another origin. */
export function safeNext(next: string | null | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}

type AuthShellProps = {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Extra content under the form (demo accounts). */
  aside?: React.ReactNode;
  className?: string;
};

/** Split frame for sign-in, register and the invite screens: form on the left, the raptor on the right from md up. */
export function AuthShell({ eyebrow, title, description, children, aside, className }: AuthShellProps) {
  return (
    <section className={cn("mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-2 md:gap-12 md:py-14", className)}>
      <FadeUp inView={false} className="flex w-full min-w-0 flex-col gap-6 md:max-w-md md:justify-self-end">
        <div className="flex flex-col gap-2">
          <p className="section-index">{eyebrow}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">{title}</h1>
          {description && <p className="leading-relaxed text-muted">{description}</p>}
        </div>
        {children}
        {aside}
      </FadeUp>
      <div aria-hidden className="relative hidden overflow-hidden rounded-(--radius-5) border border-line bg-surface md:sticky md:top-20 md:block md:h-[min(40rem,calc(100dvh-7rem))]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,var(--accent-a4),transparent_60%)]" />
        <DinoArt sizes="(min-width: 1152px) 540px, 50vw" priority className="dino-grade absolute inset-0 h-full w-full object-[62%_40%]" />
      </div>
    </section>
  );
}
