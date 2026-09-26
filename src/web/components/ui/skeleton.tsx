import { Skeleton as RadixSkeleton } from "@radix-ui/themes";
import { cn } from "@/lib/utils";

/** Size it with classes (`h-8 w-24`). */
export function Skeleton({ className, ...props }: React.ComponentProps<"span">) {
  return <RadixSkeleton aria-hidden className={cn("block rounded-(--radius-2)", className)} {...props} />;
}
