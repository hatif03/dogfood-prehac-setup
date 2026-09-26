import { Card as RadixCard } from "@radix-ui/themes";
import { cn } from "@/lib/utils";

type DivProps = React.ComponentProps<"div">;

/** Radix Card without its own padding: add `p-5`, or compose the parts below. `asChild` around a link makes it hoverable. */
export function Card({ className, ...props }: React.ComponentProps<typeof RadixCard>) {
  return <RadixCard className={cn("p-0", className)} {...props} />;
}

export function CardHeader({ className, ...props }: DivProps) {
  return <div className={cn("flex flex-col gap-1.5 p-5 pb-0 sm:p-6 sm:pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-base font-semibold tracking-tight text-fg", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm leading-relaxed text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: DivProps) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: DivProps) {
  return <div className={cn("flex items-center gap-3 border-t border-line px-5 py-4 sm:px-6", className)} {...props} />;
}
