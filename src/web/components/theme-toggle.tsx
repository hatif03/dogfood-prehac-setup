"use client";

import { IconButton, Tooltip } from "@radix-ui/themes";
import { Moon, Sun } from "lucide-react";
import { applyAppearance, THEME_KEY } from "@/lib/theme";

/** Icons swap through the `dark:` variant, so the button renders correctly before hydration. */
export function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    applyAppearance(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // storage blocked: the choice lasts until reload
    }
  }

  return (
    <Tooltip content="Light or dark theme">
      <IconButton variant="ghost" color="gray" size="2" onClick={toggle} aria-label="Toggle light and dark theme">
        <Moon className="size-4 dark:hidden" aria-hidden />
        <Sun className="hidden size-4 dark:block" aria-hidden />
      </IconButton>
    </Tooltip>
  );
}
