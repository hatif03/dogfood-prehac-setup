"use client";

import { Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { FadeUp } from "@/components/amicro/fade-up";
import { fireConfetti } from "@/components/magic/confetti";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PodiumEntry = { id: string; title: string; team?: string; track: string | null; score: string; scoreLabel: string };

const PLACE = ["1st", "2nd", "3rd"];

/** Top three as quiet cards. Confetti fires once per browser per event, and never for an organizer preview. */
export function Podium({ entries, slug, celebrate }: { entries: PodiumEntry[]; slug: string; celebrate: boolean }) {
  useEffect(() => {
    if (!celebrate) return;
    const key = `portal:results-confetti:${slug}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return; // storage blocked: skip rather than fire on every visit
    }
    const t = setTimeout(() => void fireConfetti("sides"), 600);
    return () => clearTimeout(t);
  }, [celebrate, slug]);

  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {entries.map((e, i) => (
        <li key={e.id}>
          <FadeUp inView={false} delay={i * 0.08} className="h-full">
            <Card asChild className={cn("flex h-full flex-col gap-3 p-5", i === 0 && "ring-1 ring-(--accent-a7)")}>
              <Link href={`/events/${slug}/projects/${e.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", i === 0 ? "text-accent-11" : "text-muted")}>
                    {i === 0 && <Trophy className="size-4" aria-hidden />}
                    {PLACE[i]} place
                  </span>
                  <span className="text-right text-sm tabular-nums">
                    <span className="font-semibold text-fg">{e.score}</span> <span className="text-muted">{e.scoreLabel}</span>
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-tight text-balance text-fg">{e.title}</h3>
                  {(e.team || e.track) && <p className="mt-0.5 truncate text-sm text-muted">{[e.team, e.track].filter(Boolean).join(" · ")}</p>}
                </div>
              </Link>
            </Card>
          </FadeUp>
        </li>
      ))}
    </ol>
  );
}
