"use client";

import { TextField } from "@radix-ui/themes";
import { ArrowUpRight, Search } from "lucide-react";
import { useState } from "react";
import { LogoMark } from "@/components/logo";
import { PHASE } from "@/components/public/phase";
import { ProjectCard } from "@/components/public/project-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { WidgetData } from "./page";

const PAGE = 60;

/** Compact gallery for iframes (see /embed.js). No site chrome; links open the portal in a new tab. */
export function WidgetGallery({ data }: { data: WidgetData }) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const phase = PHASE[data.event.phase];
  const base = `/events/${data.event.slug}`;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = data.projects.filter((p) => {
    const text = `${p.title} ${p.summary} ${p.team.name} ${p.track?.name ?? ""} ${p.tech_tags.join(" ")}`.toLowerCase();
    return terms.every((t) => text.includes(t));
  });

  return (
    <div className="flex min-h-dvh flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-sm font-semibold tracking-tight">{data.event.name}</h1>
          <Badge tone={phase.tone} dot className="hidden min-[420px]:inline-flex">
            {phase.label}
          </Badge>
        </div>
        <Input
          size="2"
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
          placeholder={`Search ${data.projects.length} projects`}
          aria-label="Search projects"
          className="w-full min-[520px]:w-56"
        >
          <TextField.Slot>
            <Search className="size-3.5" aria-hidden />
          </TextField.Slot>
        </Input>
      </header>

      {visible.length === 0 ? (
        <p className="grid flex-1 place-items-center rounded-(--radius-4) border border-dashed border-line-strong py-10 text-sm text-muted" aria-live="polite">
          {data.projects.length ? "No project matches that search." : "No projects submitted yet."}
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {visible.slice(0, limit).map((p, i) => (
            <li key={p.id} className="animate-page-in" style={{ animationDelay: i < 10 ? `${i * 25}ms` : undefined }}>
              <ProjectCard project={p} href={`${base}/projects/${p.id}`} compact />
            </li>
          ))}
        </ul>
      )}
      {visible.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="mx-auto cursor-pointer rounded-(--radius-3) bg-tint px-3 py-1.5 text-xs font-medium text-fg hover:bg-tint-strong">
          Show more ({visible.length - limit} left)
        </button>
      )}

      <footer className="mt-auto flex items-center justify-between gap-3 pt-1 text-xs text-muted">
        <a href={base} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium transition-colors hover:text-fg">
          Open the full gallery <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
        <span className="inline-flex items-center gap-1.5 text-subtle">
          <LogoMark className="size-4" /> Portal · self-hosted
        </span>
      </footer>
    </div>
  );
}
