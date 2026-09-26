"use client";

import { IconButton, TextField } from "@radix-ui/themes";
import { Check, Minus, Plus, Search, Shuffle } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { SPRING } from "@/components/amicro/presets";
import { useEvent } from "@/components/event-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, json } from "@/lib/api";
import type { Ballot, Project } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export function rateLimitMessage(err: unknown) {
  if (err instanceof ApiError && err.status === 429) return "Too many requests from this network. Wait a minute and try again.";
  return err instanceof ApiError ? err.detail : "Could not reach the server";
}

const spentOf = (votes: Record<string, number>, quadratic: boolean) =>
  Object.values(votes).reduce((sum, u) => sum + (quadratic ? u * u : u > 0 ? 1 : 0), 0);

const PAGE = 60;

export function BallotView({ ballot, onChange }: { ballot: Ballot; onChange: (b: Ballot) => void }) {
  const { event } = useEvent();
  const toast = useToast();
  const quadratic = ballot.vote_mode === "quadratic";
  const confirmed = useRef(ballot); // last state the server agreed to
  const seq = useRef(0);
  const canVote = ballot.voting_open && ballot.confirmed;
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);

  async function cast(projectId: string, units: number) {
    const votes = quadratic ? { ...ballot.votes, [projectId]: units } : units > 0 ? { [projectId]: 1 } : {};
    if (units === 0) delete votes[projectId];
    onChange({ ...ballot, votes, spent: spentOf(votes, quadratic) }); // optimistic
    const mine = ++seq.current;
    try {
      const next = await api<Ballot>(`/v1/ballots/${ballot.token}/votes`, {
        method: "POST",
        body: json({ submission_id: projectId, units }),
      });
      confirmed.current = next;
      if (mine === seq.current) onChange(next);
    } catch (err) {
      if (mine === seq.current) onChange(confirmed.current); // roll back
      toast.error("Vote not saved", rateLimitMessage(err));
    }
  }

  if (ballot.projects.length === 0) {
    return <EmptyState icon={Check} title="Nothing to vote on yet" description="Projects appear here once teams submit them." />;
  }

  const remaining = ballot.budget - ballot.spent;
  const chosen = !quadratic ? ballot.projects.find((p) => ballot.votes[p.id]) : undefined;
  const votedFor = Object.values(ballot.votes).filter((u) => u > 0).length;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = terms.length
    ? ballot.projects.filter((p) => terms.every((t) => `${p.title} ${p.summary} ${p.team.name} ${p.track?.name ?? ""}`.toLowerCase().includes(t)))
    : ballot.projects;

  return (
    <div className="flex flex-col gap-5">
      {!canVote && (
        <Callout tone="warning" title={!ballot.confirmed ? "Confirm your email first" : "Voting is closed"}>
          {!ballot.confirmed
            ? "Open the link we emailed you to confirm your address. Then you can vote here."
            : `Voting closed${ballot.closes_at ? ` ${formatDate(ballot.closes_at)}` : ""}. Your picks are shown as you cast them.`}
        </Callout>
      )}

      <Card className="z-10 flex flex-col gap-3 p-4 sm:sticky sm:top-(--event-sticky-top) sm:p-5">
        {quadratic ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-medium text-fg">
                <span className="tabular-nums">{remaining}</span> of {ballot.budget} credits left
              </p>
              <p className="text-sm text-muted">
                {votedFor ? `Spread over ${votedFor} project${votedFor === 1 ? "" : "s"}` : "No votes yet"}
              </p>
            </div>
            <Progress value={ballot.budget ? (ballot.spent / ballot.budget) * 100 : 0} tone={remaining <= ballot.budget * 0.15 ? "amber" : "accent"} aria-label="Credits spent" />
            <p className="text-sm text-muted">
              Votes get dearer on the same project: 1 vote costs 1 credit, 2 cost 4, 3 cost 9. Backing several projects goes further than piling onto one.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted" aria-live="polite">
            {chosen ? (
              <>
                Your vote is on <span className="font-medium text-fg">{chosen.title}</span>. Choosing another project moves it.
              </>
            ) : (
              "You have one vote. Pick the project you like best; you can move your vote until voting closes."
            )}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Shuffle className="size-3.5 shrink-0" aria-hidden /> Projects are in a random order that stays the same for your ballot, so no project gains from being listed first.
        </p>
      </Card>

      {ballot.projects.length > 12 && (
        <Input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Find a project on your ballot"
          aria-label="Find a project on your ballot"
          className="w-full sm:max-w-md"
        >
          <TextField.Slot>
            <Search className="size-4" aria-hidden />
          </TextField.Slot>
        </Input>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted" aria-live="polite">
          No project on your ballot matches “{q.trim()}”.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {visible.slice(0, limit).map((p, i) => (
            <li key={p.id} className="animate-page-in" style={{ animationDelay: i < 12 ? `${i * 25}ms` : undefined }}>
              <BallotCard
                project={p}
                slug={event.slug}
                units={ballot.votes[p.id] ?? 0}
                quadratic={quadratic}
                remaining={remaining}
                disabled={!canVote}
                onCast={(u) => void cast(p.id, u)}
              />
            </li>
          ))}
        </ul>
      )}
      {visible.length > limit && (
        <Button variant="secondary" className="self-center" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, visible.length - limit)} more
        </Button>
      )}
    </div>
  );
}

type CardProps = {
  project: Project;
  slug: string;
  units: number;
  quadratic: boolean;
  remaining: number;
  disabled: boolean;
  onCast: (units: number) => void;
};

function BallotCard({ project, slug, units, quadratic, remaining, disabled, onCast }: CardProps) {
  const active = units > 0;
  const nextCost = (units + 1) ** 2 - units ** 2;
  const affordable = nextCost <= remaining;

  return (
    <Card className={cn("flex h-full flex-col gap-2 p-4 transition-shadow duration-200 sm:p-5", active && "ring-2 ring-(--accent-8)")}>
      {project.track && (
        <div>
          <Badge>{project.track.name}</Badge>
        </div>
      )}
      <h3 className="font-semibold tracking-tight text-balance">
        <Link href={`/events/${slug}/projects/${project.id}`} className="hover:underline">
          {project.title}
        </Link>
      </h3>
      {project.summary && <p className="line-clamp-2 text-sm leading-relaxed text-muted">{project.summary}</p>}
      <p className="truncate text-sm text-muted">by {project.team.name}</p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
        {quadratic ? (
          <>
            <div className="flex items-center gap-2">
              <IconButton
                type="button"
                variant="soft"
                color="gray"
                size="2"
                aria-label={`Remove a vote from ${project.title}`}
                disabled={disabled || units === 0}
                onClick={() => onCast(units - 1)}
                className="cursor-pointer transition-transform active:scale-[0.94] disabled:cursor-not-allowed"
              >
                <Minus className="size-4" />
              </IconButton>
              <span className="w-8 text-center text-lg font-semibold tabular-nums" aria-live="polite" aria-label={`${units} votes for ${project.title}`}>
                <motion.span key={units} initial={{ y: -4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING} className="inline-block">
                  {units}
                </motion.span>
              </span>
              <IconButton
                type="button"
                variant="soft"
                color={active ? undefined : "gray"}
                size="2"
                aria-label={`Add a vote to ${project.title}, costs ${nextCost} credits`}
                disabled={disabled || !affordable}
                onClick={() => onCast(units + 1)}
                className="cursor-pointer transition-transform active:scale-[0.94] disabled:cursor-not-allowed"
              >
                <Plus className="size-4" />
              </IconButton>
            </div>
            <span className="text-right text-xs text-muted tabular-nums">
              {units > 0 && <span className="block text-fg">{units ** 2} credit{units === 1 ? "" : "s"} used</span>}
              {affordable ? `Next vote costs ${nextCost}` : "Not enough credits"}
            </span>
          </>
        ) : (
          <Button
            variant={active ? "outline" : "secondary"}
            size="sm"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onCast(active ? 0 : 1)}
            className={cn("w-full", active && "text-accent-11")}
          >
            {active ? (
              <>
                <Check /> Voted · Undo
              </>
            ) : (
              "Vote for this project"
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}
