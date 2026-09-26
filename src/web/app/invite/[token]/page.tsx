"use client";

import { LogIn, UserPlus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/participant/auth-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type InvitePreview = { team: string; event: { slug: string; name: string }; members: string[]; full: boolean };

export default function TeamInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user, loading } = useAuth();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    api<InvitePreview>(`/v1/invites/${token}`)
      .then(setInvite)
      .catch((err) => setError(err instanceof ApiError ? err.detail : "Could not load the invite"));
  }, [token]);

  async function join() {
    if (!invite) return;
    setJoining(true);
    try {
      const res = await api<{ team_id: string; event_slug: string }>(`/v1/invites/${token}/accept`, { method: "POST" });
      toast.success(`You joined ${invite.team}`, "Your team's submission is on the next page.");
      router.push(`/events/${res.event_slug}/submit`);
      router.refresh();
    } catch (err) {
      toast.error("Could not join the team", err instanceof ApiError ? err.detail : "Could not reach the server");
      setJoining(false);
    }
  }

  const here = `/invite/${token}`;

  return (
    <AuthShell
      eyebrow="Team invite"
      title={invite ? `Join ${invite.team}` : "Team invite"}
      description={invite ? `You have been invited to build with this team at ${invite.event.name}.` : undefined}
    >
      {error ? (
        <Callout
          tone="error"
          title="This invite link does not work"
          action={
            <Button href="/" variant="secondary" size="sm">
              Browse events
            </Button>
          }
        >
          {error}. Ask your captain for the current link: making a new one switches the old one off.
        </Callout>
      ) : !invite ? (
        <Card className="flex flex-col gap-3 p-6" aria-busy>
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </Card>
      ) : (
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-medium text-muted">
              {invite.members.length} {invite.members.length === 1 ? "member" : "members"} so far
            </h2>
            <ul className="mt-3 flex flex-col gap-3">
              {invite.members.map((name, i) => (
                <li key={`${name}-${i}`} className="flex items-center gap-3 text-sm">
                  <Avatar name={name} size="sm" /> {name}
                </li>
              ))}
            </ul>
          </div>
          {invite.full ? (
            <Callout tone="warning" title="This team is full">
              It has reached the event&apos;s size limit. Ask the captain, or start your own team from the event&apos;s Submit page.
            </Callout>
          ) : loading ? (
            <Skeleton className="h-12 w-full" />
          ) : user ? (
            <div className="flex flex-col gap-2 border-t border-line pt-5">
              <Button size="lg" onClick={join} loading={joining}>
                Join {invite.team}
              </Button>
              <p className="text-sm text-muted">
                Joining as {user.display_name}. You can be on one team per event, and judges of this event cannot join a team.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 border-t border-line pt-5">
              <p className="text-sm text-muted">Sign in or create an account to join. You come straight back here.</p>
              <div className="flex flex-col gap-2">
                <Button href={`/login?next=${encodeURIComponent(here)}`}>
                  <LogIn /> Sign in to join
                </Button>
                <Button href={`/register?next=${encodeURIComponent(here)}`} variant="secondary">
                  <UserPlus /> Create an account
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </AuthShell>
  );
}
