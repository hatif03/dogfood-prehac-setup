"use client";

import { Theme } from "@radix-ui/themes";
import { useSyncExternalStore } from "react";
import type { Appearance } from "@/lib/theme";

function readAppearance(): Appearance {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribeAppearance(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

/** Keeps Radix Theme `appearance` in sync with `.dark` / `.light` on `<html>` (see lib/theme.ts). */
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribeAppearance, readAppearance, () => "dark");
}

const THEME_PROPS = {
  accentColor: "amber" as const,
  grayColor: "gray" as const,
  radius: "medium" as const,
  panelBackground: "solid" as const,
  hasBackground: true,
};

export function PortalTheme({ children, className }: { children: React.ReactNode; className?: string }) {
  const appearance = useAppearance();
  return (
    <Theme {...THEME_PROPS} appearance={appearance} className={className}>
      {children}
    </Theme>
  );
}

/** Portalled UI (mobile menu) sits outside the root Theme tree. */
export function PortalThemeSubtree({ children }: { children: React.ReactNode }) {
  const appearance = useAppearance();
  return (
    <Theme {...THEME_PROPS} appearance={appearance}>
      {children}
    </Theme>
  );
}
