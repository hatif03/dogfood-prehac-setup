"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/participant/auth-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function VerifyEmailForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const { refresh } = useAuth();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    void (async () => {
      try {
        await api(`/v1/auth/verify-email/${token}`, { method: "POST" });
        await refresh();
        setState("ok");
      } catch {
        setState("error");
      }
    })();
  }, [token, refresh]);

  return (
    <AuthShell eyebrow="Email" title="Confirm your address" description="We use this only to keep community voting fair.">
      <Card className="flex flex-col items-center gap-4 p-6 text-center">
        {state === "loading" && <Spinner label="Confirming" />}
        {state === "ok" && (
          <>
            <p className="text-fg">Your email is confirmed. You can vote in events that require a verified account.</p>
            <Button asChild>
              <Link href="/">Go to your work</Link>
            </Button>
          </>
        )}
        {state === "error" && (
          <>
            <p className="text-muted">This link is invalid or expired. Sign in and request a new confirmation email.</p>
            <Button asChild variant="secondary">
              <Link href="/login">Sign in</Link>
            </Button>
          </>
        )}
      </Card>
    </AuthShell>
  );
}
