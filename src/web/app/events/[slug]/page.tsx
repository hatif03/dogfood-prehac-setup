import { serverApi } from "@/lib/server-api";
import type { Project } from "@/lib/types";
import { EventIntro } from "./event-intro";
import { Gallery } from "./gallery";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; track?: string; tag?: string }> };

export default async function GalleryPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const projects = (await serverApi<Project[]>(`/v1/events/${slug}/projects`)) ?? [];
  return (
    <>
      <EventIntro />
      <Gallery projects={projects} initialQuery={sp.q ?? ""} initialTrack={sp.track ?? ""} initialTag={sp.tag ?? ""} />
    </>
  );
}
