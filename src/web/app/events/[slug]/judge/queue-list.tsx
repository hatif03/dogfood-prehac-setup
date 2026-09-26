"use client";

import { Check, Circle, CircleDashed } from "lucide-react";
import { useEffect, useRef } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { QueueItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export type QueueFilter = "all" | "todo" | "done";
export type ItemStatus = "done" | "draft" | "todo";

export const statusOf = (item: QueueItem): ItemStatus => (item.score?.submitted ? "done" : item.score ? "draft" : "todo");

export function matchesFilter(item: QueueItem, filter: QueueFilter) {
  return filter === "all" || (filter === "done") === (statusOf(item) === "done");
}

export const STATUS_LABEL: Record<ItemStatus, string> = { done: "Submitted", draft: "Draft", todo: "To do" };

/** Icon for a review's state. Always shown next to its text label, so colour is never the only signal. */
export function StatusIcon({ status, className }: { status: ItemStatus; className?: string }) {
  if (status === "done")
    return (
      <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full bg-accent text-accent-fg", className)}>
        <Check className="size-2.5" strokeWidth={3.5} />
      </span>
    );
  const Icon = status === "draft" ? CircleDashed : Circle;
  return <Icon aria-hidden className={cn("size-4 shrink-0", status === "draft" ? "text-amber-11" : "text-subtle", className)} />;
}

const Count = ({ label, n }: { label: string; n: number }) => (
  <span className="whitespace-nowrap">
    {label} <span className="text-muted tabular-nums">{n}</span>
  </span>
);

type QueueListProps = {
  items: QueueItem[];
  currentId: string | null;
  filter: QueueFilter;
  onFilter: (f: QueueFilter) => void;
  onSelect: (item: QueueItem) => void;
};

export function QueueList({ items, currentId, filter, onFilter, onSelect }: QueueListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const done = items.filter((i) => statusOf(i) === "done").length;
  const visible = items.filter((i) => matchesFilter(i, filter));

  // Keep the current row visible inside the scrolling list without scrolling the page.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-assignment="${currentId}"]`);
    if (!list || !row) return;
    const top = row.offsetTop; // the list is `relative`, so this is already list-relative
    if (top < list.scrollTop) list.scrollTop = top - 8;
    else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + row.offsetHeight - list.clientHeight + 8;
  }, [currentId, filter]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <SegmentedControl
        aria-label="Show"
        value={filter}
        onValueChange={onFilter}
        className="w-full"
        items={[
          { value: "all", label: <Count label="All" n={items.length} /> },
          { value: "todo", label: <Count label="To do" n={items.length - done} /> },
          { value: "done", label: <Count label="Done" n={done} /> },
        ]}
      />
      <ul ref={listRef} className="relative -mx-1 flex max-h-80 flex-col gap-0.5 overflow-y-auto px-1 py-0.5 lg:max-h-[calc(100dvh-24rem)]">
        {visible.map((item) => {
          const status = statusOf(item);
          const active = item.assignment_id === currentId;
          return (
            <li key={item.assignment_id}>
              <button
                type="button"
                data-assignment={item.assignment_id}
                onClick={() => onSelect(item)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-start gap-3 rounded-(--radius-3) px-2.5 py-2 text-left transition-colors",
                  active ? "bg-tint-strong text-fg" : "text-muted hover:bg-tint hover:text-fg",
                )}
              >
                <StatusIcon status={status} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", active ? "font-semibold" : "font-medium")}>{item.project.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {STATUS_LABEL[status]}
                    {item.project.track ? ` · ${item.project.track}` : ""}
                  </span>
                </span>
                {item.score?.weighted != null && (
                  <span className="mt-0.5 font-mono text-xs text-muted tabular-nums" title="Your weighted total">
                    {item.score.weighted.toFixed(2)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="rounded-(--radius-3) border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
            {filter === "todo" ? "Nothing left to score." : "Nothing submitted yet."}
          </li>
        )}
      </ul>
    </div>
  );
}
