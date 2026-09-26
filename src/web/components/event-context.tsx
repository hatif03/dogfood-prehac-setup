"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { api } from "@/lib/api";
import type { EventDetail } from "@/lib/types";

type EventContextValue = { event: EventDetail; refresh: () => Promise<EventDetail> };

const EventContext = createContext<EventContextValue | null>(null);

/** Event detail fetched once by app/events/[slug]/layout.tsx, including the viewer's role. */
export function EventProvider({ initial, children }: { initial: EventDetail; children: React.ReactNode }) {
  const [event, setEvent] = useState(initial);
  const refresh = useCallback(async () => {
    const next = await api<EventDetail>(`/v1/events/${initial.slug}`);
    setEvent(next);
    return next;
  }, [initial.slug]);
  return <EventContext.Provider value={{ event, refresh }}>{children}</EventContext.Provider>;
}

export function useEvent(): EventContextValue {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error("useEvent must be used inside an event page");
  return ctx;
}
