import { safeNext } from "@/components/participant/auth-shell";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <RegisterForm next={safeNext(next)} />;
}
