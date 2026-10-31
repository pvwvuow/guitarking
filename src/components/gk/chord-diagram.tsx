"use client";

import { chordShape } from "@/lib/transpose";
import { cn } from "@/lib/utils";

const RED = "oklch(0.545 0.212 26)";
const WOOD = "oklch(0.617 0.093 62)";
const INK = "oklch(0.235 0.012 60)";

interface Props {
  chord: string;
  className?: string;
}

/** Small SVG fretboard diagram for one chord. */
export function ChordDiagram({ chord, className }: Props) {
  const shape = chordShape(chord);
  const W = 92;
  const H = 118;
  const left = 18;
  const top = 26;
  const fw = 11; // string gap
  const fh = 18; // fret gap
  const NUT = 4; // string width /2

  if (!shape) {
    return (
      <div
        className={cn(
          "flex h-[118px] w-[92px] flex-col items-center justify-center rounded-lg border bg-card",
          className
        )}
        aria-hidden
      >
        <span className="chord-latin text-sm font-black text-primary">
          {chord}
        </span>
        <span className="mt-1 text-[9px] text-muted-foreground">دیاگرام ندارد</span>
      </div>
    );
  }

  const { frets, barre, base } = shape;
  const strings = frets.map((f) => (f < 0 ? -1 : f === 0 ? 0 : f - base + 1));
  const showNut = base === 0;

  return (
    <div
      className={cn(
        "flex h-[118px] w-[92px] flex-col items-center rounded-lg border bg-card px-1 pt-1",
        className
      )}
    >
      <span className="chord-latin text-[13px] font-black leading-5 text-primary">
        {chord}
      </span>
      <svg
        viewBox={`0 0 ${W} ${H - 20}`}
        className="mt-0.5"
        role="img"
        aria-label={`دیاگرام آکورد ${chord}`}
      >
        {/* nut or base label */}
        {showNut ? (
          <rect
            x={left - 2}
            y={top - 3}
            width={fw * 5 + 4}
            height={5}
            rx={1}
            fill={INK}
          />
        ) : (
          <text
            x={left - 8}
            y={top + fh * 0.75}
            fontSize={9}
            fill={INK}
            fontFamily="Vazirmatn"
          >
            {base}fr
          </text>
        )}
        {/* frets */}
        {Array.from({ length: 4 }).map((_, i) => (
          <line
            key={i}
            x1={left}
            x2={left + fw * 5}
            y1={top + (i + 1) * fh}
            y2={top + (i + 1) * fh}
            stroke={WOOD}
            strokeWidth={1.4}
            opacity={0.75}
          />
        ))}
        {/* strings */}
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={i}
            y1={top}
            y2={top + fh * 4}
            x1={left + i * fw}
            x2={left + i * fw}
            stroke={INK}
            strokeWidth={0.9 - i * 0.08}
            opacity={0.85}
          />
        ))}
        {/* barre */}
        {barre > 0 && (
          <rect
            x={left - NUT / 2}
            y={top + (barre - base) * fh + 1.5 - NUT}
            width={fw * 5 + NUT}
            height={NUT * 2}
            rx={NUT}
            fill={RED}
            opacity={0.9}
          />
        )}
        {/* markers */}
        {strings.map((f, i) => {
          const x = left + i * fw;
          if (f < 0)
            return (
              <g key={i}>
                <line
                  x1={x - 4}
                  y1={top - 12}
                  x2={x + 4}
                  y2={top - 5}
                  stroke={INK}
                  strokeWidth={1.3}
                />
                <line
                  x1={x - 4}
                  y1={top - 5}
                  x2={x + 4}
                  y2={top - 12}
                  stroke={INK}
                  strokeWidth={1.3}
                />
              </g>
            );
          if (f === 0)
            return (
              <circle
                key={i}
                cx={x}
                cy={top - 8.5}
                r={3.4}
                fill="none"
                stroke={INK}
                strokeWidth={1.2}
              />
            );
          return (
            <circle
              key={i}
              cx={x}
              cy={top + (f - 0.5) * fh}
              r={4.6}
              fill={RED}
            />
          );
        })}
      </svg>
    </div>
  );
}
