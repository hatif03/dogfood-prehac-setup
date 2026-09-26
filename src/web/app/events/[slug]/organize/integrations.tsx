"use client";

import { Download, ShieldCheck, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useEvent } from "@/components/event-context";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, json } from "@/lib/api";
import type { ApiKey, SignedRecord, Webhook, WebhookDelivery } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { LoadError, Section, errMsg, plural, useApi } from "./shared";

// One row per FIG.01 stage, in lifecycle order (GET /v1/events/{slug}/export/{kind}.csv).
const EXPORTS = [
  { kind: "registrations", stage: "Registration", what: "Everyone with a role: name, email, role, team, tracks." },
  { kind: "teams", stage: "Teams", what: "Teams and their members." },
  { kind: "submissions", stage: "Submissions", what: "Every project, draft or submitted, with links and track." },
  { kind: "eligibility", stage: "Eligibility", what: "Duplicate and eligibility flags, with reasons." },
  { kind: "judges", stage: "Judges", what: "Judges, their tracks and progress." },
  { kind: "assignments", stage: "Assignment", what: "Which judge reviews which project, and when it was assigned." },
  { kind: "scores", stage: "Scoring", what: "Every review, criterion by criterion." },
  { kind: "normalization", stage: "Normalization", what: "The latest run: settings, mean, spread and each judge's offset." },
  { kind: "results", stage: "Results", what: "The final ranking." },
  { kind: "votes", stage: "Voting", what: "Community vote tally per project." },
  { kind: "records", stage: "Certificates", what: "Signed records issued, with verify links." },
  { kind: "audit", stage: "Audit", what: "The hash-chained log of every action." },
] as const;
const CSV_HEADER = "title,summary,team,track,repo_url,members";

function useOrigin() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

export function IntegrationsTab() {
  return (
    <div className="flex flex-col gap-12">
      <Exports />
      <div className="grid items-start gap-12 xl:grid-cols-2">
        <Import />
        <ApiKeys />
      </div>
      <Webhooks />
      <div className="grid items-start gap-12 xl:grid-cols-2">
        <Records />
        <Embed />
      </div>
    </div>
  );
}

function Code({ children, copy, wrap }: { children: string; copy?: boolean; wrap?: boolean }) {
  return (
    <div className="relative">
      <pre className={cn("overflow-x-auto rounded-(--radius-3) border border-line bg-surface-2 p-3 pr-12 font-mono text-xs leading-relaxed text-fg", wrap && "break-all whitespace-pre-wrap")}>{children}</pre>
      {copy && <CopyButton value={children} className="absolute top-2 right-2" />}
    </div>
  );
}

function Exports() {
  const { event } = useEvent();
  const base = `/v1/events/${event.slug}`;
  const rows = [
    ...EXPORTS.map((e) => ({ key: e.kind, stage: e.stage, file: `${e.kind}.csv`, what: e.what, href: `${base}/export/${e.kind}.csv` })),
    { key: "json", stage: "Everything", file: "export.json", what: "The whole event in fixtures.json shape. Re-import it with POST /v1/import.", href: `${base}/export.json` },
    { key: "zip", stage: "Everything", file: "archive.zip", what: "Every CSV above, export.json, the audit chain and the signing key in one file.", href: `${base}/archive.zip` },
  ];
  return (
    <Section title="Exports" description="Everything the portal knows, as files. The same role checks apply as in the API: a judge downloading scores.csv gets only their own.">
      <Table>
        <THead>
          <TR>
            <TH className="hidden sm:table-cell">Stage</TH>
            <TH>File</TH>
            <TH className="hidden md:table-cell">What is inside</TH>
            <TH>
              <span className="sr-only">Download</span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.key}>
              <TD className="hidden text-muted sm:table-cell">{r.stage}</TD>
              <TD>
                <span className="font-mono text-sm">{r.file}</span>
                <div className="text-xs text-muted md:hidden">{r.what}</div>
              </TD>
              <TD className="hidden text-muted md:table-cell">{r.what}</TD>
              <TD className="text-right">
                <Button variant="ghost" size="sm" href={r.href} download aria-label={`Download ${r.file}`}>
                  <Download /> <span className="hidden sm:inline">Download</span>
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Section>
  );
}

function Import() {
  const { event, refresh } = useEvent();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ projects: number; duplicates_flagged: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setText(await f.text());
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ projects: number; duplicates_flagged: number }>(`/v1/events/${event.slug}/import/projects.csv`, { method: "POST", headers: { "Content-Type": "text/csv" }, body: text });
      setResult(res);
      setText("");
      refresh();
      toast.success(`${plural(res.projects, "project")} imported`, res.duplicates_flagged ? `${res.duplicates_flagged} flagged as duplicates` : undefined);
    } catch (e) {
      setError(errMsg(e));
      toast.error("Import failed", errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Import projects" description="Bring submissions from a spreadsheet. Duplicate checks run on every row.">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-sm text-muted">Header</span>
        <code className="min-w-0 flex-1 truncate rounded-(--radius-2) bg-surface-2 px-2 py-1 font-mono text-xs">{CSV_HEADER}</code>
        <CopyButton value={CSV_HEADER} />
      </div>
      <Textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`${CSV_HEADER}\nTide Clock,Offline tide tables,Harbour Crew,Tools,https://github.com/x/tide,ada@example.org;grace@example.org`}
        className="font-mono text-xs"
        aria-label="CSV to import"
      />
      {error && <Callout tone="error" title="Nothing imported">{error}</Callout>}
      {result && !error && (
        <Callout tone="success" title={`${plural(result.projects, "project")} imported`}>
          {result.duplicates_flagged ? `${plural(result.duplicates_flagged, "row was", "rows were")} flagged as duplicates; see Overview.` : "No duplicates found."}
        </Callout>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={run} loading={busy} disabled={!text.trim()}>
          Import
        </Button>
        <Button asChild variant="ghost">
          <label className="has-focus-visible:outline-2 has-focus-visible:outline-(--focus-8)">
            Choose a .csv file
            <input type="file" accept=".csv,text/csv" onChange={pickFile} className="sr-only" />
          </label>
        </Button>
      </div>
    </Section>
  );
}

const DELIVERY_TONE: Record<WebhookDelivery["status"], BadgeTone> = { delivered: "accent", pending: "amber", failed: "coral" };

function Chip({ on, onToggle, children, disabled }: { on: boolean; onToggle: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label
      className={cn(
        "inline-flex h-7 cursor-pointer items-center rounded-full border px-2.5 font-mono text-xs transition-colors has-focus-visible:outline-2 has-focus-visible:outline-(--focus-8)",
        on ? "border-accent bg-accent/15 text-fg" : "border-line bg-surface text-muted hover:text-fg",
        disabled && "cursor-default opacity-50",
      )}
    >
      <input type="checkbox" className="sr-only" checked={on} disabled={disabled} onChange={onToggle} />
      {children}
    </label>
  );
}

function Webhooks() {
  const { event } = useEvent();
  const toast = useToast();
  const path = `/v1/events/${event.slug}/webhooks`;
  const hooks = useApi<Webhook[]>(path);
  const actions = useApi<string[]>("/v1/webhook-actions");
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Webhook | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of actions.data ?? []) {
      const p = a.split(".")[0];
      m.set(p, [...(m.get(p) ?? []), a]);
    }
    return [...m];
  }, [actions.data]);
  const toggle = (a: string) => setPicked((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    try {
      // A prefix already covers its actions; do not send both.
      const body = picked.filter((a) => a.endsWith(".*") || !picked.includes(`${a.split(".")[0]}.*`));
      const h = await api<Webhook>(path, { method: "POST", body: json({ url: url.trim(), actions: body }) });
      setSecret(h.secret ?? null);
      setUrl("");
      setPicked([]);
      hooks.reload();
      toast.success("Webhook added", "Copy the signing secret now; it is not shown again.");
    } catch (err) {
      toast.error("Webhook not added", errMsg(err));
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, kind: "test" | "delete") {
    setBusy(`${kind}-${id}`);
    try {
      if (kind === "test") {
        await api(`${path}/${id}/test`, { method: "POST" });
        toast.success("Ping queued", "If the receiver is down it is retried with backoff: 10s, 40s, 160s and on.");
      } else {
        await api(`${path}/${id}`, { method: "DELETE" });
        toast.info("Webhook disabled");
      }
      hooks.reload();
    } catch (err) {
      toast.error(kind === "test" ? "Ping not queued" : "Not disabled", errMsg(err));
    } finally {
      setBusy(null);
    }
  }

  const snippet = `import hmac, hashlib

def verify(secret: str, headers, body: bytes) -> bool:
    ts = headers["X-Portal-Timestamp"]
    sent = headers["X-Portal-Signature"].removeprefix("sha256=")
    mac = hmac.new(secret.encode(), ts.encode() + b"." + body, hashlib.sha256)
    return hmac.compare_digest(mac.hexdigest(), sent)`;

  return (
    <Section
      title="Webhooks"
      description="Every audited action is also a webhook: subscribe to exact actions, or to a prefix such as score.* for all of them. Deliveries are signed and retried with backoff."
    >
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <form onSubmit={create} className="flex flex-col gap-4">
          <Field label="Receiver URL">
            <Input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ci.example.org/portal-hook" />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-fg">
              Actions <span className="font-normal text-muted">({plural(picked.length, "selected", "selected")})</span>
            </legend>
            {actions.error ? (
              <LoadError error={actions.error} onRetry={actions.reload} />
            ) : actions.loading ? (
              <Skeleton className="h-32" />
            ) : (
              <ul className="flex flex-col gap-2">
                {groups.map(([prefix, list]) => {
                  const all = picked.includes(`${prefix}.*`);
                  return (
                    <li key={prefix} className="flex flex-wrap gap-1.5">
                      {list.length > 1 && (
                        <Chip on={all} onToggle={() => toggle(`${prefix}.*`)}>
                          {prefix}.*
                        </Chip>
                      )}
                      {list.map((a) => (
                        <Chip key={a} on={all || picked.includes(a)} disabled={all} onToggle={() => toggle(a)}>
                          {a}
                        </Chip>
                      ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
          <Button type="submit" variant="secondary" loading={busy === "create"} disabled={!url || !picked.length} className="self-start">
            Add webhook
          </Button>
          {secret && (
            <Callout tone="success" title="Signing secret, shown once" action={<Button size="sm" variant="ghost" onClick={() => setSecret(null)}>I saved it</Button>}>
              <div className="flex min-w-0 items-center gap-2" aria-live="polite">
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{secret}</code>
                <CopyButton value={secret} label="Copy" />
              </div>
            </Callout>
          )}
        </form>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm text-muted">
            Each request carries <code className="font-mono text-fg">X-Portal-Signature: sha256=HMAC(secret, timestamp + &quot;.&quot; + body)</code>. Check it like this:
          </p>
          <Code copy>{snippet}</Code>
        </div>
      </div>

      {hooks.error ? (
        <LoadError error={hooks.error} onRetry={hooks.reload} />
      ) : hooks.loading ? (
        <Skeleton className="h-24" />
      ) : !hooks.data?.length ? (
        <p className="text-sm text-muted">No webhooks yet.</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Receiver</TH>
              <TH className="hidden md:table-cell">Deliveries</TH>
              <TH>Status</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {hooks.data.map((h) => (
              <TR key={h.id}>
                <TD className="max-w-80">
                  <div className="font-mono text-sm break-all">{h.url}</div>
                  <div className="mt-1 font-mono text-xs text-muted">{h.actions.join(", ")}</div>
                </TD>
                <TD className="hidden text-sm whitespace-nowrap md:table-cell">
                  {h.delivered ?? 0} delivered · {h.pending ?? 0} pending · <span className={h.failed ? "text-coral-11" : undefined}>{h.failed ?? 0} failed</span>
                </TD>
                <TD>
                  <Badge tone={h.active ? "accent" : "neutral"}>{h.active ? "Active" : "Disabled"}</Badge>
                </TD>
                <TD>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDrawer(h)}>
                      Deliveries
                    </Button>
                    {h.active && (
                      <>
                        <Button size="sm" variant="ghost" loading={busy === `test-${h.id}`} onClick={() => act(h.id, "test")}>
                          <Zap /> Ping
                        </Button>
                        <AlertDialog
                          danger
                          title="Disable this webhook?"
                          description={`${h.url} stops receiving events. Pending retries are dropped. To resume, add it again.`}
                          confirmLabel="Disable"
                          onConfirm={() => act(h.id, "delete")}
                          trigger={
                            <Button size="sm" variant="danger">
                              Disable
                            </Button>
                          }
                        />
                      </>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Deliveries hook={drawer} path={path} onClose={() => setDrawer(null)} />
    </Section>
  );
}

function Deliveries({ hook, path, onClose }: { hook: Webhook | null; path: string; onClose: () => void }) {
  const list = useApi<WebhookDelivery[]>(hook ? `${path}/${hook.id}/deliveries` : null, { pollMs: hook ? 3000 : undefined });
  return (
    <Dialog open={hook !== null} onClose={onClose} title="Deliveries" description={hook?.url} size="lg">
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Skeleton className="h-24" />
      ) : !list.data.length ? (
        <p className="text-sm text-muted">Nothing sent yet. Try a ping.</p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <THead>
              <TR>
                <TH>Action</TH>
                <TH>Status</TH>
                <TH className="hidden sm:table-cell">Attempts</TH>
              </TR>
            </THead>
            <TBody>
              {list.data.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <div className="font-mono text-sm">{d.action}</div>
                    <div className="text-xs text-muted">
                      {relativeTime(d.created_at)}
                      {d.status === "pending" && ` · next try ${relativeTime(d.next_attempt_at)}`}
                    </div>
                    {d.last_error && <div className="mt-1 font-mono text-xs break-all text-coral-11">{d.last_error}</div>}
                  </TD>
                  <TD>
                    <Badge tone={DELIVERY_TONE[d.status]}>
                      {d.status}
                      {d.status_code ? ` ${d.status_code}` : ""}
                    </Badge>
                  </TD>
                  <TD className="hidden font-mono tabular-nums sm:table-cell">{d.attempts}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Dialog>
  );
}

function ApiKeys() {
  const { event } = useEvent();
  const toast = useToast();
  const origin = useOrigin();
  const path = `/v1/events/${event.slug}/api-keys`;
  const keys = useApi<ApiKey[]>(path);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [fresh, setFresh] = useState<ApiKey | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    try {
      const k = await api<ApiKey>(path, { method: "POST", body: json({ name: name.trim() || "integration" }) });
      setFresh(k);
      setName("");
      keys.reload();
      toast.success("API key created", "Copy it now; only the prefix is stored in plain text.");
    } catch (err) {
      toast.error("Key not created", errMsg(err));
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`${path}/${id}`, { method: "DELETE" });
      keys.reload();
      toast.info("Key revoked", "Requests with it are now treated as anonymous.");
    } catch (err) {
      toast.error("Not revoked", errMsg(err));
    }
  }

  return (
    <Section title="API keys" description="For scripts and CI. A key acts as you, and only on this event.">
      <form onSubmit={create} className="flex items-end gap-2">
        <Field label="Name" className="flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ci-export" />
        </Field>
        <Button type="submit" variant="secondary" loading={busy === "create"}>
          Create key
        </Button>
      </form>
      {fresh?.secret ? (
        <Callout tone="success" title={`${fresh.name}: shown once`} action={<Button size="sm" variant="ghost" onClick={() => setFresh(null)}>I saved it</Button>}>
          <div className="flex min-w-0 flex-col gap-2" aria-live="polite">
            <div className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{fresh.secret}</code>
              <CopyButton value={fresh.secret} label="Copy" />
            </div>
            <Code copy>{`curl -H "X-API-Key: ${fresh.secret}" \\\n  ${origin}/v1/events/${event.slug}/export/results.csv`}</Code>
          </div>
        </Callout>
      ) : (
        <Code>{`curl -H "X-API-Key: pk_…" \\\n  ${origin}/v1/events/${event.slug}/export/results.csv`}</Code>
      )}
      {keys.error ? (
        <LoadError error={keys.error} onRetry={keys.reload} />
      ) : keys.loading ? (
        <Skeleton className="h-16" />
      ) : !keys.data?.length ? (
        <p className="text-sm text-muted">No keys yet.</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Key</TH>
              <TH className="hidden sm:table-cell">Last used</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {keys.data.map((k) => (
              <TR key={k.id}>
                <TD>
                  <div className="font-medium">{k.name}</div>
                  <div className="font-mono text-xs text-muted">{k.prefix}…</div>
                </TD>
                <TD className="hidden text-sm text-muted sm:table-cell">{k.last_used_at ? relativeTime(k.last_used_at) : "Never"}</TD>
                <TD className="text-right">
                  {k.revoked ? (
                    <Badge>Revoked</Badge>
                  ) : (
                    <AlertDialog
                      danger
                      title={`Revoke ${k.name}?`}
                      description="Scripts using this key stop working at once. This cannot be undone; create a new key instead."
                      confirmLabel="Revoke key"
                      onConfirm={() => revoke(k.id)}
                      trigger={
                        <Button size="sm" variant="danger">
                          Revoke
                        </Button>
                      }
                    />
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Section>
  );
}

function Embed() {
  const { event } = useEvent();
  const origin = useOrigin();
  const token = event.widget_token;
  return (
    <Section title="Embed widget" description="A live, read-only gallery for your own site. The token only opens public data.">
      {!token ? (
        <p className="text-sm text-muted">No widget token on this event.</p>
      ) : (
        <>
          <Code copy wrap>{`<script src="${origin}/embed.js" data-token="${token}"></script>`}</Code>
          <div className="overflow-hidden rounded-(--radius-3) border border-line">
            <div className="border-b border-line bg-surface-2 px-3 py-1.5 font-mono text-xs text-muted">Preview · /widget/{token.slice(0, 8)}…</div>
            <iframe src={`/widget/${token}`} title="Widget preview" className="h-80 w-full bg-bg" loading="lazy" />
          </div>
        </>
      )}
    </Section>
  );
}

const RECORD_KINDS = [
  { value: "judge", label: "Judge records", hint: "Proof of judging: reviews submitted, signed." },
  { value: "participant", label: "Participant certificates", hint: "One per member of every team with a public project." },
  { value: "winner", label: "Winner certificates", hint: "For the top-ranked teams of the latest normalization run." },
] as const;

function Records() {
  const { event } = useEvent();
  const toast = useToast();
  const path = `/v1/events/${event.slug}/records`;
  const list = useApi<SignedRecord[]>(path);
  const [kind, setKind] = useState<(typeof RECORD_KINDS)[number]["value"]>("judge");
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = emails.split(/[\s,;]+/).filter((e) => e.includes("@"));

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<SignedRecord[]>(path, { method: "POST", body: json({ kind, user_emails: parsed }) });
      toast.success(`${plural(res.length, "record")} signed`, "Each verifies offline against the public key.");
      setEmails("");
      list.reload();
    } catch (err) {
      toast.error("Records not issued", errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Signed records and certificates"
      description="Ed25519-signed JSON. Anyone can check one against the public key, no account needed."
      actions={
        <Button variant="ghost" size="sm" href="/.well-known/portal-signing-key.pem" target="_blank" rel="noreferrer">
          <ShieldCheck /> Public key
        </Button>
      }
    >
      <form onSubmit={issue} className="grid gap-3 sm:grid-cols-2">
        <Field label="Kind" hint={RECORD_KINDS.find((k) => k.value === kind)?.hint}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {RECORD_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Emails" hint={parsed.length ? plural(parsed.length, "recipient") : "Leave empty for everyone eligible."}>
          <Textarea rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="diego.herrera@example.org" />
        </Field>
        <Button type="submit" variant="secondary" loading={busy} className="self-start">
          Sign and issue
        </Button>
      </form>
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <Skeleton className="h-24" />
      ) : !list.data?.length ? (
        <p className="text-sm text-muted">No records issued yet.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <THead>
              <TR>
                <TH>Recipient</TH>
                <TH>Kind</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {list.data.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="font-medium">{r.payload.subject.name}</div>
                    <div className="text-xs text-muted">issued {relativeTime(r.payload.issued_at)}</div>
                  </TD>
                  <TD>
                    <span className="capitalize">{r.kind}</span> {r.revoked && <Badge tone="coral">Revoked</Badge>}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button href={`/verify?record=${r.id}`} target="_blank" rel="noreferrer" variant="ghost" size="sm">
                        Verify
                      </Button>
                      <Button href={`/v1/records/${r.id}/certificate`} target="_blank" rel="noreferrer" variant="ghost" size="sm">
                        Certificate
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
