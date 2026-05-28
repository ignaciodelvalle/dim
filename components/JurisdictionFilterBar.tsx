"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

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

export type TimeRange = "hoy" | "semana" | "mes" | "30d" | "custom";

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

const RANGE_ORDER: ReadonlyArray<TimeRange> = ["hoy", "semana", "mes", "30d", "custom"];

export function JurisdictionFilterBar({
  range,
  province,
  locality,
  orgType,
  provinces,
  localities,
  orgTypes,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  function navigate(updates: Record<string, string | null>) {
    const params = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    // When province changes, the locality scope is no longer valid.
    if ("province" in updates) params.delete("locality");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <fieldset
      className={`flex flex-wrap items-center gap-2 border-0 p-0 m-0 min-w-0 ${pending ? "opacity-70" : ""}`}
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
                  ? "bg-gob-info text-white "
                  : "bg-white text-gob-text-gray ring-1 ring-gob-border-strong hover:bg-gob-surface-alt    "
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
      <span className="text-gob-text-muted ">{label}</span>
      <select
        className="rounded-md border border-gob-border bg-white px-2 py-1 text-xs text-gob-text    focus:outline-none focus:ring-2 focus:ring-gob-azul-link"
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
