"use client";

import { TextArea, TextField } from "@radix-ui/themes";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";

/** Radix TextField, size 3 (40px, 16px text so phones do not zoom). Children may be <TextField.Slot>s. */
export function Input({ size = "3", ...props }: React.ComponentProps<typeof TextField.Root>) {
  const a11y = useFieldControl(props);
  return <TextField.Root size={size} {...props} {...a11y} />;
}

export function Textarea({ size = "3", rows = 4, resize = "vertical", ...props }: React.ComponentProps<typeof TextArea>) {
  const a11y = useFieldControl(props);
  return <TextArea size={size} rows={rows} resize={resize} {...props} {...a11y} />;
}

// Radix Themes has no native <select>; this one matches TextField size 3 (surface variant).
const SELECT = cn(
  "h-10 w-full cursor-pointer appearance-none rounded-(--radius-3) bg-(--color-surface) pr-9 pl-3 text-base text-fg",
  "shadow-[inset_0_0_0_1px_var(--gray-a7)] hover:shadow-[inset_0_0_0_1px_var(--gray-a8)]",
  "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--focus-8)",
  "aria-invalid:shadow-[inset_0_0_0_1px_var(--tomato-8)] disabled:cursor-not-allowed disabled:opacity-50",
);

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  const a11y = useFieldControl(props);
  return (
    <div className="relative">
      <select className={cn(SELECT, className)} {...props} {...a11y}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
}
