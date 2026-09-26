"use client";

import { SegmentedControl as RadixSegmented } from "@radix-ui/themes";

type SegmentedControlProps<V extends string> = {
  items: readonly { value: V; label: React.ReactNode }[];
  value: V;
  onValueChange: (value: V) => void;
  size?: "1" | "2" | "3";
  className?: string;
  "aria-label"?: string;
};

/** A short either/or choice that filters or switches the view in place (track filter, 1–5 score). Not for navigation. */
export function SegmentedControl<V extends string>({ items, value, onValueChange, size = "2", className, "aria-label": ariaLabel }: SegmentedControlProps<V>) {
  return (
    <RadixSegmented.Root value={value} onValueChange={(v) => onValueChange(v as V)} size={size} className={className} aria-label={ariaLabel}>
      {items.map((item) => (
        <RadixSegmented.Item key={item.value} value={item.value} className="cursor-pointer">
          {item.label}
        </RadixSegmented.Item>
      ))}
    </RadixSegmented.Root>
  );
}
