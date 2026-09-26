"use client";

import { IconButton } from "@radix-ui/themes";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { Toast } from "radix-ui";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useWebHaptics } from "@/components/amicro/use-web-haptics";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info";

type ToastInput = {
  title: React.ReactNode;
  description?: React.ReactNode;
  tone?: ToastTone;
  /** Milliseconds; 0 keeps it until dismissed. */
  duration?: number;
};

type ToastItem = Required<Pick<ToastInput, "tone" | "duration">> & ToastInput & { id: number; open: boolean };

type ToastApi = {
  toast: (input: ToastInput) => number;
  success: (title: React.ReactNode, description?: React.ReactNode) => number;
  error: (title: React.ReactNode, description?: React.ReactNode) => number;
  info: (title: React.ReactNode, description?: React.ReactNode) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const TONES = { success: "text-accent-11", error: "text-coral-11", info: "text-cyan-11" };

/** Radix Toast under the old useToast() API. Errors are announced assertively; swipe right or press Esc to dismiss. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const { trigger } = useWebHaptics();

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.map((t) => (t.id === id ? { ...t, open: false } : t)));
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 300); // after the exit animation
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const item: ToastItem = { tone: "info", duration: input.tone === "error" ? 6000 : 4000, ...input, id, open: true };
      if (item.tone !== "info") trigger(item.tone);
      setItems((cur) => [...cur.slice(-4), item]);
      return id;
    },
    [trigger],
  );

  const value = useMemo<ToastApi>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ title, description, tone: "success" }),
      error: (title, description) => toast({ title, description, tone: "error" }),
      info: (title, description) => toast({ title, description, tone: "info" }),
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      <Toast.Provider swipeDirection="right" label="Notification">
        {children}
        {items.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <Toast.Root
              key={t.id}
              open={t.open}
              onOpenChange={(open) => !open && dismiss(t.id)}
              duration={t.duration || Infinity}
              type={t.tone === "error" ? "foreground" : "background"}
              className="toast-root flex items-start gap-3 rounded-(--radius-4) bg-(--color-panel-solid) p-3.5 pr-2.5 shadow-(--shadow-5)"
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", TONES[t.tone])} aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Toast.Title className="text-sm font-medium text-fg">{t.title}</Toast.Title>
                {t.description && <Toast.Description className="text-sm leading-relaxed text-muted">{t.description}</Toast.Description>}
              </div>
              <Toast.Close asChild>
                <IconButton variant="ghost" color="gray" size="1" aria-label="Dismiss notification" className="m-0 cursor-pointer">
                  <X className="size-3.5" />
                </IconButton>
              </Toast.Close>
            </Toast.Root>
          );
        })}
        <Toast.Viewport className="fixed right-0 bottom-0 z-[110] m-0 flex w-full max-w-sm list-none flex-col gap-2 p-4 outline-none sm:p-6" />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
