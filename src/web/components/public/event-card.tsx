import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { EventSummary } from "@/lib/types";
import { durationWords, formatDate } from "@/lib/utils";
import { PHASE, phaseDeadline } from "./phase";

/** Whole card is the link to the event gallery. Server-rendered, so the deadline is plain text (no tooltip inside a link). */
export function EventCard({ event: e }: { event: EventSummary }) {
  const phase = PHASE[e.phase];
  const deadline = phaseDeadline(e);
  return (
    <Card
      asChild
      className="flex h-full flex-col gap-3 border-line p-5 transition-[box-shadow,transform] duration-200 ease-out-expo hover:-translate-y-0.5 hover:shadow-(--shadow-4)"
    >
      <Link href={`/events/${e.slug}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={phase.tone} dot>
            {phase.label}
          </Badge>
          <Badge>{e.external_id ? `fixture ${e.external_id}` : "synthetic"}</Badge>
        </div>
        <div>
          <h3 className="font-display text-xl font-semibold tracking-tight text-fg">{e.name}</h3>
          {e.tagline && <p className="mt-1 text-sm leading-relaxed text-muted">{e.tagline}</p>}
        </div>
        <p className="text-sm text-muted">
          {deadline ? (
            `${deadline.label} ${durationWords(new Date(deadline.at).getTime() - Date.now())}.`
          ) : e.results_published ? (
            "Results are published."
          ) : e.submissions_deadline ? (
            `Submissions closed ${formatDate(e.submissions_deadline, { hour: undefined, minute: undefined })}.`
          ) : (
            "Dates not set yet."
          )}
        </p>
        <p className="mt-auto border-t border-line pt-3 text-sm text-muted">
          {e.counts.projects} projects · {e.counts.tracks} tracks · {e.counts.judges} judges · {e.counts.teams} teams
        </p>
      </Link>
    </Card>
  );
}
