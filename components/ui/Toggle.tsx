"use client";

import type { ReactNode } from "react";

/**
 * Libreta Nacional Toggle.
 *
 * The knob slides 18px on toggle.
 * Variants:
 *  - azul  (default) — blue when on; for general settings
 *  - amber            — ámbar when on; for disclosure/lost-mode settings
 *
 * Renders a <button role="switch"> for full a11y compliance.
 */

export type LnToggleVariant = "azul" | "amber";

export type LnToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  variant?: LnToggleVariant;
  label: string;
  description?: string;
  className?: string;
  /** If true, renders the toggle + label inline (no full row) */
  inline?: boolean;
};

export function LnToggle({
  checked,
  onChange,
  variant = "azul",
  label,
  description,
  className = "",
  inline = false,
}: LnToggleProps) {
  const trackOn = variant === "amber" ? "bg-[var(--color-ln-warn)]" : "bg-[var(--color-ln-azul)]";

  if (inline) {
    return (
      <div className={["flex items-center gap-2.5", className].filter(Boolean).join(" ")}>
        <Track checked={checked} trackOn={trackOn} onChange={onChange} label={label} />
        <span className="text-[12.5px] font-semibold text-[var(--color-ln-ink)]">{label}</span>
      </div>
    );
  }

  // B-4: click/key handlers removed from the non-semantic div.
  // The inner <button role="switch"> (Track) already handles all interaction.
  // The div is kept purely for layout; pointer-events on the div are benign but
  // the div is not in the tab order and has no role, so removing the handlers
  // avoids the "interactive element without role" a11y violation.
  return (
    <div
      className={[
        "flex cursor-pointer items-start gap-[11px] rounded-[var(--radius-sm)] border border-[var(--color-ln-line-2)] bg-[var(--color-ln-stripe)] px-3 py-2.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Track checked={checked} trackOn={trackOn} onChange={onChange} label={label} />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold leading-tight text-[var(--color-ln-ink)]">
          {label}
        </p>
        {description && (
          <p className="mt-px text-[11px] leading-[1.4] text-[var(--color-ln-mute)]">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

// Internal track + knob
function Track({
  checked,
  trackOn,
  onChange,
  label,
}: {
  checked: boolean;
  trackOn: string;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={[
        "relative mt-px h-[21px] w-[38px] flex-shrink-0 rounded-full transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]",
        checked ? trackOn : "bg-[var(--color-ln-line-strong)]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Knob */}
      <span
        className={[
          "absolute top-[2px] h-[17px] w-[17px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)] transition-[left] duration-150",
          checked ? "left-[19px]" : "left-[2px]",
        ]
          .filter(Boolean)
          .join(" ")}
      />
    </button>
  );
}

// ---------- Toggle Group -------------------------------------------------
// Renders a list of LnToggle rows with a mono-uppercase subheading.

export type LnToggleGroupItem = {
  key: string;
  label: string;
  description?: string;
  checked: boolean;
  variant?: LnToggleVariant;
};

export type LnToggleGroupProps = {
  heading?: string;
  items: LnToggleGroupItem[];
  onChange: (key: string, next: boolean) => void;
  className?: string;
};

export function LnToggleGroup({ heading, items, onChange, className = "" }: LnToggleGroupProps) {
  return (
    <div className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}>
      {heading && (
        <p className="font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.12em] text-[var(--color-ln-faint)]">
          {heading}
        </p>
      )}
      {items.map((item) => (
        <LnToggle
          key={item.key}
          checked={item.checked}
          onChange={(v) => onChange(item.key, v)}
          variant={item.variant}
          label={item.label}
          description={item.description}
        />
      ))}
    </div>
  );
}

// Re-export for convenience
export type { ReactNode };
