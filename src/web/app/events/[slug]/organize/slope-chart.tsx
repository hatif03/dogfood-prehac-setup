"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { EASE } from "@/components/amicro/presets";
import type { NormalizationRow } from "@/lib/types";

const W = 620;
const ROW = 22;
const PAD = 28;
const X1 = 240;
const X2 = 380;
const COLOR = { up: "var(--accent-9)", down: "var(--tomato-9)", same: "var(--gray-10)" };

const clip = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Raw rank (left) vs adjusted rank (right). Shows every project in either top-K so no line leaves the chart. */
export function SlopeChart({ rows, top = 20 }: { rows: NormalizationRow[]; top?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const shown = rows.filter((r) => r.rank <= top || r.raw_rank <= top);
  const depth = Math.max(1, ...shown.map((r) => Math.max(r.rank, r.raw_rank)));
  const H = PAD * 2 + (depth - 1) * ROW;
  const y = (rank: number) => PAD + (rank - 1) * ROW;
  const active = shown.find((r) => r.project.id === hover) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 rounded-(--radius-3) bg-surface-2 px-4 py-2 text-sm" aria-live="polite">
        {active ? (
          <>
            <span className="font-medium text-fg">{active.project.title}</span>
            <span className="text-xs text-muted">{active.project.track ?? "no track"}</span>
            <span className="font-mono text-xs text-muted tabular-nums">
              raw #{active.raw_rank} · {active.raw_mean.toFixed(2)}
            </span>
            <span className="font-mono text-xs text-fg tabular-nums">
              adjusted #{active.rank} · {active.adjusted.toFixed(2)} ± {active.std_error.toFixed(2)}
            </span>
            <span className="font-mono text-xs text-subtle tabular-nums">{active.n_reviews} reviews</span>
          </>
        ) : (
          <span className="text-sm text-muted">Hover or focus a line to see the project, its raw mean and adjusted score.</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Rank shift for ${shown.length} projects, raw rank left, adjusted rank right`}>
        <text x={X1} y={10} textAnchor="middle" className="fill-subtle font-mono text-[10px] tracking-widest uppercase">
          raw
        </text>
        <text x={X2} y={10} textAnchor="middle" className="fill-subtle font-mono text-[10px] tracking-widest uppercase">
          adjusted
        </text>
        <line x1={X1} x2={X1} y1={PAD - 8} y2={H - PAD + 8} stroke="var(--gray-a5)" />
        <line x1={X2} x2={X2} y1={PAD - 8} y2={H - PAD + 8} stroke="var(--gray-a5)" />
        {shown.map((r, i) => {
          const delta = r.raw_rank - r.rank;
          const color = delta > 0 ? COLOR.up : delta < 0 ? COLOR.down : COLOR.same;
          const dim = hover !== null && hover !== r.project.id;
          const on = hover === r.project.id;
          const y1 = y(r.raw_rank);
          const y2 = y(r.rank);
          return (
            <g
              key={r.project.id}
              onPointerEnter={() => setHover(r.project.id)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(r.project.id)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${r.project.title}: raw ${r.raw_rank}, adjusted ${r.rank}`}
              style={{ opacity: dim ? 0.14 : 1, transition: "opacity 160ms", cursor: "pointer", outline: "none" }}
            >
              <text x={X1 - 12} y={y1 + 4} textAnchor="end" className="font-sans text-[11px]" fill={on ? "var(--gray-12)" : "var(--gray-11)"}>
                {clip(r.project.title)}
                <tspan dx={8} className="font-mono" fill="var(--gray-10)">
                  {r.raw_rank}
                </tspan>
              </text>
              <text x={X2 + 12} y={y2 + 4} className="font-sans text-[11px]" fill={on ? "var(--gray-12)" : "var(--gray-11)"}>
                <tspan className="font-mono" fill={color}>
                  {r.rank}
                </tspan>
                <tspan dx={8}>{clip(r.project.title)}</tspan>
              </text>
              <motion.path
                d={`M${X1} ${y1} C${(X1 + X2) / 2} ${y1} ${(X1 + X2) / 2} ${y2} ${X2} ${y2}`}
                fill="none"
                stroke={color}
                strokeWidth={on ? 2.5 : delta === 0 ? 1 : 1.5}
                strokeOpacity={delta === 0 && !on ? 0.5 : 0.9}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: Math.min(i, 20) * 0.01, ease: EASE }}
              />
              <path d={`M${X1} ${y1} C${(X1 + X2) / 2} ${y1} ${(X1 + X2) / 2} ${y2} ${X2} ${y2}`} fill="none" stroke="transparent" strokeWidth={12} />
              <circle cx={X1} cy={y1} r={on ? 4 : 3} fill={color} />
              <motion.circle
                cx={X2}
                cy={y2}
                r={on ? 4 : 3}
                fill={color}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, duration: 0.25, ease: EASE }}
              />
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4 text-sm text-muted">
        <Legend color={COLOR.up} label="moved up after normalization" />
        <Legend color={COLOR.down} label="moved down" />
        <Legend color={COLOR.same} label="unchanged" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-0.5 w-4 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
