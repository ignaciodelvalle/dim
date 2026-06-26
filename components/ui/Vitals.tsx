import type { ReactNode } from "react";

/**
 * Libreta Nacional Vitals — 4-cell grid strip.
 *
 * Each cell has:
 *  - mono uppercase label
 *  - serif value (19px)
 *  - optional small meta in mono
 *
 * Used in: pet profile page below the hero.
 */

export type LnVitalCell = {
  label: string;
  value: ReactNode;
  unit?: string;
  meta?: string;
};

export type LnVitalsProps = {
  cells: LnVitalCell[];
  className?: string;
};

export function LnVitals({ cells, className = "" }: LnVitalsProps) {
  return (
    <div
      className={[
        "grid overflow-hidden rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)]",
        "grid-cols-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={[
            "px-[18px] py-[14px]",
            i < cells.length - 1 ? "border-r border-[var(--color-ln-line-2)]" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {/* Mono label */}
          <p className="mb-[5px] font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.14em] text-[var(--color-ln-mute)]">
            {cell.label}
          </p>

          {/* Serif value */}
          <p className="font-[var(--font-ln-serif)] text-[19px] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]">
            {cell.value}
            {cell.unit && (
              <small className="ml-[3px] font-[var(--font-ln-sans)] text-sm font-normal text-[var(--color-ln-mute)]">
                {cell.unit}
              </small>
            )}
          </p>

          {/* Mono meta */}
          {cell.meta && (
            <p className="mt-[2px] font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)]">
              {cell.meta}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
