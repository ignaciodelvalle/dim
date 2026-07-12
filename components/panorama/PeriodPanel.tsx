"use client";

// PeriodPanel — the "Período" rail panel body (task #38 item 2). A FLAT vertical
// radio list of period presets (no nested popover, so it never clips inside the
// rail panel's internal scroll).
//
// Commit semantics (panorama QA root-cause #3b, "Root B"): selecting a preset OR
// a custom {from,to} range commits SHALLOW — exactly like scope/layers/asOf — via
// the console's `onPeriodChange`, which pushes ?period/?from/?to through the
// History API and refetches the board client-side. This SUPERSEDES the former
// full `window.location.assign` reload (the jarring page flash the PO flagged;
// custom ranges used to reload TWICE). Selecting "Personalizado…" now only
// REVEALS the date picker — the single commit fires ONCE both endpoints are set.
//
// Two tiers: Simple = the 4 common windows; Detalle = + año en curso / 3 años /
// 5 años / personalizado (with the DateRangePicker).

import { useState } from "react";

import { DateRangePicker } from "@/components/gob/DateRangePicker";
import type { DateRange } from "@/components/gob/DateRangePicker";
import type { PeriodPreset } from "@/components/gob/PeriodPicker";

const COMMON: ReadonlyArray<{ value: PeriodPreset; label: string }> = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
  { value: "trailing12m", label: "12 meses" },
];

const MORE: ReadonlyArray<{ value: PeriodPreset; label: string }> = [
  { value: "ytd", label: "Año en curso" },
  { value: "3y", label: "3 años" },
  { value: "5y", label: "5 años" },
];

type Props = {
  /** The active period preset id (committed period preferred by the caller). */
  activePeriod: string;
  /** Simple (false) / Detalle (true). */
  detail: boolean;
  from: string | null;
  to: string | null;
  /**
   * Commit a período change SHALLOW (no reload). `period` is a preset id or
   * "custom"; for a "custom" commit the {from,to} window is non-null. Mirrors how
   * the console commits scope/layers/asOf — a History push + a client refetch.
   */
  onPeriodChange: (period: string, from: string | null, to: string | null) => void;
};

export function PeriodPanel({ activePeriod, detail, from, to, onPeriodChange }: Props) {
  const [customRange, setCustomRange] = useState<DateRange>({ from, to });
  // "Personalizado…" is expanded when the committed period IS custom, or the
  // operator just revealed the picker (before the range is complete — no commit
  // has fired yet, so activePeriod is still the prior window).
  const [customOpen, setCustomOpen] = useState<boolean>(activePeriod === "custom");
  const customActive = activePeriod === "custom" || customOpen;

  function pick(preset: PeriodPreset) {
    setCustomOpen(false);
    setCustomRange({ from: null, to: null });
    onPeriodChange(preset, null, null);
  }

  function revealCustom() {
    // Reveal the date picker WITHOUT committing — the single commit fires from
    // handleCustomRangeChange once BOTH endpoints are set. This kills the old
    // double-reload (pick "custom" → reload, then pick dates → reload again).
    setCustomOpen(true);
  }

  function handleCustomRangeChange(range: DateRange) {
    setCustomRange(range);
    if (range.from && range.to) onPeriodChange("custom", range.from, range.to);
  }

  const options = detail ? [...COMMON, ...MORE] : COMMON;

  return (
    <fieldset className="m-0 flex flex-col gap-0.5 border-0 p-0">
      <legend className="sr-only">Período</legend>
      {options.map(({ value, label }) => {
        const isActive = activePeriod === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            onClick={() => pick(value)}
            className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-[var(--text-sm)] ${
              isActive
                ? "bg-ln-op-azul/10 font-semibold text-ln-op-azul"
                : "text-ln-op-ink hover:bg-ln-op-stripe"
            }`}
          >
            <span aria-hidden="true" className="w-3 text-ln-op-azul">
              {isActive ? "✓" : ""}
            </span>
            {label}
          </button>
        );
      })}
      {detail && (
        <>
          <button
            type="button"
            aria-pressed={customActive}
            onClick={revealCustom}
            className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-[var(--text-sm)] ${
              customActive
                ? "bg-ln-op-azul/10 font-semibold text-ln-op-azul"
                : "text-ln-op-ink hover:bg-ln-op-stripe"
            }`}
          >
            <span aria-hidden="true" className="w-3 text-ln-op-azul">
              {customActive ? "✓" : ""}
            </span>
            Personalizado…
          </button>
          {customActive && (
            <div className="mt-1 border-t border-ln-op-line-2 pt-2">
              <DateRangePicker value={customRange} onChange={handleCustomRangeChange} />
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
