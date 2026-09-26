import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type DateInput = string | number | Date;

export function formatDate(value: DateInput, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...opts,
  }).format(new Date(value));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
  ["second", 1],
];

export function relativeTime(value: DateInput, now: DateInput = Date.now()) {
  const diff = (new Date(value).getTime() - new Date(now).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(diff) >= seconds || unit === "second") {
      return rtf.format(Math.round(diff / seconds), unit);
    }
  }
  return "";
}

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  done: boolean;
};

export function countdownParts(target: Date, now: Date = new Date()): CountdownParts {
  const totalMs = Math.max(0, target.getTime() - now.getTime());
  const s = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3_600),
    minutes: Math.floor((s % 3_600) / 60),
    seconds: s % 60,
    totalMs,
    done: totalMs === 0,
  };
}

export function hashString(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** "13 days", "5 hours", "12 minutes", "under a minute": one unit, rounded down, for deadlines in prose. */
export function durationWords(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes >= 2 * 1440) return plural(Math.floor(minutes / 1440), "day");
  if (minutes >= 120) return plural(Math.floor(minutes / 60), "hour");
  if (minutes >= 1) return plural(minutes, "minute");
  return "under a minute";
}
