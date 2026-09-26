// Adapted from Amicro (MIT), https://github.com/Subhan-code/Amicro--Micro-transitions-
// CSS instead of motion, so the headline reveals from server HTML without waiting for hydration.

type TextRevealProps = {
  /** One line per `\n`. */
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
};

export function TextReveal({ text, className, delay = 0, stagger = 0.12 }: TextRevealProps) {
  return (
    <span className={className}>
      {text.split("\n").map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <span className="block animate-line-up" style={{ animationDelay: `${delay + i * stagger}s` }}>
            {line}
          </span>
        </span>
      ))}
    </span>
  );
}
