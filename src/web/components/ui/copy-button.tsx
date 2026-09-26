"use client";

import { Button as RadixButton, IconButton } from "@radix-ui/themes";
import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { SPRING } from "@/components/amicro/presets";
import { useWebHaptics } from "@/components/amicro/use-web-haptics";

type CopyButtonProps = {
  value: string;
  /** Visible text next to the icon; omit for an icon-only button. */
  label?: string;
  className?: string;
  onCopied?: () => void;
};

export function CopyButton({ value, label, className, onCopied }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { trigger } = useWebHaptics();

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      trigger("success");
      onCopied?.();
    } catch {
      trigger("error");
    }
  }

  const icon = (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={copied ? "check" : "copy"}
        className="grid place-items-center"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={SPRING}
      >
        {copied ? <Check className="size-3.5" strokeWidth={2.5} /> : <Copy className="size-3.5" />}
      </motion.span>
    </AnimatePresence>
  );
  const status = (
    <span className="sr-only" aria-live="polite">
      {copied ? "Copied to clipboard" : ""}
    </span>
  );
  const look = { variant: "soft", color: copied ? undefined : "gray", size: "1", className: `cursor-pointer ${className ?? ""}` } as const;

  return label ? (
    <RadixButton {...look} onClick={copy}>
      {icon}
      {copied ? "Copied" : label}
      {status}
    </RadixButton>
  ) : (
    <IconButton {...look} onClick={copy} aria-label={copied ? "Copied" : "Copy to clipboard"}>
      {icon}
      {status}
    </IconButton>
  );
}
