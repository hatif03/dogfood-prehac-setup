"use client";

import { Dialog as RadixDialog, IconButton } from "@radix-ui/themes";
import { X } from "lucide-react";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const WIDTHS = { sm: "400px", md: "520px", lg: "720px" };

/** Radix Dialog: focus trap, Esc, scroll lock and focus return come from Radix. */
export function Dialog({ open, onClose, title, description, children, footer, size = "md", className }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RadixDialog.Content maxWidth={WIDTHS[size]} className={className} {...(description ? {} : { "aria-describedby": undefined })}>
        <div className="flex items-start justify-between gap-4">
          <RadixDialog.Title size="4" mb="1">
            {title}
          </RadixDialog.Title>
          <RadixDialog.Close>
            <IconButton variant="ghost" color="gray" size="2" aria-label="Close dialog" className="-mt-1 -mr-1 cursor-pointer">
              <X className="size-4" />
            </IconButton>
          </RadixDialog.Close>
        </div>
        {description && (
          <RadixDialog.Description size="2" color="gray">
            {description}
          </RadixDialog.Description>
        )}
        {children && <div className="mt-5">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </RadixDialog.Content>
    </RadixDialog.Root>
  );
}
