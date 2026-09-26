import { Spinner as RadixSpinner } from "@radix-ui/themes";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={className}>
      <RadixSpinner size="2" />
    </span>
  );
}
