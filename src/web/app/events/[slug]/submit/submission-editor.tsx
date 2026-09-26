"use client";

import { ArrowUpRight, ImagePlus, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EASE } from "@/components/amicro/presets";
import { useEvent } from "@/components/event-context";
import { fireConfetti } from "@/components/magic/confetti";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { AnimatedCheck } from "@/components/ui/animated-check";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, json } from "@/lib/api";
import type { Submission, Team } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { TagInput } from "./tag-input";

type Draft = {
  title: string;
  summary: string;
  description: string;
  track_id: string;
  repo_url: string;
  live_link: string;
  demo_video_url: string;
  tech_tags: string[];
};
type FieldKey = keyof Draft | "track";
type SaveState = { status: "idle" | "saving" | "saved" | "error"; at?: number; message?: string };

const toDraft = (s: Submission | null): Draft => ({
  title: s?.title ?? "",
  summary: s?.summary ?? "",
  description: s?.description ?? "",
  track_id: s?.track_id ?? "",
  repo_url: s?.repo_url ?? "",
  live_link: s?.live_link ?? "",
  demo_video_url: s?.demo_video_url ?? "",
  tech_tags: s?.tech_tags ?? [],
});

const ago = (t: string | number) => (Math.abs(Date.now() - new Date(t).getTime()) < 10_000 ? "just now" : relativeTime(t));

/** Pydantic 422 bodies carry `loc: ["body", "<field>"]`; map them onto the form. */
function fieldErrors(err: ApiError): Record<string, string> {
  const detail = (err.body as { detail?: unknown } | null)?.detail;
  if (!Array.isArray(detail)) return {};
  const out: Record<string, string> = {};
  for (const d of detail as { loc?: (string | number)[]; msg?: string }[]) {
    const key = d.loc?.[d.loc.length - 1];
    if (typeof key === "string") out[key] = (d.msg ?? "Invalid").replace(/^Value error, /, "");
  }
  return out;
}

/** A labelled block of the form: heading and one line of guidance on the left from md up, fields on the right. */
function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  const id = `section-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="grid gap-4 border-t border-line py-7 first-of-type:border-t-0 first-of-type:pt-0 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8">
      <div>
        <h2 id={id} className="font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{hint}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  );
}

export function SubmissionEditor({ team }: { team: Team }) {
  const { event, refresh } = useEvent();
  const toast = useToast();
  const locked = !event.submissions_open;
  const base = `/v1/events/${event.slug}`;

  const [sub, setSub] = useState<Submission | null>(team.submission);
  const [draft, setDraft] = useState<Draft>(() => toDraft(team.submission));
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [save, setSave] = useState<SaveState>(
    team.submission?.updated_at ? { status: "saved", at: new Date(team.submission.updated_at).getTime() } : { status: "idle" },
  );
  const [busy, setBusy] = useState<"submit" | "unsubmit" | "upload" | null>(null);
  const [celebrate, setCelebrate] = useState<{ warnings: string[] } | null>(null);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirty = useRef(false);
  const queue = useRef<Promise<Submission | null>>(Promise.resolve(null));

  const fail = useCallback(
    (err: unknown, title: string) => {
      if (err instanceof ApiError && err.status === 422) {
        const map = fieldErrors(err);
        if (Object.keys(map).length) {
          setErrors(map);
          setSave({ status: "error", message: "Not saved: fix the highlighted fields" });
          return;
        }
      }
      const detail = err instanceof ApiError ? err.detail : "Could not reach the server";
      setSave({ status: "error", message: "Not saved" });
      toast.error(title, detail);
      if (err instanceof ApiError && err.status === 403) void refresh(); // deadline passed: lock the form
    },
    [refresh, toast],
  );

  /** Saves are serialized so an older request can never land after a newer one. */
  const persist = useCallback((): Promise<Submission | null> => {
    const run = queue.current.then(async () => {
      const body = draftRef.current;
      setSave({ status: "saving" });
      try {
        const saved = await api<Submission>(`${base}/projects`, {
          method: "POST",
          body: json({ ...body, track_id: body.track_id || null }),
        });
        if (draftRef.current === body) dirty.current = false;
        setSub(saved);
        setErrors({});
        setSave({ status: "saved", at: Date.now() });
        return saved;
      } catch (err) {
        fail(err, "Draft not saved");
        return null;
      }
    });
    queue.current = run;
    return run;
  }, [base, fail]);

  useEffect(() => {
    if (!dirty.current || locked) return;
    const t = setTimeout(() => dirty.current && void persist(), 1200);
    return () => clearTimeout(t);
  }, [draft, locked, persist]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    dirty.current = true;
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, ...(key === "track_id" ? { track: undefined } : {}) }));
  }

  async function submit() {
    const missing: Partial<Record<FieldKey, string>> = {};
    if (!draft.title.trim()) missing.title = "A title is required to submit.";
    if (!draft.summary.trim()) missing.summary = "A one-line summary is required to submit.";
    if (event.tracks.length && !draft.track_id) missing.track_id = "Pick a track to submit.";
    if (Object.keys(missing).length) {
      setErrors(missing);
      toast.error("Almost there", "Fill in the highlighted fields before submitting.");
      return;
    }
    setBusy("submit");
    const current = dirty.current || !sub ? await persist() : sub;
    if (!current) return setBusy(null);
    try {
      const done = await api<Submission>(`${base}/projects/${current.id}/submit`, { method: "POST" });
      setSub(done);
      setCelebrate({ warnings: done.warnings ?? [] });
      void fireConfetti("sides");
      toast.success("Project submitted", "It is live in the public gallery.");
    } catch (err) {
      fail(err, "Could not submit");
    } finally {
      setBusy(null);
    }
  }

  async function unsubmit() {
    if (!sub) return;
    setBusy("unsubmit");
    try {
      setSub(await api<Submission>(`${base}/projects/${sub.id}/unsubmit`, { method: "POST" }));
      setCelebrate(null);
      toast.info("Back to draft", "The project is hidden from the gallery until you submit again.");
    } catch (err) {
      fail(err, "Could not move back to draft");
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setBusy("upload");
    try {
      const current = sub ?? (await persist());
      if (!current) return;
      const form = new FormData();
      form.append("file", file);
      const res = await api<{ id: string; url: string }>(`${base}/projects/${current.id}/images`, { method: "POST", body: form });
      setSub((s) => (s ? { ...s, images: [...s.images, res.url] } : s));
      toast.success("Screenshot added");
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) toast.error("Image storage is offline", "Start MinIO (docker compose up) and try again. Your draft is safe.");
      else toast.error("Upload failed", err instanceof ApiError ? err.detail : undefined);
    } finally {
      setBusy(null);
    }
  }

  const submitted = sub?.status === "submitted";
  const projectHref = sub ? `/events/${event.slug}/projects/${sub.id}` : null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AnimatePresence>
        {celebrate && submitted && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }} role="status">
            <Callout
              tone="success"
              title={`Submitted. ${sub?.title} is in the gallery.`}
              action={
                projectHref && (
                  <Button href={projectHref} size="sm" variant="secondary">
                    View the project page <ArrowUpRight />
                  </Button>
                )
              }
            >
              You can keep editing until the deadline. Saved changes go live straight away.
            </Callout>
          </motion.div>
        )}
      </AnimatePresence>

      {celebrate && celebrate.warnings.length > 0 && (
        <Callout tone="warning" title="This looks like a possible duplicate">
          {celebrate.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <p className="mt-1 text-muted">Organizers see this flag. If it is a mistake, tell them; if your team submitted twice, keep one.</p>
        </Callout>
      )}

      <fieldset disabled={locked} className="min-w-0">
        <legend className="sr-only">Project details</legend>
        <Section title="Basics" hint="What judges and visitors read first.">
          <Field label="Project title" required error={errors.title}>
            <Input value={draft.title} onChange={(e) => update("title", e.target.value)} maxLength={200} placeholder="What is it called?" />
          </Field>
          <Field
            label="One-line summary"
            required
            error={errors.summary}
            hint={draft.summary.length > 400 ? `${500 - draft.summary.length} characters left` : "One sentence: what it does and for whom."}
          >
            <Input value={draft.summary} onChange={(e) => update("summary", e.target.value)} maxLength={500} placeholder="A pocket flood forecast for coastal towns" />
          </Field>
          {event.tracks.length > 0 && (
            <Field label="Track" required error={errors.track_id ?? errors.track} hint="Judges are assigned by track.">
              <Select value={draft.track_id} onChange={(e) => update("track_id", e.target.value)}>
                <option value="">Choose a track</option>
                {event.tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </Section>

        <Section title="Links" hint="Judges open these to try the project. All optional.">
          <Field label="Source code" error={errors.repo_url}>
            <Input type="url" value={draft.repo_url} onChange={(e) => update("repo_url", e.target.value)} placeholder="https://github.com/…" />
          </Field>
          <Field label="Live app" error={errors.live_link}>
            <Input type="url" value={draft.live_link} onChange={(e) => update("live_link", e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Demo video" error={errors.demo_video_url}>
            <Input type="url" value={draft.demo_video_url} onChange={(e) => update("demo_video_url", e.target.value)} placeholder="https://…" />
          </Field>
        </Section>

        <Section title="Details" hint="The longer story, shown on the project page.">
          <Field label="Description" error={errors.description} hint="What it does, how you built it, what is next. Blank lines start new paragraphs.">
            <Textarea value={draft.description} onChange={(e) => update("description", e.target.value)} rows={8} maxLength={20000} />
          </Field>
          <Field label="Tech tags" hint="Enter or comma adds a tag. Backspace removes the last one." error={errors.tech_tags}>
            <TagInput value={draft.tech_tags} onChange={(tags) => update("tech_tags", tags)} disabled={locked} />
          </Field>
        </Section>

        <Section title="Screenshots" hint="The first one becomes the card image in the gallery.">
          <div className="flex flex-wrap gap-3">
            {sub?.images.map((src, i) => (
              <a key={src} href={src} target="_blank" rel="noreferrer" className="block h-24 w-36 overflow-hidden rounded-(--radius-3) border border-line bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from object storage */}
                <img src={src} alt={`Screenshot ${i + 1}`} className="size-full object-cover" />
              </a>
            ))}
            {!locked && (
              <label
                className={cn(
                  "grid h-24 w-36 cursor-pointer place-items-center rounded-(--radius-3) border border-dashed border-line-strong text-muted transition-colors hover:bg-tint hover:text-fg focus-within:outline-2 focus-within:outline-(--focus-8)",
                  busy === "upload" && "pointer-events-none",
                )}
              >
                <span className="flex flex-col items-center gap-1 text-sm">
                  {busy === "upload" ? <Spinner label="Uploading" /> : <ImagePlus className="size-5" aria-hidden />}
                  {busy === "upload" ? "Uploading" : "Add image"}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void upload(f);
                  }}
                />
              </label>
            )}
          </div>
          <p className="-mt-2 text-sm text-muted">PNG, JPEG, WebP or GIF, up to 5 MB each. Stored on this portal, not a third-party service.</p>
        </Section>
      </fieldset>

      {!locked && (
        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-(--radius-4) bg-(--color-panel-solid) px-4 py-3 shadow-(--shadow-4)">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {submitted ? (
              <Badge tone="accent" dot>
                Submitted
              </Badge>
            ) : (
              <Badge tone="amber" dot>
                Draft
              </Badge>
            )}
            <SaveIndicator state={save} submitted={submitted} />
          </div>
          {submitted ? (
            <AlertDialog
              title="Move back to draft?"
              description="The project leaves the public gallery until you submit it again. Your edits are kept."
              confirmLabel="Move to draft"
              onConfirm={unsubmit}
              trigger={
                <Button variant="secondary" loading={busy === "unsubmit"} disabled={busy !== null}>
                  <Undo2 /> Move back to draft
                </Button>
              }
            />
          ) : (
            <Button onClick={submit} loading={busy === "submit"} disabled={busy !== null} className="shrink-0">
              Submit project
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ state, submitted }: { state: SaveState; submitted: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <span aria-live="polite" className="flex min-w-0 items-center gap-1.5 text-sm text-muted [&>svg]:shrink-0">
      {state.status === "saving" && (
        <>
          <Spinner label="Saving" /> Saving…
        </>
      )}
      {state.status === "saved" && state.at && (
        <>
          <AnimatedCheck key={state.at} size={16} /> Saved {ago(state.at)}
        </>
      )}
      {state.status === "error" && <span className="text-coral-11">{state.message}</span>}
      {state.status === "idle" && (submitted ? "Changes go live when saved" : "Saves automatically as you type")}
    </span>
  );
}
