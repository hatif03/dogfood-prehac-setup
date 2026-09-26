import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** What a non-judge sees. The API already said 401/403; this only explains it. */
export function JudgeRefusal({ status, slug, next }: { status: number; slug: string; next: string }) {
  const signedOut = status === 401;
  return (
    <Card className="mx-auto max-w-xl px-6 py-12 text-center sm:px-10">
      <div className="flex flex-col items-center gap-3">
        <div className="grid size-12 place-items-center rounded-full bg-surface-3 text-muted">
          <LockKeyhole className="size-5" aria-hidden />
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-balance text-fg">
          {signedOut ? "Sign in to judge this event." : "This page is for the judges of this event."}
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          {signedOut
            ? "Judges see the projects assigned to them here. Sign in with the account the organizer invited."
            : `Your account is not a judge here, so the API refused to send a queue (HTTP ${status}). Scores are only ever shown to the judge who gave them and to the organizers.`}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {signedOut && <Button href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Button>}
          <Button href={`/events/${slug}`} variant="secondary">
            Back to the gallery
          </Button>
        </div>
      </div>
    </Card>
  );
}
