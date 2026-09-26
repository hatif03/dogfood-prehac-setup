"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="grid size-14 place-items-center rounded-2xl border border-coral/30 bg-coral/10 text-coral-11">
          <TriangleAlert className="size-6" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-muted">{error.message || "An unexpected error occurred while rendering this page."}</p>
        {error.digest && <p className="font-mono text-xs text-subtle">ref {error.digest}</p>}
        <div className="mt-2 flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button href="/" variant="secondary">
            Home
          </Button>
        </div>
      </div>
    </div>
  );
}
