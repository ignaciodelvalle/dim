"use client";

// Client-side filter bar for /gob/vigilancia. Submits via a real GET form so
// the URL stays the source of truth — server component re-reads the params
// and re-queries. No client state to keep in sync with the URL.

import { DISEASES } from "@/lib/diseases";

const labelClass = "text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500";
const fieldClass =
  "text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50";

const REPORTABLE = DISEASES.filter((d) => d.reportable);

export function SurveillanceFiltersBar({
  days,
  diseaseCode,
}: {
  days: number;
  diseaseCode: string | null;
}) {
  return (
    <form
      method="GET"
      action="/gob/vigilancia"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3"
    >
      <label className="space-y-1">
        <span className={labelClass}>Período</span>
        <select name="days" defaultValue={String(days)} className={fieldClass}>
          <option value="1">Últimas 24h</option>
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className={labelClass}>Enfermedad</span>
        <select name="disease" defaultValue={diseaseCode ?? ""} className={fieldClass}>
          <option value="">Todas</option>
          {REPORTABLE.map((d) => (
            <option key={d.code} value={d.code}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="text-sm rounded-md bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 px-3 py-1.5 hover:opacity-90"
      >
        Aplicar
      </button>
    </form>
  );
}
