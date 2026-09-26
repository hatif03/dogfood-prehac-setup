import { DinoArt } from "@/components/dino-art";
import { Button } from "@/components/ui/button";

const FADE: React.CSSProperties = {
  maskImage: "radial-gradient(closest-side, #000 55%, transparent)",
  WebkitMaskImage: "radial-gradient(closest-side, #000 55%, transparent)",
};

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <DinoArt sizes="(min-width: 640px) 480px, 90vw" className="aspect-[3/2] w-full max-w-[480px] opacity-90" style={FADE} />
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">This page went extinct.</h1>
      <p className="max-w-sm text-muted">It does not exist, or you do not have access to it.</p>
      <Button href="/" variant="secondary" className="mt-2">
        Back to the portal
      </Button>
    </div>
  );
}
