"use client";

import { Braces, FileBadge, Hash, KeyRound, Search, Server, ShieldAlert, ShieldQuestion, MonitorSmartphone } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { canonicalize, verifyInBrowser, type Ed25519Jwk } from "@/components/public/canonical";
import { AnimatedCheck } from "@/components/ui/animated-check";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { DataList, type DataListItem } from "@/components/ui/data-list";
import { Input, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { api, ApiError, json } from "@/lib/api";
import type { SignedRecord } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type Mode = "record" | "paste";
type Payload = Record<string, unknown>;
type BrowserCheck = "pending" | "unsupported" | { ok: boolean; bytesMatch: boolean } | { error: string };
type ServerCheck = "pending" | { valid: boolean; revoked: boolean; key_id: string } | { error: string };
type Outcome = { payload: Payload; canonical: string; signature: string; record: SignedRecord | null; browser: BrowserCheck; server: ServerCheck };

const TABS = [
  { value: "record" as const, label: "Record ID", icon: <Search className="size-3.5" aria-hidden /> },
  { value: "paste" as const, label: "Paste JSON", icon: <Braces className="size-3.5" aria-hidden /> },
];

function FailMark({ size = 40 }: { size?: number }) {
  return (
    <svg role="img" aria-label="Failed" width={size} height={size} viewBox="0 0 40 40" fill="none" className="text-coral-11">
      <motion.circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="2.5" strokeOpacity={0.35} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }} />
      <motion.path d="M14 14l12 12M26 14L14 26" stroke="currentColor" strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.3 }} />
    </svg>
  );
}

let cachedJwk: Promise<Ed25519Jwk> | null = null;
const portalJwk = () => (cachedJwk ??= api<Ed25519Jwk>("/.well-known/portal-signing-key.json"));

function parsePasted(text: string): { payload: Payload; canonical: string; signature: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That is not valid JSON.");
  }
  if (!raw || typeof raw !== "object") throw new Error("Expected a JSON object.");
  const obj = raw as { payload?: unknown; canonical?: unknown; signature?: unknown };
  if (typeof obj.signature !== "string") throw new Error("Missing \"signature\" (hex string).");
  let payload = obj.payload as Payload | undefined;
  if (!payload && typeof obj.canonical === "string") payload = JSON.parse(obj.canonical) as Payload;
  if (!payload || typeof payload !== "object") throw new Error("Missing \"payload\" object.");
  // The signature covers the canonical bytes of the payload. Rebuild them so an edited payload cannot hide behind a stale canonical.
  return { payload, canonical: canonicalize(payload), signature: obj.signature };
}

function CheckRow({ icon: Icon, title, state, detail }: { icon: typeof Server; title: string; state: "pending" | "ok" | "fail" | "warn"; detail: string }) {
  return (
    <div className="flex items-start gap-3 border-t border-line px-5 py-4 sm:px-6">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{detail}</p>
      </div>
      <span className="grid size-8 shrink-0 place-items-center">
        {state === "pending" ? <Spinner /> : state === "ok" ? <AnimatedCheck size={28} label="Passed" /> : state === "fail" ? <FailMark size={28} /> : <ShieldQuestion className="size-6 text-amber-11" aria-label="Not checked" />}
      </span>
    </div>
  );
}

function browserRow(b: BrowserCheck) {
  if (b === "pending") return { state: "pending" as const, detail: "Checking with WebCrypto…" };
  if (b === "unsupported") return { state: "warn" as const, detail: "This browser has no Ed25519 in WebCrypto (or the page is not on https/localhost). Rely on the API check or verify with openssl." };
  if ("error" in b) return { state: "fail" as const, detail: b.error };
  if (!b.bytesMatch) return { state: "fail" as const, detail: "The canonical text does not match the payload shown. Someone edited one of them." };
  return b.ok
    ? { state: "ok" as const, detail: "Ed25519 signature verified locally against the portal's public key." }
    : { state: "fail" as const, detail: "Signature does not match these bytes. The record was altered or signed by another key." };
}

function serverRow(s: ServerCheck) {
  if (s === "pending") return { state: "pending" as const, detail: "Asking POST /v1/records/verify…" };
  if ("error" in s) return { state: "fail" as const, detail: s.error };
  if (s.valid && s.revoked) return { state: "fail" as const, detail: "Signature is valid, but the organizer revoked this record." };
  return s.valid
    ? { state: "ok" as const, detail: `Valid for key ${s.key_id}.` }
    : { state: "fail" as const, detail: `Not valid for this portal's key (${s.key_id}).` };
}

const KIND_LABEL: Record<string, string> = {
  "portal.judge_record": "Judge record",
  "portal.winner_record": "Winner record",
  "portal.participant_record": "Participant record",
};

function Decoded({ o }: { o: Outcome }) {
  const p = o.payload as Payload & {
    subject?: { name?: string; email_sha256?: string };
    event?: { name?: string; slug?: string };
  };
  const extra = (["reviews_submitted", "project", "team", "rank", "track", "prize"] as const).filter((k) => p[k] !== undefined && p[k] !== null);
  const cert = o.record?.certificate_url ? new URL(o.record.certificate_url, window.location.href).pathname : null;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">What the record says</h2>
        <Badge className="ml-auto">{KIND_LABEL[String(p.type)] ?? String(p.type ?? o.record?.kind ?? "record")}</Badge>
      </div>
      <DataList
        className="mt-4"
        items={([
          p.subject?.name && { label: "Issued to", value: p.subject.name },
          p.event?.name && {
            label: "Event",
            value: (
              <a href={`/events/${p.event.slug}`} className="underline decoration-line-strong underline-offset-4 hover:decoration-current">
                {p.event.name}
              </a>
            ),
          },
          ...extra.map((k) => ({ label: k[0].toUpperCase() + k.slice(1).replace(/_/g, " "), value: String(p[k]) })),
          typeof p.issued_at === "string" && { label: "Issued", value: formatDate(p.issued_at) },
          typeof p.issuer === "string" && { label: "Issuer", value: p.issuer },
          p.subject?.email_sha256 && { label: "Email SHA-256", value: <code className="font-mono text-xs break-all">{p.subject.email_sha256}</code> },
          typeof p.record_id === "string" && { label: "Record ID", value: <code className="font-mono text-xs break-all">{p.record_id}</code> },
          {
            label: "Key ID",
            value: <code className="font-mono text-xs">{o.record?.key_id ?? (typeof o.server === "object" && "key_id" in o.server ? o.server.key_id : "unknown")}</code>,
          },
        ] as (DataListItem | false | "" | undefined)[]).filter((x): x is DataListItem => Boolean(x))}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {cert && (
          <Button href={cert} target="_blank" rel="noreferrer" size="sm" variant="secondary">
            <FileBadge /> Printable certificate
          </Button>
        )}
        <CopyButton value={JSON.stringify({ payload: o.payload, signature: o.signature }, null, 2)} label="Copy record JSON" />
      </div>
    </Card>
  );
}

export function VerifyClient({ initialRecord }: { initialRecord: string }) {
  const [mode, setMode] = useState<Mode>("record");
  const [recordId, setRecordId] = useState(initialRecord);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [run, setRun] = useState(0);

  const verify = useCallback(async (input: { payload: Payload; canonical: string; signature: string; record: SignedRecord | null }) => {
    const base: Outcome = { ...input, browser: "pending", server: "pending" };
    setOutcome(base);
    setRun((n) => n + 1);
    const bytesMatch = canonicalize(input.payload) === input.canonical;
    const browser = (async (): Promise<BrowserCheck> => {
      try {
        const jwk = input.record?.public_jwk ?? (await portalJwk());
        const ok = await verifyInBrowser(input.canonical, input.signature, jwk);
        return ok === "unsupported" ? "unsupported" : { ok, bytesMatch };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "WebCrypto check failed" };
      }
    })();
    const server = api<{ valid: boolean; revoked: boolean; key_id: string }>("/v1/records/verify", {
      method: "POST",
      body: json({ payload: input.payload, signature: input.signature }),
    }).catch((err): ServerCheck => ({ error: err instanceof ApiError ? err.detail : "The API could not be reached." }));
    void browser.then((b) => setOutcome((o) => (o && o.signature === input.signature ? { ...o, browser: b } : o)));
    void server.then((s) => setOutcome((o) => (o && o.signature === input.signature ? { ...o, server: s } : o)));
    await Promise.all([browser, server]);
  }, []);

  const loadRecord = useCallback(
    async (id: string) => {
      const clean = id.trim();
      if (!clean) return;
      setBusy(true);
      setError("");
      const url = new URL(window.location.href);
      url.searchParams.set("record", clean);
      window.history.replaceState(window.history.state, "", url);
      try {
        const rec = await api<SignedRecord>(`/v1/records/${encodeURIComponent(clean)}`);
        await verify({ payload: rec.payload, canonical: rec.canonical, signature: rec.signature, record: rec });
      } catch (err) {
        setOutcome(null);
        setError(err instanceof ApiError && (err.status === 404 || err.status === 422) ? "No record with that ID exists on this portal." : err instanceof ApiError ? err.detail : "Could not load the record.");
      } finally {
        setBusy(false);
      }
    },
    [verify],
  );

  useEffect(() => {
    if (initialRecord) void loadRecord(initialRecord);
  }, [initialRecord, loadRecord]);

  async function verifyPasted() {
    setError("");
    let parsed;
    try {
      parsed = parsePasted(pasted);
    } catch (err) {
      setOutcome(null);
      setError(err instanceof Error ? err.message : "Could not read that JSON.");
      return;
    }
    setBusy(true);
    await verify({ ...parsed, record: null });
    setBusy(false);
  }

  const b = outcome ? browserRow(outcome.browser) : null;
  const s = outcome ? serverRow(outcome.server) : null;
  const settled = b && s && b.state !== "pending" && s.state !== "pending";
  const valid = settled && s.state === "ok" && (b.state === "ok" || b.state === "warn");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card className="p-5 sm:p-6">
          <Tabs tabs={TABS} value={mode} onValueChange={setMode} aria-label="How to verify">
          <TabPanel value={mode}>
            {mode === "record" ? (
              <form
                className="flex flex-col gap-3 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadRecord(recordId);
                }}
              >
                <label htmlFor="record-id" className="sr-only">
                  Record ID
                </label>
                <Input id="record-id" value={recordId} onChange={(e) => setRecordId(e.target.value)} placeholder="Record ID, e.g. 54788a30-717a-…" className="min-w-0 flex-1 font-mono" />
                <Button type="submit" loading={busy} disabled={!recordId.trim()}>
                  Verify
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-3">
                <label htmlFor="record-json" className="text-sm text-muted">
                  Paste a record as JSON with <code className="font-mono text-xs text-fg">payload</code> and <code className="font-mono text-xs text-fg">signature</code>. The canonical bytes are rebuilt here (sorted keys, no whitespace), so any edit breaks the signature.
                </label>
                <Textarea id="record-json" rows={9} value={pasted} onChange={(e) => setPasted(e.target.value)} spellCheck={false} placeholder={'{\n  "payload": { … },\n  "signature": "4651fe6f…"\n}'} className="font-mono text-xs" />
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={verifyPasted} loading={busy} disabled={!pasted.trim()}>
                    Verify JSON
                  </Button>
                  {outcome && (
                    <Button variant="ghost" onClick={() => setPasted(JSON.stringify({ payload: outcome.payload, signature: outcome.signature }, null, 2))}>
                      Use the record above
                    </Button>
                  )}
                  <span className="text-xs text-subtle">Tip: change one number and verify again.</span>
                </div>
              </div>
            )}
          </TabPanel>
          </Tabs>
          {error && (
            <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-coral-11">
              <ShieldAlert className="size-4" aria-hidden /> {error}
            </p>
          )}
        </Card>

        <AnimatePresence mode="wait">
          {outcome && b && s && (
            <motion.section
              key={run}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              aria-live="polite"
              className="flex flex-col gap-4"
            >
              <Card>
              <div className="flex items-center gap-4 p-5 sm:px-6">
                <span className="grid size-12 shrink-0 place-items-center">{!settled ? <Spinner /> : valid ? <AnimatedCheck size={44} label="Valid" /> : <FailMark size={44} />}</span>
                <div>
                  <p className={cn("text-lg font-semibold", settled && (valid ? "text-accent-11" : "text-coral-11"))}>
                    {!settled ? "Verifying…" : valid ? "Authentic record" : "This record does not verify"}
                  </p>
                  <p className="text-sm text-muted">
                    {!settled
                      ? "Running two independent checks."
                      : valid
                        ? b.state === "warn"
                          ? "The API confirmed the signature. Your browser could not check it locally."
                          : "Your browser and the API agree: signed by this portal and unchanged."
                        : "Treat it as forged or altered until the organizer reissues it."}
                  </p>
                </div>
              </div>
              <CheckRow icon={MonitorSmartphone} title="Checked in your browser (WebCrypto)" {...b} />
              <CheckRow icon={Server} title="Checked by this portal's API" {...s} />
              </Card>
              <Decoded o={outcome} />
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted" aria-hidden />
            <h2 className="font-semibold">Why you can trust this</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Every record is signed with the portal&apos;s Ed25519 private key, which never leaves the server. The public key is published at{" "}
            <a href="/.well-known/portal-signing-key.pem" className="font-mono text-xs text-fg underline-offset-2 hover:underline">
              /.well-known/portal-signing-key.pem
            </a>
            . This page checks the signature with your browser&apos;s own crypto, so you do not have to trust this page or the API: save the key and
            the record, and check them with any Ed25519 tool.
          </p>
          <pre tabIndex={0} aria-label="Commands to verify a record offline" className="mt-4 overflow-x-auto rounded-(--radius-3) bg-surface-2 p-3 font-mono text-xs leading-relaxed text-muted">
            {`R=$PORTAL/v1/records/<id>
K=$PORTAL/.well-known/portal-signing-key.pem
curl -so key.pem $K
curl -s $R | jq -j .canonical > msg
curl -s $R | jq -r .signature | xxd -r -p > sig
openssl pkeyutl -verify -pubin -rawin \\
  -inkey key.pem -in msg -sigfile sig`}
          </pre>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Hash className="size-4 text-muted" aria-hidden />
            <h2 className="font-semibold">Privacy</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">Records carry a SHA-256 of the email, never the address. You can check a known email against it without the portal revealing anyone&apos;s inbox.</p>
        </Card>
      </aside>
    </div>
  );
}
