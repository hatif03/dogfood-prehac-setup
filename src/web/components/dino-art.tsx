import { cn } from "@/lib/utils";

type DinoArtProps = {
  /** Rendered width of the image, as for `<img sizes>` (e.g. "(min-width: 768px) 60vw, 100vw"). */
  sizes: string;
  /** Load eagerly with high priority (above-the-fold hero only). */
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * The raptor (public/art, 3:2 WebP at 768/1280/2048 px). A plain srcSet so the browser picks the file for the
 * layout width, with no image optimizer needed offline. Decorative: empty alt and hidden from assistive tech.
 */
export function DinoArt({ sizes, priority = false, className, style }: DinoArtProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/art/dino-1280.webp"
      srcSet="/art/dino-768.webp 768w, /art/dino-1280.webp 1280w, /art/dino-2048.webp 2048w"
      sizes={sizes}
      width={1280}
      height={853}
      alt=""
      aria-hidden
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      className={cn("select-none object-cover", className)}
      style={style}
    />
  );
}
