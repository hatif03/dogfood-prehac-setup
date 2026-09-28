// Dark by default (Raptors-inspired); override in header toggle, stored in localStorage.
export const THEME_KEY = "portal-theme";
export type Appearance = "light" | "dark";

export function applyAppearance(value: Appearance) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(value);
}

/** Inlined in <head> by app/layout.tsx so the right class is on <html> before the first paint. */
export const THEME_SCRIPT = `(function(){var s;try{s=localStorage.getItem("${THEME_KEY}")}catch(e){}var d=s?s==="dark":s?s==="light":true;document.documentElement.classList.add(d?"dark":"light")})()`;
