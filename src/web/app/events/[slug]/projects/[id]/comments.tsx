"use client";

import { Eye, EyeOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EASE } from "@/components/amicro/presets";
import { useEvent } from "@/components/event-context";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, json } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Comment } from "@/lib/types";
import { cn, formatDate, relativeTime } from "@/lib/utils";

const MAX = 2000;

export function Comments({ slug, projectId }: { slug: string; projectId: string }) {
  const { event } = useEvent();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const pathname = usePathname();
  const organizer = event.viewer.role === "organizer" || event.viewer.role === "admin";
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const base = `/v1/events/${slug}`;

  const load = useCallback(async () => {
    try {
      setComments(await api<Comment[]>(`${base}/projects/${projectId}/comments`));
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not load comments");
    }
  }, [base, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(e?: React.FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const c = await api<Comment>(`${base}/projects/${projectId}/comments`, { method: "POST", body: json({ body: text }) });
      setComments((cur) => [...(cur ?? []), c]);
      setBody("");
      toast.success("Comment posted");
    } catch (err) {
      toast.error("Could not post the comment", err instanceof ApiError ? err.detail : "Could not reach the server");
    } finally {
      setPosting(false);
    }
  }

  async function toggle(c: Comment) {
    try {
      const next = await api<Comment>(`${base}/comments/${c.id}/hide?hidden=${!c.hidden}`, { method: "POST" });
      setComments((cur) => cur?.map((x) => (x.id === c.id ? { ...x, ...next } : x)) ?? cur);
      toast.success(next.hidden ? "Comment hidden" : "Comment restored", next.hidden ? "Visitors no longer see it. The audit log records who hid it." : "Visitors can see it again.");
    } catch (err) {
      toast.error("Could not update the comment", err instanceof ApiError ? err.detail : undefined);
    }
  }

  const visibleCount = comments?.filter((c) => !c.hidden).length ?? 0;

  return (
    <section aria-labelledby="comments-heading" className="flex flex-col gap-4">
      <h2 id="comments-heading" className="flex items-baseline gap-2 text-lg font-semibold tracking-tight">
        Comments
        {comments && <span className="text-sm font-normal text-muted tabular-nums">{visibleCount}</span>}
      </h2>

      {authLoading ? (
        <Skeleton className="h-32" />
      ) : user ? (
        <form onSubmit={post} className="flex flex-col gap-2">
          <Field label="Add a comment" hint={`Posting as ${user.display_name}. Organizers can hide comments.`}>
            <Textarea
              rows={3}
              maxLength={MAX}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void post();
              }}
              placeholder="Ask the team something, or say what you liked"
            />
          </Field>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-subtle sm:inline">
              <Kbd size="1">Ctrl</Kbd> <Kbd size="1">Enter</Kbd> posts
            </span>
            {body.length > MAX - 200 && <span className="ml-auto text-xs text-amber-11 tabular-nums">{MAX - body.length} characters left</span>}
            <Button type="submit" size="sm" variant="secondary" loading={posting} disabled={!body.trim()} className="ml-auto">
              Post comment
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-4) bg-surface px-4 py-3">
          <p className="text-sm text-muted">Sign in to ask the team a question or leave feedback.</p>
          <Button href={`/login?next=${encodeURIComponent(pathname)}`} size="sm" variant="secondary">
            Sign in to comment
          </Button>
        </div>
      )}

      {error ? (
        <Callout tone="error" title="Comments could not load" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Try again</Button>}>
          {error}
        </Callout>
      ) : comments === null ? (
        <div className="flex flex-col gap-3" aria-busy>
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted">No comments yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line border-y border-line" aria-live="polite">
          <AnimatePresence initial={false}>
            {comments.map((c) => (
              <motion.li
                key={c.id}
                layout="position"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="flex gap-3 py-4"
              >
                <Avatar name={c.author} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-fg">{c.author}</span>
                    <time dateTime={c.created_at} title={formatDate(c.created_at)} className="text-xs text-muted">
                      {relativeTime(c.created_at)}
                    </time>
                    {c.hidden && <Badge tone="amber">Hidden from visitors</Badge>}
                    {organizer && (
                      <span className="ml-auto">
                        <AlertDialog
                          title={c.hidden ? "Restore this comment?" : "Hide this comment?"}
                          description={
                            c.hidden
                              ? "Visitors will see it again. The audit log records the change."
                              : "Visitors stop seeing it; organizers still can, and it can be restored. The audit log records who hid it."
                          }
                          confirmLabel={c.hidden ? "Restore" : "Hide comment"}
                          danger={!c.hidden}
                          onConfirm={() => toggle(c)}
                          trigger={
                            <Button size="sm" variant="ghost" aria-label={c.hidden ? `Restore comment by ${c.author}` : `Hide comment by ${c.author}`}>
                              {c.hidden ? <Eye /> : <EyeOff />} {c.hidden ? "Restore" : "Hide"}
                            </Button>
                          }
                        />
                      </span>
                    )}
                  </div>
                  <p className={cn("mt-1 text-sm leading-relaxed break-words whitespace-pre-line", c.hidden ? "text-muted" : "text-fg")}>{c.body}</p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
