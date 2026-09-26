"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { useFieldControl, useFieldLabelId } from "./field";

type SliderProps = {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** `true` labels every step with its number; an array supplies custom tick labels (one per step). */
  ticks?: boolean | readonly string[];
  showValue?: boolean;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  "aria-label"?: string;
};

/**
 * Radix Slider primitive wearing the Radix Themes slider classes. Themes' own <Slider> does not pass
 * aria-label/aria-valuetext to the thumb, which is the element screen readers announce.
 */
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 10,
  step = 1,
  ticks = false,
  showValue = true,
  formatValue = String,
  disabled,
  id,
  name,
  className,
  "aria-label": ariaLabel,
}: SliderProps) {
  const a11y = useFieldControl({ id });
  const labelId = useFieldLabelId();
  const steps = Math.round((max - min) / step) + 1;
  const tickLabels = Array.isArray(ticks) ? ticks : ticks ? Array.from({ length: steps }, (_, i) => formatValue(min + i * step)) : null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-4">
        <SliderPrimitive.Root
          value={[value]}
          onValueChange={([v]) => onValueChange(v)}
          min={min}
          max={max}
          step={step}
          name={name}
          disabled={disabled}
          className="rt-SliderRoot rt-r-size-2 rt-variant-surface flex-1"
        >
          <SliderPrimitive.Track className="rt-SliderTrack">
            <SliderPrimitive.Range className="rt-SliderRange" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            className="rt-SliderThumb"
            id={a11y.id}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabel ? undefined : labelId}
            aria-describedby={a11y["aria-describedby"]}
            aria-valuetext={formatValue(value)}
          />
        </SliderPrimitive.Root>
        {showValue && (
          <output htmlFor={a11y.id} className="min-w-10 rounded-(--radius-2) bg-surface-2 px-2 py-1 text-center font-mono text-sm text-fg tabular-nums">
            {formatValue(value)}
          </output>
        )}
      </div>
      {tickLabels && (
        <div aria-hidden className={cn("flex justify-between font-mono text-xs text-subtle", showValue && "mr-14")}>
          {tickLabels.map((label, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onClick={() => onValueChange(min + i * step)}
              className={cn("w-4 cursor-pointer text-center transition-colors hover:text-fg", min + i * step === value && "font-semibold text-fg")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
