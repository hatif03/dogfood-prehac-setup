"use client";

import { Switch as RadixSwitch } from "@radix-ui/themes";
import { useId } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export function Switch({ checked, onCheckedChange, label, description, disabled, id, className }: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <RadixSwitch
        id={switchId}
        size="2"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${switchId}-desc` : undefined}
        className="mt-0.5 cursor-pointer"
      />
      {(label || description) && (
        <div className="flex flex-col gap-0.5">
          {label && (
            <label htmlFor={switchId} className="cursor-pointer text-sm font-medium text-fg">
              {label}
            </label>
          )}
          {description && (
            <p id={`${switchId}-desc`} className="text-sm text-muted">
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
