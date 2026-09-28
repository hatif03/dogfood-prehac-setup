import { Plus } from "lucide-react";
import { TiltCard } from "@/components/amicro/tilt-card";
import { LandingHero } from "@/components/home/landing";
import { WorkCard } from "@/components/home/work-card";
import { EventCard } from "@/components/public/event-card";
import { HowItWorks } from "@/components/public/how-it-works";
import { PHASE } from "@/components/public/phase";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { serverApi } from "@/lib/server-api";
import type { EventSummary, WorkItem } from "@/lib/types";

const FIXTURE = "sample-hack-2026";

function EventGrid({ events, tilt }: { events: EventSummary[] | null; tilt: boolean }) {
  if (events === null) return <EmptyState title="The API is not reachable" description="Start the stack with docker compose up, then reload." />;
  if (events.length === 0) {
    return (
      <EmptyState
        title="No events yet"
        description="Create the first one, or load the fixture with the seed command."
        action={<Button href="/events/new">Create an event</Button>}
      />
    );
  }
  // Fixture first, then live events, then the rest; stable otherwise.
  const rank = (e: EventSummary) => (e.slug === FIXTURE ? 0 : PHASE[e.phase].live ? 1 : 2);
  const sorted = [...events].sort((a, b) => rank(a) - rank(b));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sorted.map((e) =>
        tilt ? (
          <TiltCard key={e.id} className="h-full">
            <EventCard event={e} />
          </TiltCard>
        ) : (
          <EventCard key={e.id} event={e} />
        ),
      )}
    </div>
  );
}

function EventsSection({ events, signedIn }: { events: EventSummary[] | null; signedIn: boolean }) {
  return (
    <section id="events" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 sm:px-6" aria-labelledby="events-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2 id="events-heading" className="font-display text-2xl font-semibold tracking-tight">
          {signedIn ? "All events" : "Events on this portal"}
        </h2>
        <Button href="/events/new" variant="secondary">
          <Plus /> Create an event
        </Button>
      </div>
      <EventGrid events={events} tilt={!signedIn} />
    </section>
  );
}

/** Server-rendered: /v1/auth/work answers 401 for visitors (null here), so the landing needs no client auth check. */
export default async function HomePage() {
  const [work, events] = await Promise.all([
    serverApi<WorkItem[]>("/v1/auth/work").catch(() => null),
    serverApi<EventSummary[]>("/v1/events").catch(() => null),
  ]);

  if (!work) {
    return (
      <>
        <LandingHero />
        <EventsSection events={events} signedIn={false} />
        <section className="border-t border-line" aria-labelledby="how-heading">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
            <p className="section-index">02 · Integrity</p>
            <h2 id="how-heading" className="font-display text-2xl font-semibold tracking-tight">
              How judging works
            </h2>
            <p className="mt-2 max-w-2xl text-muted">Four checks between a score and a winner. The API enforces each one, so a fork keeps the same guarantees.</p>
            <HowItWorks className="mt-8" />
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="mx-auto max-w-7xl px-4 pt-10 pb-4 sm:px-6" aria-labelledby="work-heading">
        <h1 id="work-heading" className="font-display text-3xl font-semibold tracking-tight">
          Your work
        </h1>
        <p className="mt-1 text-muted">The next step in every event you are part of.</p>
        <div className="mt-6">
          {work.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {work.map((item) => (
                <WorkCard key={`${item.event.id}-${item.role}`} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nothing needs you yet"
              description="When an organizer invites you to judge, or you join a team, it shows up here."
              action={<Button href="/events/playground">Try the playground</Button>}
            />
          )}
        </div>
      </section>
      <EventsSection events={events} signedIn />
    </>
  );
}
