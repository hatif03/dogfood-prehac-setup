import { Callout } from "@/components/ui/callout";
import { serverApi } from "@/lib/server-api";
import type { Phase, Project } from "@/lib/types";
import { WidgetGallery } from "./widget-gallery";

export type WidgetData = { event: { name: string; slug: string; phase: Phase }; gallery_url: string; projects: Project[] };

export const metadata = { title: "Project gallery", robots: { index: false } };

export default async function WidgetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await serverApi<WidgetData>(`/v1/public/widget/${encodeURIComponent(token)}`).catch(() => null);
  if (!data) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <Callout title="This gallery embed is not available" className="max-w-md">
          The organizer may have made a new embed link. Ask them for the current one.
        </Callout>
      </div>
    );
  }
  return <WidgetGallery data={data} />;
}
