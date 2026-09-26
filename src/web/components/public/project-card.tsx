import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

type ProjectCardProps = {
  project: Project;
  href: string;
  /** Widget mode: tighter, opens the portal in a new tab. */
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

/** The whole card is one link (Radix Card asChild). A screenshot shows only when the team uploaded one. */
export function ProjectCard({ project: p, href, compact = false, className, style }: ProjectCardProps) {
  const image = p.images[0];
  const external = compact ? { target: "_blank", rel: "noopener" } : {};
  return (
    <Card asChild className={cn("group flex h-full flex-col overflow-hidden", className)} style={style}>
      <Link href={href} {...external}>
        {image && (
          <div className="aspect-[16/9] overflow-hidden border-b border-line bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from object storage */}
            <img src={image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-[1.03]" />
          </div>
        )}
        <div className={cn("flex flex-1 flex-col gap-1.5", compact ? "p-3.5" : "p-4 sm:p-5")}>
          {(p.track || p.comment_count > 0) && (
            <div className="mb-1 flex items-center gap-2">
              {p.track && <Badge className="max-w-full truncate">{p.track.name}</Badge>}
              {p.comment_count > 0 && (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted tabular-nums">
                  <MessageSquare className="size-3.5" aria-hidden />
                  {p.comment_count}
                  <span className="sr-only"> comments</span>
                </span>
              )}
            </div>
          )}
          <h3 className={cn("font-semibold tracking-tight text-balance text-fg", compact ? "text-sm" : "text-base")}>{p.title}</h3>
          {p.summary && <p className={cn("line-clamp-2 leading-relaxed text-muted", compact ? "text-xs" : "text-sm")}>{p.summary}</p>}
          <div className={cn("mt-auto flex items-center gap-2 pt-3 text-muted", compact ? "text-xs" : "text-sm")}>
            <Avatar name={p.team.name} size="sm" />
            <span className="min-w-0 truncate">{p.team.name}</span>
          </div>
        </div>
      </Link>
    </Card>
  );
}
