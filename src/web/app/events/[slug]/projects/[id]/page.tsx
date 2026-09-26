import { ArrowLeft, ArrowUpRight, CirclePlay, FolderGit2, Globe } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataList, type DataListItem } from "@/components/ui/data-list";
import { serverApi } from "@/lib/server-api";
import type { EventDetail, Project } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Comments } from "./comments";

type Props = { params: Promise<{ slug: string; id: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug, id } = await params;
  const p = await serverApi<Project>(`/v1/events/${slug}/projects/${id}`).catch(() => null);
  return { title: p?.title ?? "Project", description: p?.summary };
}

export default async function ProjectPage({ params }: Props) {
  const { slug, id } = await params;
  const [project, event] = await Promise.all([
    serverApi<Project>(`/v1/events/${slug}/projects/${id}`).catch(() => null),
    serverApi<EventDetail>(`/v1/events/${slug}`),
  ]);
  if (!project || !event) notFound();
  const p = project;
  const paragraphs = p.description.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  // Live app first when there is one: it is what a visitor wants to try.
  const links = [
    { href: p.live_link, label: "Open the live app", icon: Globe },
    { href: p.repo_url, label: "Source code", icon: FolderGit2 },
    { href: p.demo_video_url, label: "Demo video", icon: CirclePlay },
  ].filter((l) => l.href);

  const facts = ([
    { label: "Team", value: <span className="font-medium">{p.team.name}</span> },
    p.team.members.length > 0 && {
      label: "Members",
      value: (
        <ul className="flex flex-col gap-2">
          {p.team.members.map((m) => (
            <li key={m} className="flex items-center gap-2">
              <Avatar name={m} size="sm" /> {m}
            </li>
          ))}
        </ul>
      ),
    },
    p.track && {
      label: "Track",
      value: (
        <Link href={`/events/${slug}?track=${p.track.slug}`} className="underline decoration-line-strong underline-offset-4 hover:decoration-current">
          {p.track.name}
        </Link>
      ),
    },
    p.submitted_at && { label: "Submitted", value: formatDate(p.submitted_at) },
    p.tech_tags.length > 0 && {
      label: "Tags",
      value: (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {p.tech_tags.map((t) => (
            <li key={t}>
              <Link href={`/events/${slug}?tag=${encodeURIComponent(t)}`} className="rounded-(--radius-2) bg-tint px-1.5 py-0.5 font-mono text-xs text-muted transition-colors hover:bg-tint-strong hover:text-fg">
                #{t}
              </Link>
            </li>
          ))}
        </ul>
      ),
    },
    p.external_id && { label: "Fixture ID", value: <span className="font-mono text-xs">{p.external_id}</span> },
  ] as (DataListItem | false | null | "")[]).filter((x): x is DataListItem => Boolean(x));

  return (
    <div className="flex flex-col gap-8">
      <Link href={`/events/${slug}`} className="-mb-2 inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> All projects
      </Link>

      <header className="flex max-w-3xl animate-page-in flex-col gap-3">
          {p.track && (
            <div>
              <Badge>{p.track.name}</Badge>
            </div>
          )}
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{p.title}</h1>
          {p.summary && <p className="text-lg leading-relaxed text-muted">{p.summary}</p>}
          <p className="text-sm text-muted">by {p.team.name}</p>
          {links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {links.map((l, i) => (
                <Button key={l.label} href={l.href} target="_blank" rel="noreferrer" variant={i === 0 ? "primary" : "secondary"}>
                  <l.icon /> {l.label}
                  {i === 0 && <ArrowUpRight />}
                </Button>
              ))}
            </div>
          )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="about-heading" className="flex flex-col gap-3">
            <h2 id="about-heading" className="text-lg font-semibold tracking-tight">
              About the project
            </h2>
            {paragraphs.length ? (
              <div className="flex max-w-prose flex-col gap-4 leading-7 text-fg">
                {paragraphs.map((para, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-muted">The team did not add a longer description.</p>
            )}
          </section>

          {p.images.length > 0 && (
            <section aria-labelledby="shots-heading" className="flex flex-col gap-3">
              <h2 id="shots-heading" className="text-lg font-semibold tracking-tight">
                Screenshots
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {p.images.map((src, i) => (
                  <a
                    key={src}
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className={`group overflow-hidden rounded-(--radius-4) border border-line bg-surface-2 ${i === 0 && p.images.length % 2 === 1 ? "sm:col-span-2" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from object storage */}
                    <img
                      src={src}
                      alt={`Screenshot ${i + 1} of ${p.title}`}
                      loading="lazy"
                      className="aspect-video w-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-[1.02]"
                    />
                  </a>
                ))}
              </div>
            </section>
          )}

          <Comments slug={slug} projectId={p.id} />
        </div>

        <aside className="order-first flex flex-col gap-4 lg:order-none lg:sticky lg:top-(--event-sticky-top) lg:self-start" aria-label="Project facts">
          <Card className="p-5">
            <DataList items={facts} orientation="horizontal" />
          </Card>
          {event.voting_open && (
            <Callout
              title="Community voting is open"
              action={
                <Button href={`/events/${slug}/vote`} variant="secondary" size="sm">
                  Go to the ballot
                </Button>
              }
            >
              The popular vote is counted apart from the judges&apos; ranking.
            </Callout>
          )}
        </aside>
      </div>
    </div>
  );
}
