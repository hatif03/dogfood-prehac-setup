import { PageHeader } from "@/components/ui/page-header";
import { VerifyClient } from "./verify-client";

export const metadata = {
  title: "Verify a record",
  description: "Check an Ed25519-signed judge, winner or participant record in your own browser.",
};

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const { record = "" } = await searchParams;
  return (
    <div className="relative isolate">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <PageHeader
          eyebrow="Signed records"
          title="Verify a record"
          description="Judge, winner and participant records are signed by this portal. Check one here: your browser verifies the signature itself, and the API gives a second opinion."
        />
        <VerifyClient initialRecord={record} />
      </div>
    </div>
  );
}
