import { ArrowRight, FlaskConical, LogIn } from "lucide-react";
import { Magnetic } from "@/components/amicro/magnetic";
import { TextReveal } from "@/components/amicro/text-reveal";
import { DinoArt } from "@/components/dino-art";
import { Button } from "@/components/ui/button";

const FIXTURE = "sample-hack-2026";

const VALUES = [
  ["Judges only see their own scores.", "Enforced by the API, so a curl gets the same refusal as the page."],
  ["Lenient and harsh judges are evened out.", "Scores are adjusted per judge, and the method is published with the results."],
  ["Runs offline from one docker compose up.", "No accounts, no hosted services, nothing to sign up for."],
] as const;

// Two masks, intersected: fade the art into the page toward the text (left) and toward the content below.
const MASK: React.CSSProperties = {
  maskImage: "linear-gradient(to right, transparent 0%, #000 55%), linear-gradient(to top, transparent 0%, #000 35%)",
  maskComposite: "intersect",
  WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 55%), linear-gradient(to top, transparent 0%, #000 35%)",
  WebkitMaskComposite: "source-in",
};
const MASK_MOBILE: React.CSSProperties = {
  maskImage: "linear-gradient(to top, transparent 5%, #000 60%)",
  WebkitMaskImage: "linear-gradient(to top, transparent 5%, #000 60%)",
};

/** Signed-out hero: the raptor bleeds in from the right (top on phones), the copy sits on the faded side. */
export function LandingHero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-line">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-72 opacity-70 md:hidden">
        <DinoArt sizes="100vw" priority className="h-full w-full object-[70%_30%]" style={MASK_MOBILE} />
      </div>
      <div aria-hidden className="absolute inset-y-0 right-0 -z-10 hidden w-[68%] md:block">
        <DinoArt sizes="68vw" priority className="h-full w-full object-[60%_35%] opacity-90 dark:opacity-80" style={MASK} />
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pt-48 pb-14 sm:px-6 md:pt-24 md:pb-24">
        <p className="text-sm font-medium text-muted">Dogfood 2026 · self-hosted judging portal</p>
        <h1 className="max-w-xl text-5xl font-semibold tracking-tighter text-balance sm:text-6xl">
          <TextReveal text={"Judging you\ncan defend."} />
        </h1>
        <div className="flex animate-page-in flex-col gap-4 [animation-delay:250ms]">
          <ul className="flex max-w-xl flex-col gap-3">
            {VALUES.map(([lead, rest]) => (
              <li key={lead} className="flex gap-3">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                <p className="text-muted">
                  <strong className="font-medium text-fg">{lead}</strong> {rest}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Magnetic>
              <Button href={`/events/${FIXTURE}`} size="lg">
                Browse the fixture event <ArrowRight />
              </Button>
            </Magnetic>
            <Button href="/events/playground" size="lg" variant="secondary">
              <FlaskConical /> Try the playground
            </Button>
            <Button href="/login" size="lg" variant="ghost">
              <LogIn /> Sign in
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
