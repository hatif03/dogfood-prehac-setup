"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MARQUEE = "Runs offline · MIT licensed · Self-hosted · Built for Dogfood 2026 · ";

function MarqueeBand() {
  return (
    <div className="border-t border-line bg-surface py-2.5 overflow-hidden" aria-hidden>
      <div className="flex w-max marquee motion-reduce:animate-none">
        <span className="px-4 font-mono text-xs tracking-wide text-subtle whitespace-nowrap">{MARQUEE.repeat(4)}</span>
        <span className="px-4 font-mono text-xs tracking-wide text-subtle whitespace-nowrap">{MARQUEE.repeat(4)}</span>
      </div>
    </div>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/widget")) return null;

  const task =
    pathname.includes("/judge") ||
    pathname.includes("/submit") ||
    pathname.includes("/vote") ||
    pathname.includes("/organize");

  return (
    <footer className="mt-auto border-t border-line">
      {!task && <MarqueeBand />}
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          MIT licensed · self-hosted · runs offline ·{" "}
          <Link href="https://www.raptors.dev/" className="underline-offset-4 hover:text-fg hover:underline" target="_blank" rel="noreferrer">
            inspired by Hackathon Raptors
          </Link>
        </p>
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
