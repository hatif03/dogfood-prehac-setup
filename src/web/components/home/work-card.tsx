import { CircleCheck } from "lucide-react";
import { PHASE } from "@/components/public/phase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { WorkItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";

/** `todo` marks work waiting on this person: only then is the action the primary (lime) button. */
type NextAction = { status: string; label: string; href: string; todo: boolean; progress?: number; done?: boolean };

const pct = (n: number, of: number) => (of ? (n / of) * 100 : 0);
const day = (at: string) => formatDate(at, { year: undefined, hour: undefined, minute: undefined });

/** The one thing this person should do next in this event, and how far along they are. */
function nextAction({ event: e, role, judge, organizer, participant }: WorkItem): NextAction {
  const base = `/events/${e.slug}`;
  const closed = e.phase === "results" || e.phase === "archived";

  if (judge) {
    const { assigned, done } = judge;
    if (assigned === 0) return { status: "No projects are assigned to you yet.", label: "Open the event", href: base, todo: false };
    if (closed) return { status: `You reviewed ${done} of ${assigned}.`, label: "See the results", href: `${base}/results`, todo: false };
    if (done < assigned) {
      return {
        status: `${assigned - done} of ${assigned} left to review`,
        label: done ? "Continue reviewing" : "Start reviewing",
        href: `${base}/judge`,
        todo: true,
        progress: pct(done, assigned),
      };
    }
    return { status: `All ${assigned} reviews in`, label: "Open your reviews", href: `${base}/judge`, todo: false, progress: 100, done: true };
  }

  if (organizer) {
    const { reviews_submitted: n, reviews_assigned: of } = organizer;
    const org = `${base}/organize`;
    const reviews = { status: of ? `${n} of ${of} reviews submitted` : "No reviews assigned yet", progress: of ? pct(n, of) : undefined };
    if (e.phase === "upcoming") return { ...reviews, label: "Finish the setup", href: `${org}?tab=settings`, todo: true };
    if ((e.phase === "judging" || e.phase === "voting") && of && n >= of && !e.results_published)
      return { ...reviews, label: "Prepare the results", href: `${org}?tab=results`, todo: true };
    if (e.phase === "judging") return { ...reviews, label: of ? "Follow judging progress" : "Assign judges", href: `${org}?tab=judging`, todo: true };
    if (e.phase === "results") return { ...reviews, label: "Review the results", href: `${org}?tab=results`, todo: false };
    return { ...reviews, label: "Open the dashboard", href: org, todo: false };
  }

  const open = e.phase === "submissions_open";
  if (participant?.submission_status === "submitted") {
    return { status: `“${participant.title}” is submitted.`, label: open ? "Edit your submission" : "View your submission", href: `${base}/submit`, todo: false, done: true };
  }
  if (participant?.submission_status === "draft") {
    return { status: `Draft: “${participant.title || "Untitled"}”`, label: open ? "Finish your submission" : "View your draft", href: `${base}/submit`, todo: open };
  }
  if (open) {
    return {
      status: participant ? "Your team has not submitted yet." : `You have not joined a team as ${role} yet.`,
      label: e.submissions_deadline ? `Submit before ${day(e.submissions_deadline)}` : "Start your submission",
      href: `${base}/submit`,
      todo: true,
    };
  }
  return { status: "Submissions are closed.", label: "Open the event", href: base, todo: false };
}

const ROLE = { participant: "Participant", judge: "Judge", organizer: "Organizer", admin: "Admin" } as const;

export function WorkCard({ item }: { item: WorkItem }) {
  const next = nextAction(item);
  const phase = PHASE[item.event.phase];
  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="font-medium text-fg">{ROLE[item.role]}</span>
        <span aria-hidden>·</span>
        <span>{phase.label}</span>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold tracking-tight text-fg">{item.event.name}</h3>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          {next.done && <CircleCheck className="size-4 shrink-0 text-accent-11" aria-hidden />}
          {next.status}
        </p>
      </div>
      {next.progress !== undefined && <Progress value={next.progress} tone={next.done ? "neutral" : "accent"} aria-label={next.status} />}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Button href={next.href} variant={next.todo ? "primary" : "secondary"}>
          {next.label}
        </Button>
        <Button href={`/events/${item.event.slug}`} variant="ghost">
          Gallery
        </Button>
      </div>
    </Card>
  );
}
