"use client";

import { Theme } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import type { Appearance } from "@/lib/theme";

function readAppearance(): Appearance {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Keeps Radix Theme `appearance` in sync with `.dark` / `.light` on `<html>` (see lib/theme.ts). */
export function useAppearance(): Appearance {
  const [appearance, setAppearance] = useState<Appearance>("dark");

  useEffect(() => {
    setAppearance(readAppearance());
    const obs = new MutationObserver(() => setAppearance(readAppearance()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return appearance;
}

const THEME_PROPS = {
  accentColor: "amber" as const,
  grayColor: "gray" as const,
  radius: "medium" as const,
  panelBackground: "translucent" as const,
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
  return <Theme {...THEME_PROPS} appearance={appearance}>{children}</Theme>;
}
