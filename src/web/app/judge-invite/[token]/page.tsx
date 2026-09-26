"use client";

import { LogIn, LogOut } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthShell } from "@/components/participant/auth-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, json } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type JudgeInvite = {
  email: string;
  event: { slug: string; name: string };
  accepted: boolean;
  needs_password: boolean;
  signed_in_as: string | null;
};

export default function JudgeInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const toast = useToast();
  const { refresh, logout } = useAuth();
  const [invite, setInvite] = useState<JudgeInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ display_name: "", password: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<JudgeInvite>(`/v1/judge-invites/${token}`)
      .then(setInvite)
      .catch((err) => setError(err instanceof ApiError ? err.detail : "Could not load the invite"));
  }, [token]);
  useEffect(load, [load]);

  async function accept(body: { password?: string; display_name?: string } = {}) {
    if (!invite) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await api<{ event_slug: string }>(`/v1/judge-invites/${token}/accept`, { method: "POST", body: json(body) });
      await refresh(); // the API may have just started a session
      toast.success(`You are judging ${invite.event.name}`);
      router.push(`/events/${res.event_slug}/judge`);
      router.refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not reach the server";
      setFormError(msg);
      toast.error("Could not accept", msg);
      setBusy(false);
    }
  }

  async function signOut() {
    await logout();
    router.refresh();
    load();
  }

  const here = `/judge-invite/${token}`;
  const mine = invite && invite.signed_in_as?.toLowerCase() === invite.email.toLowerCase();

  return (
    <AuthShell
      eyebrow="Judge invite"
      title={invite ? `Judge ${invite.event.name}` : "Judge invite"}
      description="Judges score only the projects assigned to them and never see another judge's scores. The API enforces it."
    >
      {error ? (
        <Callout
          tone="error"
          title="This invite does not work"
          action={
            <Button href="/" variant="secondary" size="sm">
              Browse events
            </Button>
          }
        >
          {error}. Ask the organizer to send a fresh one.
        </Callout>
      ) : !invite ? (
        <Card className="flex flex-col gap-3 p-6" aria-busy>
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </Card>
      ) : (
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <DataList
            items={[
              { label: "Invite for", value: <span className="break-all">{invite.email}</span> },
              { label: "Event", value: invite.event.name },
              { label: "Status", value: invite.accepted ? <Badge tone="accent">Accepted</Badge> : "Not accepted yet" },
            ]}
          />

          <div className="border-t border-line pt-5">
            {mine ? (
              <Button size="lg" onClick={() => accept()} loading={busy} className="w-full">
                {invite.accepted ? "Open my judging queue" : "Accept and start judging"}
              </Button>
            ) : invite.signed_in_as ? (
              <div className="flex flex-col gap-3">
                <Callout tone="warning" title="You are signed in as someone else">
                  This invite is for {invite.email}, but you are signed in as {invite.signed_in_as}. Sign out to continue with the invited address.
                </Callout>
                <Button variant="secondary" onClick={signOut} className="self-start">
                  <LogOut /> Sign out and continue
                </Button>
              </div>
            ) : invite.needs_password ? (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (form.password.length < 8) return setFormError("Use at least 8 characters.");
                  void accept({ password: form.password, display_name: form.display_name.trim() || undefined });
                }}
              >
                <p className="text-sm text-muted">Set up your judge account. Having this link proves you own the address, so no email check is needed.</p>
                <Field label="Display name" hint="Organizers see it. Participants never see it next to your scores.">
                  <Input value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} autoComplete="name" maxLength={200} />
                </Field>
                <Field label="Password" hint="At least 8 characters." error={formError ?? undefined} required>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </Field>
                <Button type="submit" size="lg" loading={busy}>
                  Create account and accept
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">This address already has an account. Sign in with it to accept.</p>
                <Button href={`/login?next=${encodeURIComponent(here)}`} size="lg">
                  <LogIn /> Sign in as {invite.email}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </AuthShell>
  );
}
