"use client";

import { TabNav } from "@radix-ui/themes";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type EventRole = "visitor" | "participant" | "judge" | "organizer" | "admin";

type EventTab = { key: string; label: string; path: string; roles: readonly EventRole[] | "all" };

export const EVENT_TABS: readonly EventTab[] = [
  { key: "gallery", label: "Gallery", path: "", roles: "all" },
  { key: "submit", label: "Submit", path: "/submit", roles: ["visitor", "participant", "organizer", "admin"] },
  { key: "judge", label: "Judge", path: "/judge", roles: ["judge"] },
  { key: "organize", label: "Organize", path: "/organize", roles: ["organizer", "admin"] },
  { key: "vote", label: "Vote", path: "/vote", roles: "all" },
  { key: "results", label: "Results", path: "/results", roles: "all" },
];

/** Section tabs as Radix TabNav: links with aria-current, the active one underlined in accent. */
export function EventNav({ slug, role, className }: { slug: string; role: EventRole; className?: string }) {
  const pathname = usePathname();
  const base = `/events/${slug}`;
  const tabs = EVENT_TABS.filter((t) => t.roles === "all" || t.roles.includes(role));
  const activeKey = tabs.find((t) => t.path && (pathname === base + t.path || pathname.startsWith(`${base + t.path}/`)))?.key ?? "gallery";

  return (
    <TabNav.Root aria-label="Event sections" size="2" className={className}>
      {tabs.map((t) => (
        <TabNav.Link key={t.key} asChild active={t.key === activeKey}>
          <Link href={base + t.path} aria-current={t.key === activeKey ? "page" : undefined}>
            {t.label}
          </Link>
        </TabNav.Link>
      ))}
    </TabNav.Root>
  );
}
