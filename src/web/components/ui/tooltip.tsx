import { Tooltip as RadixTooltip } from "@radix-ui/themes";

type TooltipProps = {
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  /** One focusable element (it becomes the trigger). Give non-interactive children tabIndex={0}. */
  children: React.ReactElement;
};

/** Radix Tooltip: hover and keyboard focus, collision-aware, Esc to dismiss. */
export function Tooltip({ content, side = "top", className, children }: TooltipProps) {
  return (
    <RadixTooltip content={content} side={side} className={className}>
      {children}
    </RadixTooltip>
  );
}
