"use client";

import Link from "next/link";

import {
  ADOPTION_AGE_BUCKETS,
  ADOPTION_ENERGY_LEVELS,
  ADOPTION_SIZE_ESTIMATES,
  type AdoptionListingFilters,
} from "@/lib/adoption-listing";

// URL-driven filters bar — every change submits a GET form so the URL
// stays the source of truth (D11). No client state, no hydration mismatch.

const SPECIES_OPTIONS = [
  { value: "dog", label: "Perros" },
  { value: "cat", label: "Gatos" },
  { value: "rabbit", label: "Conejos" },
  { value: "guinea_pig", label: "Cobayos" },
  { value: "ferret", label: "Hurones" },
] as const;

const AGE_LABELS: Record<string, string> = {
  puppy: "Cachorra/o",
  junior: "Junior",
  young: "Joven",
  adult: "Adulto/a",
  senior: "Senior",
};

const SIZE_LABELS: Record<string, string> = {
  small: "Chico",
  medium: "Mediano",
  large: "Grande",
  xl: "Extra grande",
};

const ENERGY_LABELS: Record<string, string> = {
  low: "Tranquilo",
  medium: "Moderado",
  high: "Activo",
};

export function AdoptionFiltersBar({ filters }: { filters: AdoptionListingFilters }) {
  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined);

  return (
    <form
      action="/adoptar"
      method="GET"
      className="rounded-lg border border-gob-border p-4 space-y-3"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <div>
          <label htmlFor="species" className="block text-xs text-gob-text-muted mb-1">
            Especie
          </label>
          <select
            id="species"
            name="species"
            defaultValue={filters.species ?? ""}
            className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
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
          <label htmlFor="provincia" className="block text-xs text-gob-text-muted mb-1">
            Provincia
          </label>
          <input
            id="provincia"
            type="text"
            name="provincia"
            defaultValue={filters.province ?? ""}
            placeholder="Ej: Buenos Aires"
            className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
          />
        </div>

        <div>
          <label htmlFor="localidad" className="block text-xs text-gob-text-muted mb-1">
            Localidad
          </label>
          <input
            id="localidad"
            type="text"
            name="localidad"
            defaultValue={filters.locality ?? ""}
            placeholder="Ej: La Plata"
            className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
          />
        </div>

        <div>
          <label htmlFor="edad" className="block text-xs text-gob-text-muted mb-1">
            Edad
          </label>
          <select
            id="edad"
            name="edad"
            defaultValue={filters.ageBucket ?? ""}
            className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
          >
            <option value="">Cualquiera</option>
            {ADOPTION_AGE_BUCKETS.map((b) => (
              <option key={b} value={b}>
                {AGE_LABELS[b]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="talle" className="block text-xs text-gob-text-muted mb-1">
            Talle
          </label>
          <select
            id="talle"
            name="talle"
            defaultValue={filters.sizeEstimate ?? ""}
            className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
          >
            <option value="">Cualquiera</option>
            {ADOPTION_SIZE_ESTIMATES.map((s) => (
              <option key={s} value={s}>
                {SIZE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="energia" className="block text-xs text-gob-text-muted mb-1">
            Energía
          </label>
          <select
            id="energia"
            name="energia"
            defaultValue={filters.energyLevel ?? ""}
            className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
          >
            <option value="">Cualquiera</option>
            {ADOPTION_ENERGY_LEVELS.map((e) => (
              <option key={e} value={e}>
                {ENERGY_LABELS[e]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs items-center pt-1">
        <CheckBox
          name="con_chicos"
          checked={filters.goodWithKids === true}
          label="Convive bien con chicos"
        />
        <CheckBox
          name="con_perros"
          checked={filters.goodWithDogs === true}
          label="Convive bien con perros"
        />
        <CheckBox
          name="con_gatos"
          checked={filters.goodWithCats === true}
          label="Convive bien con gatos"
        />
        <CheckBox
          name="sin_patio"
          checked={filters.needsYard === false}
          label="Sin patio requerido"
        />
        <CheckBox name="con_chip" checked={filters.hasMicrochip === true} label="Con microchip" />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {hasActiveFilters && (
          <Link
            href="/adoptar"
            className="px-3 py-1.5 rounded text-xs border border-gob-border-strong hover:bg-gob-surface-alt"
          >
            Limpiar
          </Link>
        )}
        <button
          type="submit"
          className="px-4 py-1.5 rounded bg-gob-primary text-white text-xs font-medium"
        >
          Aplicar filtros
        </button>
      </div>
    </form>
  );
}

function CheckBox({
  name,
  checked,
  label,
}: {
  name: string;
  checked: boolean;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={checked}
        className="h-3.5 w-3.5"
      />
      <span className="text-gob-text-gray">{label}</span>
    </label>
  );
}
