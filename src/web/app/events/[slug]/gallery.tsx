"use client";

import { TextField } from "@radix-ui/themes";
import { Rocket, Search, SearchX, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useEvent } from "@/components/event-context";
import { ProjectCard } from "@/components/public/project-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import type { Project } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type GalleryProps = { projects: Project[]; initialQuery: string; initialTrack: string; initialTag: string };

/** Cards rendered per step. The API returns every project at once; rendering 2 000 cards would stall phones. */
const PAGE = 60;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap transition-colors duration-150",
        active ? "bg-fg font-medium text-bg" : "bg-tint text-muted hover:bg-tint-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

const haystack = (p: Project) => [p.title, p.summary, p.team.name, p.track?.name ?? "", ...p.tech_tags].join(" ").toLowerCase();

export function Gallery({ projects, initialQuery, initialTrack, initialTag }: GalleryProps) {
  const { event } = useEvent();
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [track, setTrack] = useState(initialTrack);
  const [tag, setTag] = useState(initialTag);
  const [limit, setLimit] = useState(PAGE);
  const search = useDeferredValue(debounced);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  // A new filter starts from the top of the list again.
  useEffect(() => setLimit(PAGE), [search, track, tag]);

  // Keep ?q= / ?track= / ?tag= shareable without a server round trip.
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [k, v] of [["q", debounced.trim()], ["track", track], ["tag", tag]] as const) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [debounced, track, tag]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const index = useMemo(() => projects.map((p) => ({ p, text: haystack(p) })), [projects]);
  const trackCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of projects) if (p.track) m.set(p.track.slug, (m.get(p.track.slug) ?? 0) + 1);
    return m;
  }, [projects]);

  const terms = useMemo(() => search.toLowerCase().split(/\s+/).filter(Boolean), [search]);
  const visible = useMemo(
    () => index.filter(({ p, text }) => (!track || p.track?.slug === track) && (!tag || p.tech_tags.includes(tag)) && terms.every((t) => text.includes(t))).map(({ p }) => p),
    [index, track, tag, terms],
  );
  const filtered = Boolean(terms.length || track || tag);
  const shown = visible.slice(0, limit);

  function clear() {
    setQuery("");
    setDebounced("");
    setTrack("");
    setTag("");
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={Rocket}
        title="No projects yet"
        description={
          event.submissions_open
            ? `Submissions are open${event.submissions_deadline ? ` until ${formatDate(event.submissions_deadline)}` : ""}. Projects appear here as soon as a team submits.`
            : "Submitted projects will show up here."
        }
        className="py-16"
      />
    );
  }

  const trackName = event.tracks.find((t) => t.slug === track)?.name;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              setDebounced("");
            }
          }}
          placeholder="Search projects, teams or tags"
          aria-label="Search projects"
          className="w-full sm:max-w-md [&_input::-webkit-search-cancel-button]:hidden"
        >
          <TextField.Slot>
            <Search className="size-4" aria-hidden />
          </TextField.Slot>
          <TextField.Slot>
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setDebounced("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="grid size-7 cursor-pointer place-items-center rounded-(--radius-2) text-muted hover:bg-tint-strong hover:text-fg"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : (
              <Kbd className="hidden sm:inline-flex" title="Press / to search">
                /
              </Kbd>
            )}
          </TextField.Slot>
        </Input>

        {event.tracks.length > 1 && (
          <div role="group" aria-label="Filter by track" className="flex flex-wrap gap-2">
            <Chip active={!track} onClick={() => setTrack("")}>
              All tracks <span className="tabular-nums opacity-60">{projects.length}</span>
            </Chip>
            {event.tracks.map((t) => (
              <Chip key={t.id} active={track === t.slug} onClick={() => setTrack(track === t.slug ? "" : t.slug)}>
                {t.name} <span className="tabular-nums opacity-60">{trackCounts.get(t.slug) ?? 0}</span>
              </Chip>
            ))}
          </div>
        )}

        <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <p aria-live="polite">
            <span className="font-medium text-fg tabular-nums">{visible.length}</span>
            {filtered ? ` of ${projects.length}` : ""} project{visible.length === 1 && !filtered ? "" : "s"}
            {trackName && ` in ${trackName}`}
            {tag && (
              <>
                {" "}
                tagged <span className="font-mono text-fg">#{tag}</span>
              </>
            )}
            {terms.length > 0 && ` matching “${search.trim()}”`}
          </p>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={clear}>
              <X /> Clear filters
            </Button>
          )}
          <span className="hidden text-subtle sm:ml-auto sm:inline">Projects flagged as duplicates are left out.</span>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nothing matches"
          description={terms.length ? `No project mentions “${search.trim()}”${trackName ? ` in ${trackName}` : ""}.` : "No projects in this filter yet."}
          action={
            <Button variant="secondary" onClick={clear}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((p, i) => (
              <li key={p.id} className="animate-page-in" style={{ animationDelay: i < 12 ? `${i * 25}ms` : undefined }}>
                <ProjectCard project={p} href={`/events/${event.slug}/projects/${p.id}`} />
              </li>
            ))}
          </ul>
          {visible.length > shown.length && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>
                Show {Math.min(PAGE, visible.length - shown.length)} more
              </Button>
              <p className="text-sm text-subtle tabular-nums">
                Showing {shown.length} of {visible.length}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
