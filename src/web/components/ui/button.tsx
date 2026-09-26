import { IconButton, Button as RadixButton } from "@radix-ui/themes";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

// Accent only on the one primary action per view; everything else is gray.
const VARIANTS = {
  primary: { variant: "solid" },
  secondary: { variant: "soft", color: "gray" },
  ghost: { variant: "ghost", color: "gray" },
  outline: { variant: "surface", color: "gray" },
  danger: { variant: "soft", color: "tomato" },
} as const;

const SIZES = { sm: "2", md: "3", lg: "4", icon: "2" } as const;

const BASE = "cursor-pointer transition-transform duration-150 ease-out-expo active:scale-[0.97] [&_svg]:size-4 [&_svg]:shrink-0";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export type ButtonProps =
  | (CommonProps & Omit<React.ComponentProps<"button">, "color"> & { href?: undefined; asChild?: boolean })
  | (CommonProps & {
      href: string;
      target?: string;
      rel?: string;
      prefetch?: boolean;
      download?: boolean | string;
      onClick?: React.MouseEventHandler<HTMLAnchorElement>;
      "aria-label"?: string;
    });

/** Radix Button (IconButton for size="icon"). `href` renders a link; API paths, new tabs and downloads use a plain <a>. */
export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", loading = false, className, children } = props;
  const Comp = size === "icon" ? IconButton : RadixButton;
  // Ghost drops Radix's optical negative margin so it lines up with the other buttons in a row.
  const look = { ...VARIANTS[variant], size: SIZES[size], className: cn(BASE, variant === "ghost" && "m-0", className) };

  if (props.href !== undefined) {
    const { href, target, rel, prefetch, download, onClick } = props;
    const plain = download !== undefined || target !== undefined || !href.startsWith("/") || href.startsWith("/v1/");
    const linkProps = { href, target, rel, onClick, "aria-label": props["aria-label"] };
    return (
      <Comp {...look} asChild>
        {plain ? (
          <a {...linkProps} download={download}>
            {children}
          </a>
        ) : (
          <Link {...linkProps} prefetch={prefetch}>
            {children}
          </Link>
        )}
      </Comp>
    );
  }

  const { variant: _v, size: _s, loading: _l, className: _c, children: _ch, href: _h, type = "button", ...rest } = props;
  return (
    <Comp {...look} {...rest} type={type} loading={loading}>
      {children}
    </Comp>
  );
}
