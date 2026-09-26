"use client";

import { Tabs as RadixTabs } from "@radix-ui/themes";
import { cn } from "@/lib/utils";

export type TabItem<V extends string = string> = {
  value: V;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
};

type TabsProps<V extends string> = {
  tabs: readonly TabItem<V>[];
  value: V;
  onValueChange: (value: V) => void;
  /** <TabPanel>s for these tabs. Radix links triggers and panels and handles arrow keys, Home and End. */
  children?: React.ReactNode;
  /** Applied to the tab list. */
  className?: string;
  "aria-label"?: string;
};

export function Tabs<V extends string>({ tabs, value, onValueChange, children, className, "aria-label": ariaLabel }: TabsProps<V>) {
  return (
    <RadixTabs.Root value={value} onValueChange={(v) => onValueChange(v as V)}>
      <RadixTabs.List aria-label={ariaLabel} className={cn("overflow-x-auto", className)}>
        {tabs.map((tab) => (
          <RadixTabs.Trigger key={tab.value} value={tab.value} className="cursor-pointer [&_svg]:size-4">
            <span className="inline-flex items-center gap-2">
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && <span className="rounded-(--radius-1) bg-tint px-1.5 font-mono text-xs text-muted tabular-nums">{tab.count}</span>}
            </span>
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

/** Only the active panel mounts; `value` must match its tab. */
export function TabPanel({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  return (
    <RadixTabs.Content value={value} className={cn("animate-page-in pt-5 focus-visible:outline-none", className)}>
      {children}
    </RadixTabs.Content>
  );
}
