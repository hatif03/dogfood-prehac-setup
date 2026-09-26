"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useEvent } from "@/components/event-context";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { DataList } from "@/components/ui/data-list";
import { Progress } from "@/components/ui/progress";
import type { NormalizationRun, Results } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const f2 = (n: number) => n.toFixed(2);

/** Shown when the API answers 403: the page only explains what the server already refused. */
export function Locked({ reason }: { reason: string }) {
  const { event } = useEvent();
  const closes = event.voting_closes_at && new Date(event.voting_closes_at).getTime() > Date.now() ? event.voting_closes_at : null;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Callout icon={Lock} title="Results are hidden for now">
        <p>
          The ranking stays private until community voting closes and the organizer publishes it, so early scores cannot sway the vote.
          {closes ? (
            <>
              {" "}
              Voting closes in <Countdown target={closes} />; results follow when the organizer publishes them.
            </>
          ) : (
            " They appear here as soon as the organizer publishes them."
          )}
        </p>
        <p className="mt-2 text-muted">
          The API refuses the request too, not just this page: <span className="font-mono text-xs break-words">{reason}</span>
        </p>
      </Callout>
      <div className="flex flex-wrap gap-2">
        {event.voting_open && <Button href={`/events/${event.slug}/vote`}>Vote for a project</Button>}
        <Button href={`/events/${event.slug}`} variant="secondary">
          Browse projects
        </Button>
      </div>
    </div>
  );
}

export function PreviewBanner({ slug }: { slug: string }) {
  return (
    <Callout
      tone="warning"
      title="Preview: only organizers can see this"
      action={
        <Button href={`/events/${slug}/organize`} size="sm" variant="secondary">
          Publish from the organizer console
        </Button>
      }
    >
      Everyone else gets a 403 from the API until you publish.
    </Callout>
  );
}

export function Method({ run }: { run: NormalizationRun }) {
  const cc = run.cross_check;
  const items = [
    { label: "Scores", value: "Each review is the judge's weighted rubric total." },
    {
      label: "Adjustment",
      value: (
        <p>
          Every judge&apos;s leniency is estimated and removed, so drawing a generous judge does not help a project.{" "}
          <span className="text-muted">
            (<span className="font-mono text-xs">{run.method}</span>, λ judge {run.params.lambda_judge}, λ project {run.params.lambda_project})
          </span>
        </p>
      ),
    },
    { label: "Reviews used", value: `${run.reviews_used}${run.params.drop_constant_raters ? ", leaving out judges who gave every project the same score" : ""}` },
    { label: "± value", value: "One standard error. Overlapping ranges mean the order is close." },
    ...(cc
      ? [
          {
            label: "Cross-check",
            value: `${cc.method}: agreement τ ${cc.kendall_tau_bt_vs_adjusted != null ? f2(cc.kendall_tau_bt_vs_adjusted) : "n/a"} with the adjusted ranking, over ${cc.pairs} pairs.`,
          },
        ]
      : []),
    { label: "Computed", value: formatDate(run.created_at) },
  ];
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <h2 id="method-heading" className="text-lg font-semibold tracking-tight">
        How this was computed
      </h2>
      <DataList items={items} />
      <p className="text-sm text-muted">
        The full method, with a worked proof, is in <span className="font-mono text-xs text-fg">JUDGING.md</span> in the portal&apos;s repository. The{" "}
        <a href="/docs" target="_blank" rel="noreferrer" className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-current">
          API docs
        </a>{" "}
        describe the results endpoint.
      </p>
    </Card>
  );
}

export function PopularVote({ rows, slug }: { rows: Results["popular_vote"]; slug: string }) {
  const max = Math.max(1, ...rows.map((r) => r.votes));
  const total = rows.reduce((s, r) => s + r.votes, 0);
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Popular vote</h2>
        <p className="mt-1 text-sm text-muted">Counted separately. It never changes the judged ranking.</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No confirmed votes were counted.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.slice(0, 10).map((r, i) => (
            <li key={r.project_id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1.5 text-sm">
              <span className="text-muted tabular-nums">{i + 1}</span>
              <Link href={`/events/${slug}/projects/${r.project_id}`} className="truncate text-fg hover:underline">
                {r.title}
              </Link>
              <span className="text-right text-muted tabular-nums">{r.votes}</span>
              <Progress value={(r.votes / max) * 100} tone="violet" className="col-start-2" aria-label={`${r.votes} votes for ${r.title}`} />
            </li>
          ))}
        </ol>
      )}
      {total > 0 && <p className="text-sm text-muted">{total} votes from confirmed ballots.</p>}
    </Card>
  );
}
