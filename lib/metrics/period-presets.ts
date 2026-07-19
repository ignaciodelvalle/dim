// Shared period-preset id+label definitions (Item — dedupe sweep).
//
// <PeriodPicker> (components/gob/PeriodPicker.tsx) and <PeriodPanel>
// (components/panorama/PeriodPanel.tsx) each render their own preset chip
// list, tied together only by the shared `PeriodPreset` id union and
// `resolveAnalyticsPeriod` (lib/analytics/analytics-period.ts). Their two
// label tables used to be hand-copied in both files, which let a rename in
// one silently drift from the other.
//
// This module is the single source for the presets whose id AND label are
// IDENTICAL in both callers today. Each picker still decides which subset it
// EXPOSES and in what order/tiering (PeriodPicker's flat chip row vs
// PeriodPanel's Simple/Detalle two-tier rail) — only the shared (id, label)
// pairs live here.
//
// NOT centralized here — deliberately left local to each component:
//   "7d"          — PeriodPicker: "Últimos 7 días" · PeriodPanel: "7 días"
//   "trailing12m" — PeriodPicker: "Últimos 12 meses" · PeriodPanel: "12 meses"
// These two have surface-specific copy (PeriodPicker's fuller sentence vs
// PeriodPanel's terser rail label). Forcing one shared label would silently
// change visible UI text on one of the two surfaces, so they stay put — flag
// for a follow-up if a copy pass ever wants to unify them intentionally.

// Canonical preset id union. Owned here (not in PeriodPicker.tsx) so this
// module has no dependency on the "use client" component — PeriodPicker.tsx
// re-exports it as `PeriodPreset` so its existing consumers (PeriodPanel.tsx
// and friends) are unaffected.
export type PeriodPresetId = "7d" | "30d" | "90d" | "ytd" | "trailing12m" | "3y" | "5y" | "custom";

export type PeriodPresetOption = {
  value: PeriodPresetId;
  label: string;
};

export const PRESET_30D: PeriodPresetOption = { value: "30d", label: "30 días" };
export const PRESET_90D: PeriodPresetOption = { value: "90d", label: "90 días" };
export const PRESET_YTD: PeriodPresetOption = { value: "ytd", label: "Año en curso" };
export const PRESET_3Y: PeriodPresetOption = { value: "3y", label: "3 años" };
export const PRESET_5Y: PeriodPresetOption = { value: "5y", label: "5 años" };
