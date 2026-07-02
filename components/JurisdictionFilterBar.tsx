"use client";

import { usePathname, useSearchParams } from "next/navigation";

// Shared filter bar for /gob/* pages. Drives state via URL search params so
// refresh, share, and back-button all behave correctly. The pattern matches
// /gob/vigilancia's existing `days` + `disease` searchParams contract.
//
// Time chips: hoy | semana | mes (default) | 30d | custom (custom = not wired
// yet — opens a date picker in a future iteration).
//
// Jurisdiction dropdowns: provincia + localidad + tipo. The localidad list is
// expected to come from `arLocalities` (server-side), passed in via props so
// this component stays free of @/db imports.
//
// Spec: docs/gob-dashboard-plan-2026-05-20.md — Phase 1.
//
// Design note (router-drop defect, same cure as components/gob/JurisdictionSwitcher.tsx):
// Next 15.5.18's App Router can silently drop a client transition's own fetch in
// production — the RSC request resolves 200 but the URL and UI never update.
// /gob/page.tsx server-renders the KPI strip from these searchParams on every
// request, so a `router.replace` transition is exposed to the drop. A full
// document navigation (`window.location.assign`) is the one mechanism proven
// immune — the browser's native GET cannot be silently dropped, and it always
// re-runs the server component with the new searchParams.
//
// NOTE: TimeRange, RANGE_ORDER, and readFilterParams live in
// jurisdiction-filter-params.ts (non-client) so server components can import
// them without crossing the "use client" boundary. Re-exported here for
// backward compatibility with any existing client-side importers; server
// components must import directly from jurisdiction-filter-params.ts.
export type { TimeRange } from "./jurisdiction-filter-params";
export { RANGE_ORDER, readFilterParams } from "./jurisdiction-filter-params";

import { RANGE_ORDER, type TimeRange } from "./jurisdiction-filter-params";

export interface JurisdictionOption {
  value: string;
  label: string;
}

interface Props {
  /** Active time range (read from URL on the server, passed in). */
  range: TimeRange;
  /** Active province slug or empty for "todas". */
  province: string;
  /** Active locality slug or empty for "todas". */
  locality: string;
  /** Active org-type slug or empty for "todos". */
  orgType: string;
  /** Provincia options. Pass [] to hide the dropdown. */
  provinces: JurisdictionOption[];
  /** Localidad options scoped to the active province. Pass [] to hide. */
  localities: JurisdictionOption[];
  /** Org-type options. Pass [] to hide. */
  orgTypes: JurisdictionOption[];
}

const RANGE_LABELS: Record<TimeRange, string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  mes: "Este mes",
  "30d": "Últimos 30 días",
  custom: "Personalizado",
};

export function JurisdictionFilterBar({
  range,
  province,
  locality,
  orgType,
  provinces,
  localities,
  orgTypes,
}: Props) {
  const pathname = usePathname();
  const search = useSearchParams();

  function navigate(updates: Record<string, string | null>) {
    const params = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    // When province changes, the locality scope is no longer valid.
    if ("province" in updates) params.delete("locality");
    const qs = params.toString();
    window.location.assign(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <fieldset
      className="flex flex-wrap items-center gap-2 border-0 p-0 m-0 min-w-0"
      aria-label="Filtros de jurisdicción y tiempo"
    >
      {/* Time-range chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGE_ORDER.map((r) => {
          const active = r === range;
          return (
            <button
              key={r}
              type="button"
              onClick={() => navigate({ range: r === "mes" ? null : r })}
              aria-pressed={active}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                active
                  ? "bg-ln-op-celeste text-white"
                  : "bg-ln-op-card text-ln-op-ink-2 ring-1 ring-ln-op-line hover:bg-ln-op-stripe"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-w-0" />

      {/* Jurisdiction selects */}
      {provinces.length > 0 && (
        <FilterSelect
          label="Provincia"
          value={province}
          options={[{ value: "", label: "Todas" }, ...provinces]}
          onChange={(v) => navigate({ province: v })}
        />
      )}
      {localities.length > 0 && (
        <FilterSelect
          label="Localidad"
          value={locality}
          options={[{ value: "", label: "Todas" }, ...localities]}
          onChange={(v) => navigate({ locality: v })}
        />
      )}
      {orgTypes.length > 0 && (
        <FilterSelect
          label="Tipo"
          value={orgType}
          options={[{ value: "", label: "Todos" }, ...orgTypes]}
          onChange={(v) => navigate({ orgType: v })}
        />
      )}
    </fieldset>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: JurisdictionOption[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <span className="text-ln-op-mute">{label}</span>
      <select
        className="rounded-md border border-ln-op-line bg-ln-op-card px-2 py-1 text-xs text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
