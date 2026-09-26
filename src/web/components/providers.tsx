"use client";

import { MotionConfig } from "motion/react";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
