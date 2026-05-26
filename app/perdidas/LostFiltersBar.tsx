"use client";

import Link from "next/link";

import { LOST_TIME_BUCKETS, type LostListingFilters } from "@/lib/lost-listing";

// URL-driven filters bar — every change submits a GET form so the URL
// stays the source of truth (D11). No client state, no hydration mismatch.

const SPECIES_OPTIONS = [
  { value: "dog", label: "Perros" },
  { value: "cat", label: "Gatos" },
  { value: "rabbit", label: "Conejos" },
  { value: "guinea_pig", label: "Cobayos" },
  { value: "ferret", label: "Hurones" },
] as const;

const VISTO_LABELS: Record<string, string> = {
  today: "Hoy",
  week: "Esta semana",
  month: "Este mes",
};

export function LostFiltersBar({ filters }: { filters: LostListingFilters }) {
  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined);

  return (
    <form
      action="/perdidas"
      method="GET"
      className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <div>
          <label htmlFor="species" className="block text-xs text-neutral-500 mb-1">
            Especie
          </label>
          <select
            id="species"
            name="species"
            defaultValue={filters.species ?? ""}
            className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
          >
            <option value="">Todas</option>
            {SPECIES_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="provincia" className="block text-xs text-neutral-500 mb-1">
            Provincia
          </label>
          <input
            id="provincia"
            type="text"
            name="provincia"
            defaultValue={filters.province ?? ""}
            placeholder="Ej: Buenos Aires"
            className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
          />
        </div>

        <div>
          <label htmlFor="localidad" className="block text-xs text-neutral-500 mb-1">
            Localidad
          </label>
          <input
            id="localidad"
            type="text"
            name="localidad"
            defaultValue={filters.locality ?? ""}
            placeholder="Ej: La Plata"
            className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
          />
        </div>

        <div>
          <label htmlFor="color" className="block text-xs text-neutral-500 mb-1">
            Color
          </label>
          <input
            id="color"
            type="text"
            name="color"
            defaultValue={filters.color ?? ""}
            placeholder="Ej: negro, atigrado"
            className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
          />
        </div>

        <div>
          <label htmlFor="visto" className="block text-xs text-neutral-500 mb-1">
            ¿Cuándo se perdió?
          </label>
          <select
            id="visto"
            name="visto"
            defaultValue={filters.visto ?? ""}
            className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
          >
            <option value="">Cualquier momento</option>
            {LOST_TIME_BUCKETS.map((b) => (
              <option key={b} value={b}>
                {VISTO_LABELS[b]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs items-center pt-1">
        <CheckBox name="con_chip" checked={filters.hasMicrochip === true} label="Con microchip" />
        <CheckBox name="castrado" checked={filters.isSterilized === true} label="Castrado/a" />
        <CheckBox
          name="criticidad"
          value="critical"
          checked={filters.criticality === "critical"}
          label="Crítica (últimas 24h)"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {hasActiveFilters && (
          <Link
            href="/perdidas"
            className="px-3 py-1.5 rounded text-xs border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            Limpiar
          </Link>
        )}
        <button
          type="submit"
          className="px-4 py-1.5 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700"
        >
          Buscar
        </button>
      </div>
    </form>
  );
}

function CheckBox({
  name,
  checked,
  label,
  value = "true",
}: {
  name: string;
  checked: boolean;
  label: string;
  value?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="h-3.5 w-3.5"
      />
      <span className="text-neutral-700 dark:text-neutral-300">{label}</span>
    </label>
  );
}
