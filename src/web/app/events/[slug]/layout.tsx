import Link from "next/link";
import { notFound } from "next/navigation";
import { EventProvider } from "@/components/event-context";
import { EventNav } from "@/components/event-nav";
import { PHASE, phaseDeadline } from "@/components/public/phase";
import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/ui/countdown";
import { serverApi } from "@/lib/server-api";
import type { EventDetail } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const event = await serverApi<EventDetail>(`/v1/events/${(await params).slug}`);
  return { title: event?.name ?? "Event" };
}

const ROLE_LABEL = { participant: "Participant", judge: "Judge", organizer: "Organizer", admin: "Admin" } as const;

/**
 * Compact event bar on every event page: name, phase, the one deadline that matters, the viewer's role, section tabs.
 * Sticks under the site header from sm up. Pages render their own heading; the gallery adds the full intro.
 */
export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await serverApi<EventDetail>(`/v1/events/${slug}`);
  if (!event) notFound();
  const phase = PHASE[event.phase];
  const deadline = phaseDeadline(event);
  const role = event.viewer.role;

  return (
    <EventProvider initial={event}>
      <div className="z-40 border-b border-line bg-bg/85 backdrop-blur-lg sm:sticky sm:top-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 pt-3 pb-1 text-sm">
            <Link href={`/events/${slug}`} className="max-w-full truncate text-base font-semibold tracking-tight text-fg hover:underline">
              {event.name}
            </Link>
            <Badge tone={phase.tone} dot>
              {phase.label}
            </Badge>
            {deadline && (
              <span className="text-muted">
                {deadline.label} <Countdown target={deadline.at} />
              </span>
            )}
            {role !== "visitor" && <span className="text-muted sm:ml-auto">Your role: {ROLE_LABEL[role]}</span>}
          </div>
          <EventNav slug={event.slug} role={role} className="-mx-3 shadow-none" />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div>
    </EventProvider>
  );
}
