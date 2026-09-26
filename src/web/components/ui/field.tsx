"use client";

import { createContext, useContext, useId } from "react";
import { cn } from "@/lib/utils";

type FieldCtx = { id: string; labelId: string; describedBy?: string; invalid: boolean };

const FieldContext = createContext<FieldCtx | null>(null);

/** Inputs inside a <Field> pick up id, aria-describedby and aria-invalid automatically. */
export function useFieldControl(props: { id?: string; "aria-describedby"?: string; "aria-invalid"?: React.AriaAttributes["aria-invalid"] }) {
  const ctx = useContext(FieldContext);
  return {
    id: props.id ?? ctx?.id,
    "aria-describedby": props["aria-describedby"] ?? ctx?.describedBy,
    "aria-invalid": props["aria-invalid"] ?? (ctx?.invalid || undefined),
  };
}

/** For controls that are not labelable elements (the slider thumb), which need aria-labelledby. */
export function useFieldLabelId() {
  return useContext(FieldContext)?.labelId;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-fg", className)} {...props} />;
}

type FieldProps = {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
};

export function Field({ label, hint, error, required, id, className, children }: FieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const labelId = `${controlId}-label`;

  return (
    <FieldContext.Provider value={{ id: controlId, labelId, describedBy, invalid: Boolean(error) }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        {label && (
          <Label htmlFor={controlId} id={labelId}>
            {label}
            {required && (
              <span className="ml-0.5 text-subtle" aria-hidden>
                *
              </span>
            )}
          </Label>
        )}
        {children}
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-coral-11">
            {error}
          </p>
        ) : (
          hint && (
            <p id={hintId} className="text-sm text-muted">
              {hint}
            </p>
          )
        )}
      </div>
    </FieldContext.Provider>
  );
}
