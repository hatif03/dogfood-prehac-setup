"use client";

import { useEvent } from "@/components/event-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** The fuller event introduction; only the gallery shows it. Task pages get the compact bar from the layout. */
export function EventIntro() {
  const { event } = useEvent();
  const base = `/events/${event.slug}`;
  const judge = event.viewer.role === "judge";
  // The one thing this visitor can do next, if any.
  const cta = judge
    ? { href: `${base}/judge`, label: "Open your judging queue" }
    : event.submissions_open
      ? { href: `${base}/submit`, label: event.viewer.team_id ? "Edit your submission" : "Submit a project" }
      : event.voting_open
        ? { href: `${base}/vote`, label: "Vote for a project" }
        : event.results_published
          ? { href: `${base}/results`, label: "See the results" }
          : null;

  return (
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex max-w-3xl min-w-0 flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{event.name}</h1>
        {event.tagline && <p className="text-lg leading-relaxed text-muted">{event.tagline}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>
            {event.counts.projects} projects · {event.counts.tracks} tracks · {event.counts.judges} judges
          </span>
          <Badge>{event.external_id ? `Official fixture ${event.external_id}` : "Synthetic data"}</Badge>
        </div>
      </div>
      {cta && (
        <Button href={cta.href} size="lg" className="shrink-0 self-start sm:self-auto">
          {cta.label}
        </Button>
      )}
    </header>
  );
}
