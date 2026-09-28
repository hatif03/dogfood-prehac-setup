import { Avatar as RadixAvatar } from "@radix-ui/themes";
import { hashString } from "@/lib/utils";

const COLORS = ["amber", "cyan", "violet", "gray", "tomato"] as const;
const SIZES = { sm: "1", md: "2", lg: "3" } as const;

function initials(name: string) {
  const parts = name.split("@")[0].split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

type AvatarProps = {
  /** Display name or email; drives initials and the deterministic color. */
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
};

/** Decorative: the name is always printed next to it, so it is hidden from screen readers. */
export function Avatar({ name, size = "md", className }: AvatarProps) {
  return (
    <RadixAvatar
      aria-hidden
      fallback={initials(name)}
      color={COLORS[hashString(name) % COLORS.length]}
      variant="soft"
      highContrast
      radius="full"
      size={SIZES[size]}
      className={className}
    />
  );
}
