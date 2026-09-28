import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { VerifyEmailForm } from "./verify-email-form";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="grid min-h-[40vh] place-items-center"><Spinner label="Loading" /></div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
