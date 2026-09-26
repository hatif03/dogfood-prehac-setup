"use client";

import { RadioCards } from "@radix-ui/themes";
import { Download, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useEvent } from "@/components/event-context";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Countdown } from "@/components/ui/countdown";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, json } from "@/lib/api";
import type { EventDetail } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { LoadError, Section, downloadText, errMsg, fromLocalInput, plural, toLocalInput, useApi } from "./shared";

type Access = EventDetail["voting_access"];
type Mode = EventDetail["vote_mode"];

const ACCESS: { value: Access; title: string; body: string }[] = [
  { value: "open", title: "Open link", body: "Anyone with the link, one ballot per browser, capped per IP per day. Easiest to join, easiest to game." },
  { value: "authenticated", title: "Signed-in accounts", body: "One vote per account. Strongest identity, but voters must register first." },
  { value: "email_gated", title: "Email-gated", body: "One vote per confirmed email; aliases like a+1@ count as a@. A little friction, good protection." },
  { value: "link", title: "Single-use links", body: "You mint links and hand them out in the room. Fast and private; whoever holds a link votes once." },
];

const MODES: { value: Mode; title: string; body: string; warn?: string }[] = [
  { value: "one_person_one_vote", title: "One person, one vote", body: "Each voter picks one project. Simple to explain, easy to audit." },
  {
    value: "quadratic",
    title: "Quadratic",
    body: "Voters spread a credit budget; n votes on one project cost n² credits, so a loud minority cannot dominate.",
    warn: "It also makes extra identities more valuable. Pair it with email-gated voting or single-use links, never open links.",
  },
];

type Draft = { voting_access: Access; vote_mode: Mode; quadratic_budget: number; opens: string; closes: string };
const draftOf = (e: EventDetail): Draft => ({
  voting_access: e.voting_access,
  vote_mode: e.vote_mode,
  quadratic_budget: e.quadratic_budget,
  opens: toLocalInput(e.voting_opens_at),
  closes: toLocalInput(e.voting_closes_at),
});

export function VotingTab() {
  const { event, refresh } = useEvent();
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => draftOf(event));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = draftOf(event);

  const changes: Record<string, unknown> = {};
  if (d.voting_access !== base.voting_access) changes.voting_access = d.voting_access;
  if (d.vote_mode !== base.vote_mode) changes.vote_mode = d.vote_mode;
  if (d.quadratic_budget !== base.quadratic_budget) changes.quadratic_budget = d.quadratic_budget;
  if (d.opens !== base.opens) changes.voting_opens_at = fromLocalInput(d.opens);
  if (d.closes !== base.closes) changes.voting_closes_at = fromLocalInput(d.closes);
  const dirty = Object.keys(changes).length > 0;
  const badWindow = Boolean(d.opens && d.closes && d.opens >= d.closes);

  async function patch(body: Record<string, unknown>, ok: string, detail?: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/events/${event.slug}`, { method: "PATCH", body: json(body) });
      const next = await refresh();
      setD(draftOf(next));
      router.refresh();
      toast.success(ok, detail);
    } catch (e) {
      setError(errMsg(e));
      toast.error("Not saved", errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-12">
      <Card className="p-4 sm:p-5">
        <div aria-live="polite">
          <p className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden className={cn("size-2.5 rounded-full", event.voting_open ? "bg-violet" : "bg-line-strong")} />
            {event.voting_open ? "Voting is open" : "Voting is closed"}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {event.voting_open && event.voting_closes_at ? (
              <>
                Closes in <Countdown target={event.voting_closes_at} />, {formatDate(event.voting_closes_at)}.
              </>
            ) : event.voting_opens_at && new Date(event.voting_opens_at) > new Date() ? (
              <>
                Opens in <Countdown target={event.voting_opens_at} />, {formatDate(event.voting_opens_at)}.
              </>
            ) : event.voting_closes_at ? (
              `Closed ${formatDate(event.voting_closes_at)}.`
            ) : (
              "No voting window set. Set one below to run community voting."
            )}
          </p>
        </div>
      </Card>

      <Section title="Who can vote" description="Each identity check trades ease of joining against how hard it is to vote twice.">
        <RadioCards.Root value={d.voting_access} onValueChange={(v) => setD({ ...d, voting_access: v as Access })} columns={{ initial: "1", sm: "2" }} aria-label="Who can vote">
          {ACCESS.map((a) => (
            <RadioCards.Item key={a.value} value={a.value} className="cursor-pointer items-start justify-start text-left">
              <span className="flex flex-col gap-1">
                <span className="font-medium text-fg">{a.title}</span>
                <span className="text-sm text-muted">{a.body}</span>
              </span>
            </RadioCards.Item>
          ))}
        </RadioCards.Root>
      </Section>

      <Section title="How votes count">
        <RadioCards.Root value={d.vote_mode} onValueChange={(v) => setD({ ...d, vote_mode: v as Mode })} columns={{ initial: "1", sm: "2" }} aria-label="How votes count">
          {MODES.map((m) => (
            <RadioCards.Item key={m.value} value={m.value} className="cursor-pointer items-start justify-start text-left">
              <span className="flex flex-col gap-1">
                <span className="font-medium text-fg">{m.title}</span>
                <span className="text-sm text-muted">{m.body}</span>
                {m.warn && (
                  <span className="mt-1 flex gap-1.5 text-sm text-amber-11">
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {m.warn}
                  </span>
                )}
              </span>
            </RadioCards.Item>
          ))}
        </RadioCards.Root>
        {d.vote_mode === "quadratic" && d.voting_access === "open" && (
          <Callout tone="warning" title="Quadratic voting with open links is easy to game">
            Anyone can clear their browser and vote again, and each fresh ballot brings a full credit budget. Choose email-gated or single-use links.
          </Callout>
        )}
        {d.vote_mode === "quadratic" && (
          <Field label="Credit budget per voter" hint={`Enough for ${Math.floor(Math.sqrt(d.quadratic_budget || 0))} votes on a single project.`} className="max-w-56">
            <Input type="number" min={1} max={1000} value={d.quadratic_budget} onChange={(e) => setD({ ...d, quadratic_budget: Number(e.target.value) })} />
          </Field>
        )}
      </Section>

      <Section title="Window" description="Your local time; stored as UTC. Results cannot be published while voting is open.">
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <Field label="Opens">
            <Input type="datetime-local" value={d.opens} onChange={(e) => setD({ ...d, opens: e.target.value })} />
          </Field>
          <Field label="Closes" error={badWindow ? "Must be after it opens" : undefined}>
            <Input type="datetime-local" value={d.closes} onChange={(e) => setD({ ...d, closes: e.target.value })} />
          </Field>
        </div>
      </Section>

      <div className="flex flex-col gap-3">
        {error && (
          <Callout tone="error" title="Voting settings not saved">
            {error}
          </Callout>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={!dirty || badWindow} loading={busy} onClick={() => patch(changes, "Voting settings saved")}>
            Save voting settings
          </Button>
          {dirty && (
            <>
              <Button variant="ghost" onClick={() => setD(base)}>
                Discard changes
              </Button>
              <span className="text-sm text-muted">{plural(Object.keys(changes).length, "unsaved change")}</span>
            </>
          )}
        </div>
      </div>

      <div className="grid items-start gap-12 xl:grid-cols-2">
        {event.voting_access === "link" ? (
          <VoteLinks />
        ) : (
          <Section title="Voting links">
            <p className="text-sm text-muted">Only used with single-use links. Choose them under Who can vote and save to mint links here.</p>
          </Section>
        )}
        <Tally />
      </div>
    </div>
  );
}

function VoteLinks() {
  const { event } = useEvent();
  const toast = useToast();
  const [count, setCount] = useState(20);
  const [links, setLinks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function mint() {
    setBusy(true);
    try {
      const res = await api<{ links: string[] }>(`/v1/events/${event.slug}/vote-links`, { method: "POST", body: json({ count }) });
      setLinks((cur) => [...res.links, ...cur]);
      toast.success(`${plural(res.links.length, "link")} minted`, "Each works once. They are not shown again after you leave this page.");
    } catch (e) {
      toast.error("Links not minted", errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Voting links"
      description="Single-use ballots. Print them or paste them into a chat. Shown only on this page, once."
      actions={
        links.length > 0 && (
          <>
            <CopyButton value={links.join("\n")} label="Copy all" />
            <Button variant="secondary" size="sm" onClick={() => downloadText(`${event.slug}-vote-links.txt`, links.join("\n") + "\n")}>
              <Download /> Download .txt
            </Button>
          </>
        )
      }
    >
      <div className="flex items-end gap-3">
        <Field label="How many" className="w-28">
          <Input type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </Field>
        <Button variant="secondary" onClick={mint} loading={busy} disabled={count < 1}>
          Mint links
        </Button>
      </div>
      {links.length > 0 && (
        <ol className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-(--radius-3) border border-line p-2" aria-live="polite">
          {links.map((l, i) => (
            <li key={l} className="flex items-center gap-2">
              <span className="w-8 text-right font-mono text-xs text-muted tabular-nums">{links.length - i}</span>
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{l}</code>
              <CopyButton value={l} />
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some(Boolean));
}

function Tally() {
  const { event } = useEvent();
  const csv = useApi<string>(`/v1/events/${event.slug}/export/votes.csv`, { pollMs: 10000 });
  const rows = csv.data ? parseCsv(csv.data).slice(1).map(([id, title, votes]) => ({ id, title, votes: Number(votes) || 0 })) : [];
  rows.sort((a, b) => b.votes - a.votes);
  const total = rows.reduce((s, r) => s + r.votes, 0);

  return (
    <Section
      title="Live tally"
      description="Only organizers see this while voting runs; voters and judges get a 403 from the same export. Refreshes every 10 seconds."
      actions={
        <Button variant="ghost" size="sm" href={`/v1/events/${event.slug}/export/votes.csv`} download>
          votes.csv
        </Button>
      }
    >
      {csv.error ? (
        <LoadError error={csv.error} onRetry={csv.reload} />
      ) : csv.loading ? (
        <Skeleton className="h-40" />
      ) : total === 0 ? (
        <p className="text-sm text-muted">No votes yet.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <THead>
              <TR>
                <TH className="w-12">#</TH>
                <TH>Project</TH>
                <TH className="text-right">Votes</TH>
                <TH className="hidden text-right sm:table-cell">Share</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r, i) => (
                <TR key={r.id}>
                  <TD className="font-mono tabular-nums">{i + 1}</TD>
                  <TD>{r.title}</TD>
                  <TD className="text-right font-mono tabular-nums">{r.votes}</TD>
                  <TD className="hidden text-right font-mono text-muted tabular-nums sm:table-cell">{Math.round((r.votes / total) * 100)}%</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
