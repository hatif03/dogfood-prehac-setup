"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useEvent } from "@/components/event-context";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, json } from "@/lib/api";
import type { Team } from "@/lib/types";

/** Accepts a full invite URL (any origin) or a bare token. */
export function inviteToken(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const m = text.match(/\/invite\/([^/?#\s]+)/);
  const token = m ? m[1] : text;
  return /^[A-Za-z0-9_-]{6,}$/.test(token) ? token : null;
}

export function NoTeam({ slug, open, onCreated }: { slug: string; open: boolean; onCreated: (team: Team) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onCreated(await api<Team>(`/v1/events/${slug}/teams`, { method: "POST", body: json({ name: name.trim() }) }));
    } catch (err) {
      toast.error("Could not create the team", err instanceof ApiError ? err.detail : "Could not reach the server");
      setBusy(false);
    }
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const token = inviteToken(link);
    if (!token) return setLinkError("Paste the whole invite link, for example https://…/invite/abc123");
    router.push(`/invite/${token}`);
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <p className="text-muted">Every submission belongs to a team. Working alone? Start a team of one.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card asChild className="flex flex-col gap-4 p-5 sm:p-6">
          <form onSubmit={create}>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Start a team</h2>
              <p className="mt-1 text-sm text-muted">You become the captain and get an invite link for your teammates.</p>
            </div>
            <Field label="Team name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required placeholder="e.g. Night Owls" disabled={!open} />
            </Field>
            <Button type="submit" loading={busy} disabled={!open || !name.trim()} className="mt-auto self-start">
              Create team
            </Button>
          </form>
        </Card>
        <Card asChild className="flex flex-col gap-4 p-5 sm:p-6">
          <form onSubmit={join}>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Join a team</h2>
              <p className="mt-1 text-sm text-muted">Paste the link your captain sent. You see the team before you join.</p>
            </div>
            <Field label="Invite link" error={linkError ?? undefined}>
              <Input
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setLinkError(null);
                }}
                placeholder="https://…/invite/…"
              />
            </Field>
            <Button type="submit" variant="secondary" disabled={!link.trim()} className="mt-auto self-start">
              Open invite
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function TeamCard({ team, onChange }: { team: Team; onChange: (team: Team) => void }) {
  const toast = useToast();
  const { event } = useEvent();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const count = team.members.length;
  const full = count >= team.max_size;
  const link = team.invite_token ? `${origin}/invite/${team.invite_token}` : null;

  async function rotate() {
    try {
      onChange(await api<Team>(`/v1/events/${event.slug}/teams/rotate-invite`, { method: "POST" }));
      toast.success("New invite link ready", "The old link no longer works.");
    } catch (err) {
      toast.error("Could not make a new link", err instanceof ApiError ? err.detail : undefined);
    }
  }

  return (
    <Card asChild className="flex flex-col gap-5 p-5 lg:sticky lg:top-(--event-sticky-top)">
      <aside aria-labelledby="team-heading">
        <div>
          <p className="text-sm text-muted">Your team</p>
          <h2 id="team-heading" className="truncate text-lg font-semibold tracking-tight">
            {team.name}
          </h2>
          <p className="mt-0.5 text-sm text-muted tabular-nums">
            {count} of {team.max_size} members{full && " (full)"}
          </p>
        </div>
        <ul className="flex flex-col gap-3">
          {team.members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3">
              <Avatar name={m.display_name || m.email} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{m.display_name}</span>
                <span className="truncate text-xs text-muted">{m.email}</span>
              </span>
              {m.is_captain && <Badge>Captain</Badge>}
            </li>
          ))}
        </ul>
        {event.submissions_open && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="text-sm font-medium">Invite teammates</h3>
          {link ? (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-(--radius-2) bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-muted" title={link}>
                {link}
              </code>
              <CopyButton value={link} label="Copy" />
            </div>
          ) : (
            <p className="text-sm text-muted">No active link. Make a new one below.</p>
          )}
          <p className="text-sm text-muted">{full ? "The team is full, so the link refuses new members." : "Anyone with the link can join until the team is full."}</p>
          <AlertDialog
            title="Make a new invite link?"
            description="The current link stops working at once. Anyone who has not joined yet needs the new one."
            confirmLabel="Make new link"
            onConfirm={rotate}
            trigger={
              <Button size="sm" variant="ghost" className="self-start">
                <RefreshCw /> New link
              </Button>
            }
          />
        </div>
        )}
      </aside>
    </Card>
  );
}
