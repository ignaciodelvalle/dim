// Shared (non-client) module for the JurisdictionFilterBar param types and
// server-side helper. Extracted from JurisdictionFilterBar.tsx so server
// components can import readFilterParams without pulling in the "use client"
// boundary of the full filter bar.

export type TimeRange = "hoy" | "semana" | "mes" | "30d" | "custom";

export const RANGE_ORDER: ReadonlyArray<TimeRange> = ["hoy", "semana", "mes", "30d", "custom"];

// Server-side helper: parse the search params shape into a typed bag the
// dashboard page can pass back into the FilterBar (so the URL is the source
// of truth and the server reads it once).
export function readFilterParams(sp: URLSearchParams) {
  const rangeRaw = sp.get("range") ?? "mes";
  const range: TimeRange = (RANGE_ORDER as ReadonlyArray<string>).includes(rangeRaw)
    ? (rangeRaw as TimeRange)
    : "mes";
  return {
    range,
    province: sp.get("province") ?? "",
    locality: sp.get("locality") ?? "",
    orgType: sp.get("orgType") ?? "",
  };
}
