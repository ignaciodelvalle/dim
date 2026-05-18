"use client";

// Common species seen in the catalog today. Extend when new ones land; the
// pets.species column is free text so we hard-code the small set here.
const SPECIES_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "dog", label: "Perros" },
  { code: "cat", label: "Gatos" },
];

const labelClass = "text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500";
const fieldClass =
  "text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50";

export function LostFiltersBar({
  days,
  species,
}: {
  days: number;
  species: string | null;
}) {
  return (
    <form
      method="GET"
      action="/gob/perdidas"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3"
    >
      <label className="space-y-1">
        <span className={labelClass}>Período</span>
        <select name="days" defaultValue={String(days)} className={fieldClass}>
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
          <option value="365">Último año</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className={labelClass}>Especie</span>
        <select name="species" defaultValue={species ?? ""} className={fieldClass}>
          <option value="">Todas</option>
          {SPECIES_OPTIONS.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
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
