"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/participant/auth-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, json } from "@/lib/api";
import { useAuth, type User } from "@/lib/auth";

export function RegisterForm({ next }: { next: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useAuth();
  const [form, setForm] = useState({ display_name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tooShort = form.password.length > 0 && form.password.length < 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) return setError("Use at least 8 characters.");
    setBusy(true);
    setError(null);
    try {
      const user = await api<User>("/v1/auth/register", {
        method: "POST",
        body: json({ ...form, email: form.email.trim(), display_name: form.display_name.trim() }),
      });
      await refresh();
      const verified = (user as User & { email_verified?: boolean }).email_verified;
      toast.success(
        `Welcome, ${user.display_name}`,
        verified ? "Your account is ready." : "Check your inbox for a confirmation link before voting in verified events.",
      );
      router.push(next ?? "/");
      router.refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not reach the server";
      setError(msg);
      toast.error("Could not create the account", msg);
      setBusy(false);
    }
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <AuthShell
      eyebrow="Create account"
      title="Join the portal"
      description="One account for submitting, judging and voting. Passwords are hashed with Argon2 and never leave this server."
    >
      <Card asChild className="flex flex-col gap-4 p-5 sm:p-6">
      <form onSubmit={submit}>
        <Field label="Display name" hint="Shown to your team and on the project page." required>
          <Input autoComplete="name" value={form.display_name} onChange={set("display_name")} required maxLength={200} autoFocus />
        </Field>
        <Field label="Email" required>
          <Input type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
        </Field>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value="" readOnly />
        <Field label="Password" hint="At least 8 characters." error={tooShort ? "At least 8 characters." : (error ?? undefined)} required>
          <Input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} required minLength={8} />
        </Field>
        <Button type="submit" size="lg" loading={busy}>
          <UserPlus /> Create account
        </Button>
        <p className="text-center text-sm text-muted">
          Already have one?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-fg underline underline-offset-4 hover:text-accent-11">
            Sign in
          </Link>
        </p>
      </form>
      </Card>
    </AuthShell>
  );
}
