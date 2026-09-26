"use client";

import { AlertDialog as RadixAlertDialog } from "@radix-ui/themes";
import { useState } from "react";
import { Button } from "./button";

type AlertDialogProps = {
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive or irreversible actions. */
  danger?: boolean;
  /** May return a promise; the dialog stays open with a spinner until it settles, and closes on success. */
  onConfirm: () => void | Promise<void>;
  /** Uncontrolled: the element that opens it (usually a <Button>). */
  trigger?: React.ReactElement;
  /** Controlled alternative to `trigger`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Confirmation before an action that is hard to undo (publish results, revoke a key, delete). */
export function AlertDialog({ title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, onConfirm, trigger, open, onOpenChange }: AlertDialogProps) {
  const [inner, setInner] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOpen = open ?? inner;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setInner(v));

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <RadixAlertDialog.Root open={isOpen} onOpenChange={(v) => !busy && setOpen(v)}>
      {trigger && <RadixAlertDialog.Trigger>{trigger}</RadixAlertDialog.Trigger>}
      <RadixAlertDialog.Content maxWidth="440px">
        <RadixAlertDialog.Title size="4">{title}</RadixAlertDialog.Title>
        <RadixAlertDialog.Description size="2" color="gray">
          {description}
        </RadixAlertDialog.Description>
        <div className="mt-6 flex justify-end gap-2">
          <RadixAlertDialog.Cancel>
            <Button variant="secondary" disabled={busy}>
              {cancelLabel}
            </Button>
          </RadixAlertDialog.Cancel>
          <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={confirm}>
            {confirmLabel}
          </Button>
        </div>
      </RadixAlertDialog.Content>
    </RadixAlertDialog.Root>
  );
}
