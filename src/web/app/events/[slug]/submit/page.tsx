"use client";

import { Gavel, LogIn, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useEvent } from "@/components/event-context";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Countdown } from "@/components/ui/countdown";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Team } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { SubmissionEditor } from "./submission-editor";
import { NoTeam, TeamCard } from "./team-panel";

export default function SubmitPage() {
  const { event, refresh } = useEvent();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [team, setTeam] = useState<Team | null | undefined>(undefined); // undefined = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const base = `/v1/events/${event.slug}`;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setTeam(await api<Team | null>(`${base}/team`));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.detail : "Could not load your team");
    }
  }, [base]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const next = `/events/${event.slug}/submit`;
  const header = <Header onClosed={() => void refresh()} hasTeam={Boolean(team)} />;

  if (authLoading) return <PageSkeleton />;

  if (!user) {
    return (
      <>
        {header}
        <EmptyState
          icon={LogIn}
          title="Sign in to submit"
          description={`Teams and submissions for ${event.name} belong to accounts. Sign in or create one, and you come straight back here.`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button href={`/login?next=${encodeURIComponent(next)}`}>
                <LogIn /> Sign in
              </Button>
              <Button href={`/register?next=${encodeURIComponent(next)}`} variant="secondary">
                <UserPlus /> Create an account
              </Button>
            </div>
          }
        />
      </>
    );
  }

  if (event.viewer.role === "judge") {
    return (
      <>
        {header}
        <EmptyState
          icon={Gavel}
          title="Judges cannot join a team"
          description="You judge this event, so the API refuses team membership for your account. That keeps anyone from scoring their own work."
          action={<Button href={`/events/${event.slug}/judge`}>Go to your judging queue</Button>}
        />
      </>
    );
  }

  return (
    <div>
      {header}
      {loadError ? (
        <Callout tone="error" title="Could not load your team" action={<Button variant="secondary" size="sm" onClick={() => void load()}>Try again</Button>} className="max-w-2xl">
          {loadError}
        </Callout>
      ) : team === undefined ? (
        <FormSkeleton />
      ) : team === null ? (
        <NoTeam
          slug={event.slug}
          open={event.submissions_open}
          onCreated={(t) => {
            setTeam(t);
            void refresh(); // viewer.role becomes participant
            router.refresh(); // and the server-rendered event bar follows
            toast.success("Team created", `${t.name} is ready. Share the invite link with your teammates.`);
          }}
        />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <SubmissionEditor key={team.id} team={team} />
          <TeamCard team={team} onChange={setTeam} />
        </div>
      )}
    </div>
  );
}

/** Title plus the deadline in words, or why the form is locked. */
function Header({ onClosed, hasTeam }: { onClosed: () => void; hasTeam: boolean }) {
  const { event } = useEvent();
  const deadline = event.submissions_deadline;
  const notYet = !event.submissions_open && event.submissions_open_at && new Date(event.submissions_open_at).getTime() > Date.now();

  return (
    <div className="flex flex-col gap-4 pb-8">
      <PageHeader
        className="pb-0"
        title={hasTeam ? "Your submission" : "Submit a project"}
        description={
          event.submissions_open ? (
            deadline ? (
              <>
                Submissions close in <Countdown target={deadline} closedLabel="a moment" onComplete={onClosed} />. Your draft saves as you type; the server refuses
                changes after the deadline.
              </>
            ) : (
              "Submissions are open. Your draft saves as you type."
            )
          ) : undefined
        }
      />
      {!event.submissions_open && (
        <Callout tone="warning" title={notYet ? "Submissions are not open yet" : "Submissions are closed"} className="max-w-3xl">
          {notYet
            ? `They open ${formatDate(event.submissions_open_at!)}. Until then you can look, but not change anything.`
            : `The deadline was ${deadline ? formatDate(deadline) : "reached"}. The server refuses late changes, so what you see is final.`}
        </Callout>
      )}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-busy>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="mb-3 h-9 w-64" />
      <Skeleton className="mb-8 h-5 w-96 max-w-full" />
      <FormSkeleton />
    </div>
  );
}
