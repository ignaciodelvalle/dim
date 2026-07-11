"use client";

// PeriodPanel — the "Período" rail panel body (task #38 item 2). A FLAT vertical
// radio list of period presets (no nested popover, so it never clips inside the
// rail panel's internal scroll). Commit semantics are PeriodPicker's verbatim
// (the ?period URL contract, task #21 hard rule): selecting a preset sets
// ?period=<id> and clears ?from/?to via a full document navigation (the one
// mechanism immune to the Next 15.5.x router-drop defect).
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
};

export function PeriodPanel({ activePeriod, detail, from, to }: Props) {
  const [customRange, setCustomRange] = useState<DateRange>({ from, to });
  const customActive = activePeriod === "custom";

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    window.location.assign(`?${params.toString()}`);
  }

  function pick(preset: PeriodPreset) {
    setCustomRange({ from: null, to: null });
    updateParams({ period: preset, from: null, to: null });
  }

  function handleCustomRangeChange(range: DateRange) {
    setCustomRange(range);
    if (range.from && range.to) updateParams({ period: "custom", from: range.from, to: range.to });
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
            onClick={() => pick("custom")}
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
