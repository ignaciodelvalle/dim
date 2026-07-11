"use client";

// PeriodSegmented — the v2C single-line period control (top-right cluster):
// segmented 7 días · 30 días · 90 días · 12 meses + a dashed «▾ más» menu
// (Año en curso / 3 años / 5 años / Personalizado…). When a "más" option is
// active the button shows its name and flips to the active style (spec).
//
// COMMIT SEMANTICS ARE PeriodPicker's, verbatim (URL param contract unchanged
// — task #21 hard rule): selecting a preset sets ?period=<id> and clears
// ?from/?to via a FULL document navigation (window.location.assign — the one
// mechanism immune to the Next 15.5.x router-drop defect; see PeriodPicker's
// design note). "Personalizado…" sets ?period=custom and reveals the
// DateRangePicker inside the menu. The active chip prefers the console's
// COMMITTED period (a shallow preset commit isn't visible to useSearchParams)
// — same W2 contract as PeriodPicker.

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { DateRangePicker } from "@/components/gob/DateRangePicker";
import type { DateRange } from "@/components/gob/DateRangePicker";
import type { PeriodPreset } from "@/components/gob/PeriodPicker";
import { OverlayDisclosure } from "@/components/panorama/OverlayDisclosure";
import { useCommittedPeriod } from "@/components/panorama/committed-period-context";
import { PANORAMA_DEFAULT_PRESET } from "@/lib/analytics/analytics-period";

const INLINE: ReadonlyArray<{ value: PeriodPreset; label: string }> = [
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

export function PeriodSegmented() {
  const searchParams = useSearchParams();
  const committedPeriod = useCommittedPeriod();
  const active =
    (committedPeriod as PeriodPreset | null) ??
    (searchParams.get("period") as PeriodPreset | null) ??
    (PANORAMA_DEFAULT_PRESET as PeriodPreset);

  const fromValue = searchParams.get("from") ?? null;
  const toValue = searchParams.get("to") ?? null;
  const [customRange, setCustomRange] = useState<DateRange>({ from: fromValue, to: toValue });

  // PeriodPicker's exact commit: full document navigation, other params kept.
  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
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
    if (range.from && range.to) {
      updateParams({ period: "custom", from: range.from, to: range.to });
    }
  }

  const activeMore = MORE.find((p) => p.value === active) ?? null;
  const customActive = active === "custom";
  const moreActive = activeMore !== null || customActive;

  return (
    <fieldset className="m-0 flex items-center gap-1.5 border-0 p-0">
      <legend className="sr-only">Período</legend>
      <div className="inline-flex overflow-hidden rounded-full border border-ln-op-line bg-ln-op-card">
        {INLINE.map(({ value, label }, i) => {
          const isActive = active === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isActive}
              onClick={() => pick(value)}
              className={`px-3 py-1 text-[var(--text-sm)] transition-colors ${
                i > 0 ? "border-l border-ln-op-line-2" : ""
              } ${
                isActive
                  ? "bg-ln-op-azul font-semibold text-white"
                  : "text-ln-op-ink-2 hover:bg-ln-op-stripe"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <OverlayDisclosure
        side="down"
        closeSignal={active}
        summaryClassName={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[var(--text-sm)] transition-colors ${
          moreActive
            ? "border-ln-op-azul bg-ln-op-azul/10 font-semibold text-ln-op-azul"
            : "border-dashed border-ln-op-line text-ln-op-mute hover:border-ln-op-azul hover:text-ln-op-azul"
        }`}
        panelClassName="right-0 w-56"
        summary={
          <>
            <span aria-hidden="true">▾</span>{" "}
            {customActive ? "Personalizado" : (activeMore?.label ?? "más")}
          </>
        }
      >
        <fieldset className="m-0 flex flex-col gap-0.5 border-0 p-0">
          <legend className="sr-only">Más períodos</legend>
          {MORE.map(({ value, label }) => {
            const isActive = active === value;
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
        </fieldset>
      </OverlayDisclosure>
    </fieldset>
  );
}
