"use client";

import { CalendarClock, KeyRound, LinkIcon, LogIn, MailCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { FadeUp } from "@/components/amicro/fade-up";
import { useEvent } from "@/components/event-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, json } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Ballot, EventDetail } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { BallotView, rateLimitMessage } from "./ballot-view";

type Stage =
  | { kind: "loading" }
  | { kind: "closed" }
  | { kind: "signin" }
  | { kind: "email" }
  | { kind: "check"; email: string }
  | { kind: "need-link" }
  | { kind: "bad-link"; message: string }
  | { kind: "ballot"; ballot: Ballot };

/** One sentence per access mode: who may vote and how many ballots they get. */
const ACCESS: Record<EventDetail["voting_access"], string> = {
  open: "Anyone with this page can vote, one ballot per browser.",
  authenticated: "Sign in to vote. Each account gets one ballot.",
  email_gated: "We email you a private voting link. One ballot per verified address.",
  link: "Voting is by single-use links that the organizer hands out. Open yours to see your ballot.",
};

const storageKey = (slug: string) => `portal:ballot:${slug}`;
function readToken(slug: string) {
  try {
    return localStorage.getItem(storageKey(slug));
  } catch {
    return null;
  }
}
function writeToken(slug: string, token: string | null) {
  try {
    if (token) localStorage.setItem(storageKey(slug), token);
    else localStorage.removeItem(storageKey(slug));
  } catch {
    /* private mode: the emailed link still works */
  }
}

export function VoteClient({ urlToken }: { urlToken: string | null }) {
  const { event } = useEvent();
  const { user, loading: authLoading } = useAuth();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const mode = event.voting_access;

  const resolve = useCallback(async () => {
    const token = urlToken ?? (mode === "authenticated" ? null : readToken(event.slug));
    if (token) {
      try {
        const ballot = await api<Ballot>(`/v1/ballots/${token}`);
        writeToken(event.slug, token);
        return setStage({ kind: "ballot", ballot });
      } catch (err) {
        writeToken(event.slug, null);
        if (urlToken) return setStage({ kind: "bad-link", message: err instanceof ApiError ? err.detail : "Could not load the ballot" });
      }
    }
    if (!event.voting_open) return setStage({ kind: "closed" });
    if (mode === "link") return setStage({ kind: "need-link" });
    if (mode === "email_gated") return setStage({ kind: "email" });
    if (mode !== "open" && !user) return setStage({ kind: "signin" });
    try {
      setStage({ kind: "ballot", ballot: await api<Ballot>(`/v1/events/${event.slug}/ballots`, { method: "POST", body: json({}) }) });
    } catch (err) {
      setStage({ kind: "bad-link", message: rateLimitMessage(err) });
    }
  }, [urlToken, mode, event.slug, event.voting_open, user]);

  useEffect(() => {
    if (!authLoading) void resolve();
  }, [authLoading, resolve]);

  const next = `/events/${event.slug}/vote`;

  return (
    <div>
      <PageHeader
        title="Community vote"
        description={
          <>
            {ACCESS[mode]} The popular vote is counted separately and never changes the judges&apos; ranking.
            {event.voting_open && event.voting_closes_at && (
              <>
                {" "}
                Voting closes in <Countdown target={event.voting_closes_at} />.
              </>
            )}
          </>
        }
      />
      <Body stage={stage} setStage={setStage} next={next} />
    </div>
  );
}

function Body({ stage, setStage, next }: { stage: Stage; setStage: (s: Stage) => void; next: string }) {
  switch (stage.kind) {
    case "loading":
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      );
    case "ballot":
      return <BallotView ballot={stage.ballot} onChange={(ballot) => setStage({ kind: "ballot", ballot })} />;
    case "closed":
      return <ClosedState />;
    case "signin":
      return (
        <EmptyState
          icon={LogIn}
          title="Sign in to vote"
          description="One ballot per account, so we need to know who you are. Nobody else sees your picks."
          action={<Button href={`/login?next=${encodeURIComponent(next)}`}>Sign in to vote</Button>}
        />
      );
    case "need-link":
      return (
        <EmptyState
          icon={KeyRound}
          title="Open your personal voting link"
          description="Each link works for one ballot. If you did not get one, ask the organizer."
        />
      );
    case "bad-link":
      return (
        <EmptyState
          icon={LinkIcon}
          title="That ballot did not open"
          description={stage.message}
          action={
            <Button variant="secondary" href={next}>
              Start over
            </Button>
          }
        />
      );
    case "email":
      return <EmailGate onSent={(email) => setStage({ kind: "check", email })} />;
    case "check":
      return <CheckInbox email={stage.email} onRetry={() => setStage({ kind: "email" })} />;
  }
}

function ClosedState() {
  const { event } = useEvent();
  const opens = event.voting_opens_at ? new Date(event.voting_opens_at) : null;
  const upcoming = opens && opens.getTime() > Date.now();
  return (
    <EmptyState
      icon={CalendarClock}
      title={upcoming ? "Voting has not opened yet" : event.voting_closes_at ? "Voting is closed" : "No voting window yet"}
      description={
        upcoming ? (
          <>
            Community voting opens in <Countdown target={opens} />
            {event.voting_closes_at ? ` and closes ${formatDate(event.voting_closes_at)}` : ""}.
          </>
        ) : event.voting_closes_at ? (
          `Voting ran until ${formatDate(event.voting_closes_at)}. The tally appears with the results.`
        ) : (
          "The organizer has not scheduled community voting for this event."
        )
      }
      action={
        <Button href={`/events/${event.slug}`} variant="secondary">
          Browse the projects
        </Button>
      }
    />
  );
}

function EmailGate({ onSent }: { onSent: (email: string) => void }) {
  const { event } = useEvent();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ status: string; email: string }>(`/v1/events/${event.slug}/ballots`, {
        method: "POST",
        body: json({ email: email.trim() }),
      });
      onSent(res.email);
    } catch (err) {
      const msg = rateLimitMessage(err);
      setError(msg);
      toast.error("Could not send the link", msg);
      setBusy(false);
    }
  }

  return (
    <FadeUp inView={false} className="max-w-md">
      <Card asChild className="flex flex-col gap-4 p-5 sm:p-6">
        <form onSubmit={send}>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Get your voting link</h2>
            <p className="mt-1 text-sm text-muted">Opening the link confirms your address and shows your ballot. Keep it private: it is the only way in.</p>
          </div>
          <Field label="Email" error={error ?? undefined} required>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.org" />
          </Field>
          <Button type="submit" loading={busy} className="self-start">
            Email me a voting link
          </Button>
        </form>
      </Card>
    </FadeUp>
  );
}

function CheckInbox({ email, onRetry }: { email: string; onRetry: () => void }) {
  return (
    <FadeUp inView={false} className="max-w-md">
      <Card className="flex flex-col gap-3 p-5 sm:p-6" role="status">
        <MailCheck className="size-6 text-accent-11" aria-hidden />
        <h2 className="text-lg font-semibold tracking-tight">Check your inbox</h2>
        <p className="text-sm text-muted">
          We sent a voting link to <span className="font-medium text-fg">{email}</span>. Open it on this device to confirm your address and see your ballot.
        </p>
        <p className="text-sm text-muted">
          Running the portal locally? Mail lands in Mailpit at{" "}
          <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="font-mono text-fg underline decoration-line-strong underline-offset-4">
            localhost:8025
          </a>
          .
        </p>
        <Button variant="ghost" size="sm" onClick={onRetry} className="self-start">
          Use a different email
        </Button>
      </Card>
    </FadeUp>
  );
}
