"use client";

import { ArrowUpRight, KeyRound, Scale, ShieldCheck, Sigma } from "lucide-react";
import { motion } from "motion/react";
import { EASE } from "@/components/amicro/presets";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Each visual plays once when scrolled into view, then stays still.
const view = { once: true, margin: "-60px" } as const;

function WeightsVisual() {
  const rows = [
    ["Functionality", 40],
    ["Innovation", 35],
    ["Quality", 25],
  ] as const;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(([name, w], i) => (
        <div key={name} className="flex items-center gap-3 text-xs">
          <span className="w-20 shrink-0 text-muted">{name}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tint-strong">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: 0 }}
              whileInView={{ width: `${w * 2}%` }}
              viewport={view}
              transition={{ duration: 0.6, ease: EASE, delay: 0.15 + i * 0.1 }}
            />
          </div>
          <span className="w-8 text-right font-mono text-fg tabular-nums">{w}%</span>
        </div>
      ))}
    </div>
  );
}

function OffsetVisual() {
  // A generous judge (violet) scores everything ~1 point higher. Removing the offset lines the dots up.
  const strict = [18, 42, 70];
  return (
    <div>
      <div className="relative h-[56px]">
        {[0, 1].map((row) => (
          <div key={row} className="absolute inset-x-0 h-px bg-line" style={{ top: row ? 46 : 16 }} />
        ))}
        {strict.map((x, i) => (
          <div key={`s${i}`} className="absolute size-2.5 -translate-x-1/2 rounded-full bg-cyan" style={{ left: `${x}%`, top: 11 }} />
        ))}
        {strict.map((x, i) => (
          <motion.div
            key={`g${i}`}
            className="absolute size-2.5 -translate-x-1/2 rounded-full bg-violet"
            style={{ top: 41 }}
            initial={{ left: `${x + 22}%` }}
            whileInView={{ left: `${x}%` }}
            viewport={view}
            transition={{ duration: 0.8, ease: EASE, delay: 0.4 + i * 0.08 }}
          />
        ))}
      </div>
      <div className="flex gap-4 font-mono text-xs">
        <span className="text-cyan-11">strict judge</span>
        <span className="text-violet-11">generous judge, offset removed</span>
      </div>
    </div>
  );
}

function CurlVisual() {
  return (
    <div className="rounded-(--radius-2) bg-surface-2 p-2.5 font-mono text-xs leading-relaxed">
      <div className="truncate text-muted">$ curl -b judge /v1/events/…/normalization</div>
      <div className="text-coral-11">403 Organizer or admin role required</div>
    </div>
  );
}

function SignatureVisual() {
  return (
    <div className="flex items-center gap-3 rounded-(--radius-2) bg-surface-2 p-2.5">
      <span className="flex-1 truncate font-mono text-xs text-muted">ed25519 4651fe6f34c0153dd7fbb4026abf0838cf59c64f</span>
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M2.5 6.5l2.2 2.2L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}

const STEPS = [
  {
    icon: Scale,
    title: "Weighted rubric",
    body: "Organizers set a weight per criterion. A judge's total is the weighted sum, shown live while they score.",
    visual: <WeightsVisual />,
    href: "/docs",
    cta: "Scoring API",
  },
  {
    icon: Sigma,
    title: "Judge-offset normalization",
    body: "Some judges are generous, some are strict. We fit each judge's offset and remove it before ranking.",
    visual: <OffsetVisual />,
    href: "/docs",
    cta: "Results API",
  },
  {
    icon: ShieldCheck,
    title: "Isolation in the API",
    body: "Judges only ever see their own scores. The server refuses anything else; hiding a button is not the control.",
    visual: <CurlVisual />,
    href: "/docs",
    cta: "Try it with curl",
  },
  {
    icon: KeyRound,
    title: "Signed judge records",
    body: "Judges and winners get an Ed25519-signed record. Anyone can check it in their own browser.",
    visual: <SignatureVisual />,
    href: "/verify",
    cta: "Verify a record",
  },
];

export function HowItWorks({ className }: { className?: string }) {
  return (
    <ol className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {STEPS.map((s, i) => (
        <motion.li
          key={s.title}
          className="min-w-0"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={view}
          transition={{ delay: i * 0.06, duration: 0.35, ease: EASE }}
        >
          <Card className="relative flex h-full flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <s.icon className="size-5 text-muted" aria-hidden />
              <span className="font-mono text-xs text-subtle">0{i + 1}</span>
            </div>
            <div>
              <h3 className="font-display font-semibold tracking-tight text-fg">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
            <div className="mt-auto">{s.visual}</div>
            <a href={s.href} className="inline-flex items-center gap-1 text-sm font-medium text-muted after:absolute after:inset-0 hover:text-fg">
              {s.cta}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          </Card>
        </motion.li>
      ))}
    </ol>
  );
}
