import { VoteClient } from "./vote-client";

export const metadata = { title: "Community vote" };

export default async function VotePage({ searchParams }: { searchParams: Promise<{ ballot?: string }> }) {
  const { ballot } = await searchParams;
  return <VoteClient urlToken={ballot ?? null} />;
}
