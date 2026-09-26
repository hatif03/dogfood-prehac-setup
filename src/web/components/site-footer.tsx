"use client";

import { usePathname } from "next/navigation";

export function SiteFooter() {
  if (usePathname().startsWith("/widget")) return null; // embeds render without site chrome
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>MIT licensed · self-hosted · runs offline</p>
        <nav aria-label="Footer" className="flex items-center gap-5">
          <a href="/docs" className="hover:text-fg">
            API docs
          </a>
          <a href="/verify" className="hover:text-fg">
            Verify a record
          </a>
        </nav>
      </div>
    </footer>
  );
}
