"use client";

import { ChevronRight, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/participant/auth-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoAccount, type DemoRole } from "@/lib/demo";

const ROLE_TONE: Record<DemoRole, BadgeTone> = { organizer: "neutral", admin: "amber", judge: "cyan", participant: "violet" };

/** Where each demo persona is most useful. Both judges score the fixture event. */
function landingFor(account: DemoAccount): string {
  if (account.role === "organizer") return "/events/sample-hack-2026/organize";
  if (account.role === "judge") return "/events/sample-hack-2026/judge";
  if (account.role === "participant") return "/events/playground/submit";
  return "/";
}

function DemoAccounts({ pending, onPick }: { pending: string | null; onPick: (account: DemoAccount) => void }) {
  return (
    <section aria-labelledby="demo-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="demo-heading" className="font-semibold">
          Demo accounts
        </h2>
        <p className="mt-1 text-sm text-muted">
          One click signs you in. Seeded accounts use the password <code className="font-mono text-fg">{DEMO_PASSWORD}</code>; production
          deployments should disable demo sessions.
        </p>
      </div>
      <Card>
        <ul className="divide-y divide-line">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => onPick(account)}
                aria-label={`Sign in as ${account.label} (${account.email})`}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-tint focus-visible:-outline-offset-2 disabled:cursor-wait"
              >
                <Avatar name={account.email} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 font-medium text-fg">
                    {account.label}
                    <Badge tone={ROLE_TONE[account.role]}>{account.role}</Badge>
                  </span>
                  <span className="truncate text-sm text-muted">{account.blurb}</span>
                </span>
                {pending === account.email ? <Spinner /> : <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null); // "form" or a demo email

  async function signIn(address: string, pw: string, key: string, destination: string) {
    setPending(key);
    setError(null);
    try {
      const user = await login(address, pw);
      toast.success(`Signed in as ${user?.display_name ?? address}`);
      router.push(destination);
      router.refresh(); // server layouts re-read the session cookie
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not reach the server";
      setError(msg);
      toast.error("Sign in failed", msg);
      setPending(null);
    }
  }

  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <AuthShell
      eyebrow="Sign in"
      title="Welcome back"
      description="Sign in to submit a project, score your queue, or run an event."
      aside={<DemoAccounts pending={pending} onPick={(a) => signIn(a.email, DEMO_PASSWORD, a.email, next ?? landingFor(a))} />}
    >
      <Card asChild className="flex flex-col gap-4 p-5 sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn(email.trim(), password, "form", next ?? "/");
          }}
        >
          <Field label="Email" required>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Field label="Password" required error={error ?? undefined}>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Button type="submit" size="lg" loading={pending === "form"} disabled={pending !== null && pending !== "form"}>
            <KeyRound /> Sign in
          </Button>
          <p className="text-center text-sm text-muted">
            New here?{" "}
            <Link href={registerHref} className="font-medium text-fg underline underline-offset-4 hover:text-accent-11">
              Create an account
            </Link>
          </p>
        </form>
      </Card>
    </AuthShell>
  );
}
