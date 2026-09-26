"use client";

import { Database, Gauge, History, Settings2, ShieldX, Trophy, Users, Vote } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useEvent } from "@/components/event-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { ApiError, api } from "@/lib/api";
import { AuditTab } from "./audit";
import { IntegrationsTab } from "./integrations";
import { JudgingTab } from "./judging";
import { LifecycleRail } from "./lifecycle";
import { OverviewTab } from "./overview";
import { ResultsTab } from "./results";
import { SettingsTab } from "./settings";
import { type ConsoleCtx, type Dash, type OrgTab, type Run, useApi } from "./shared";
import { VotingTab } from "./voting";

const TABS: { value: OrgTab; label: string; icon: React.ReactNode }[] = [
  { value: "overview", label: "Overview", icon: <Gauge /> },
  { value: "people", label: "People & judging", icon: <Users /> },
  { value: "results", label: "Results", icon: <Trophy /> },
  { value: "voting", label: "Voting", icon: <Vote /> },
  { value: "settings", label: "Settings", icon: <Settings2 /> },
  { value: "data", label: "Data & integrations", icon: <Database /> },
  { value: "audit", label: "Audit", icon: <History /> },
];
// Old ?tab= values from earlier links and bookmarks.
const ALIASES: Record<string, OrgTab> = { judging: "people", integrations: "data" };

const noop = () => () => {};

function Console() {
  const { event } = useEvent();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab") ?? "";
  const tab: OrgTab = ALIASES[raw] ?? (TABS.some((t) => t.value === raw) ? (raw as OrgTab) : "overview");
  const go = (v: OrgTab) => router.replace(v === "overview" ? pathname : `${pathname}?tab=${v}`, { scroll: false });
  // Everything below is fetched client-side and shows local times; skip SSR so server and browser never disagree.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const allowed = event.viewer.role === "organizer" || event.viewer.role === "admin";
  const base = `/v1/events/${event.slug}`;
  const dash = useApi<Dash>(mounted && allowed ? `${base}/dashboard` : null, { pollMs: 5000 });
  const run = useApi<Run>(mounted && allowed ? `${base}/normalization` : null);

  if (!mounted) return <Skeleton className="h-36 w-full" />;
  if (!allowed) return <Refusal slug={event.slug} />;
  const ctx: ConsoleCtx = { dash, run, go };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Organizer console</h1>
      <LifecycleRail {...ctx} />
      <Tabs tabs={TABS} value={tab} onValueChange={go} aria-label="Organizer sections">
        <TabPanel value={tab} className="pt-6">
          {tab === "overview" && <OverviewTab {...ctx} />}
          {tab === "people" && <JudgingTab {...ctx} />}
          {tab === "results" && <ResultsTab {...ctx} />}
          {tab === "voting" && <VotingTab />}
          {tab === "settings" && <SettingsTab />}
          {tab === "data" && <IntegrationsTab />}
          {tab === "audit" && <AuditTab />}
        </TabPanel>
      </Tabs>
    </div>
  );
}

/** Shown to judges, participants and visitors. The probe is real: it asks the API and prints what it said. */
function Refusal({ slug }: { slug: string }) {
  const path = `/v1/events/${slug}/dashboard`;
  const [probe, setProbe] = useState<{ status: number; detail: string } | null>(null);
  useEffect(() => {
    api(path)
      .then(() => setProbe({ status: 200, detail: "OK" }))
      .catch((e) => setProbe(e instanceof ApiError ? { status: e.status, detail: e.detail } : { status: 0, detail: String(e) }));
  }, [path]);

  return (
    <Card className="mx-auto flex max-w-xl flex-col items-center gap-5 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-(--radius-4) bg-coral/10 text-coral-11">
        <ShieldX className="size-6" aria-hidden />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Organizers only</h1>
        <p className="text-sm leading-relaxed text-muted">
          The API refuses judges and participants here, not just this page. Scores, rankings and the audit log stay with organizers until results are published.
        </p>
      </div>
      <div className="w-full rounded-(--radius-3) border border-line bg-surface-2 p-4 text-left font-mono text-sm" aria-live="polite">
        <div className="text-muted">$ curl {path}</div>
        {probe ? (
          <div className={probe.status === 200 ? "mt-1 text-accent-11" : "mt-1 text-coral-11"}>
            {probe.status || "network"} {probe.detail}
          </div>
        ) : (
          <Skeleton className="mt-2 h-3 w-40" />
        )}
      </div>
      <Button variant="secondary" href={`/events/${slug}`}>
        Back to the gallery
      </Button>
    </Card>
  );
}

export default function OrganizePage() {
  return (
    <Suspense fallback={<Skeleton className="h-36 w-full" />}>
      <Console />
    </Suspense>
  );
}
