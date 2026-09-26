import type { BadgeTone } from "@/components/ui/badge";
import type { EventSummary, Phase } from "@/lib/types";

export const PHASE: Record<Phase, { label: string; tone: BadgeTone; live: boolean }> = {
  upcoming: { label: "Upcoming", tone: "neutral", live: false },
  submissions_open: { label: "Submissions open", tone: "accent", live: true },
  judging: { label: "Judging", tone: "cyan", live: false },
  voting: { label: "Community voting", tone: "violet", live: true },
  results: { label: "Results published", tone: "amber", live: false },
  archived: { label: "Archived", tone: "neutral", live: false },
};

/** The one deadline that matters for the event's current phase. */
export function phaseDeadline(e: Pick<EventSummary, "phase" | "submissions_deadline" | "voting_opens_at" | "voting_closes_at">) {
  if (e.phase === "submissions_open" && e.submissions_deadline) return { label: "Submissions close in", at: e.submissions_deadline };
  if (e.phase === "voting" && e.voting_closes_at) return { label: "Voting closes in", at: e.voting_closes_at };
  if (e.phase === "judging" && e.voting_opens_at) return { label: "Voting opens in", at: e.voting_opens_at };
  return null;
}
