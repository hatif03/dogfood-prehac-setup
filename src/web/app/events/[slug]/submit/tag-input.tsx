"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { useFieldControl } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type TagInputProps = { value: string[]; onChange: (tags: string[]) => void; max?: number; disabled?: boolean };

/** Chips input styled like a Radix TextField: Enter or comma adds, Backspace on an empty field removes the last chip. */
export function TagInput({ value, onChange, max = 20, disabled }: TagInputProps) {
  const [draft, setDraft] = useState("");
  const a11y = useFieldControl({});

  function add() {
    const tag = draft.trim().replace(/,$/, "").slice(0, 40);
    setDraft("");
    if (!tag || value.length >= max || value.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  }

  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center gap-1.5 rounded-(--radius-3) bg-(--color-surface) px-2 py-1.5 shadow-[inset_0_0_0_1px_var(--gray-a7)]",
        "focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-(--focus-8)",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="inline-flex animate-page-in items-center gap-1 rounded-(--radius-2) bg-tint-strong py-0.5 pr-1 pl-2 text-sm text-fg">
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="cursor-pointer rounded-(--radius-1) p-0.5 text-muted hover:bg-tint-strong hover:text-fg"
              aria-label={`Remove ${tag}`}
            >
              <X className="size-3.5" />
            </button>
          )}
        </span>
      ))}
      <input
        {...a11y}
        value={draft}
        disabled={disabled || value.length >= max}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={value.length ? "" : "python, fastapi, postgres"}
        className="h-7 min-w-24 flex-1 bg-transparent px-1 text-base text-fg placeholder:text-(--gray-a10) focus:outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}
