"use client";

// Client-side search filter form for /turnos/buscar.
//
// Replaces the plain locality/province text inputs with LocalityPickerAcross
// so users get autocomplete across the full ar_localities catalog. The picker
// emits rich hidden inputs; we mirror the picked result into `locality` and
// `province` hidden inputs that the server page reads via searchParams —
// same wire contract as before.

import { useState } from "react";

import { LocalityPickerAcross } from "@/components/LocalityPickerAcross";
import { LnCheckbox } from "@/components/ui/Field";
import type { LocalitySearchResult } from "@/lib/infra/ar-localidades";
import { SERVICE_KINDS } from "@/lib/reference/service-kinds";

type Props = {
  currentServiceKind: string;
  currentProvince: string;
  currentLocality: string;
  currentFechaDesde: string;
  currentSoloGratis: boolean;
};

export function SearchFiltersForm({
  currentServiceKind,
  currentProvince,
  currentLocality,
  currentFechaDesde,
  currentSoloGratis,
}: Props) {
  // Track the selected locality result so we can derive locality + province
  // for the GET params. Pre-filled from the current search-param values so
  // the form renders the active filter on page load.
  const [pickedLocality, setPickedLocality] = useState<string>(currentLocality);
  const [pickedProvince, setPickedProvince] = useState<string>(currentProvince);

  function handleSelect(result: LocalitySearchResult | null) {
    if (result) {
      setPickedLocality(result.localityName);
      setPickedProvince(result.provinceName);
    } else {
      setPickedLocality("");
      setPickedProvince("");
    }
  }

  // Free-text typing (no dropdown pick): submit the typed locality and clear
  // the derived province — it can't be inferred from raw text, and keeping a
  // previously-picked province would submit a stale value.
  function handleQueryChange(query: string) {
    setPickedLocality(query);
    setPickedProvince("");
  }

  return (
    <form method="GET" className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <label htmlFor="service_kind_sel" className="text-xs text-[var(--color-ln-mute)]">
            Servicio
          </label>
          <select
            id="service_kind_sel"
            name="service_kind"
            defaultValue={currentServiceKind}
            className="text-sm border border-[var(--color-ln-line)] rounded-[4px] px-2 py-1.5 bg-[var(--color-ln-card)] text-[var(--color-ln-ink)] outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
          >
            {SERVICE_KINDS.map((k) => (
              <option key={k.code} value={k.code}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        {/* Locality autocomplete — replaces the two plain text inputs.
            LocalityPickerAcross searches ar_localities across all provinces.
            The picker renders its own hidden inputs (provinceCode, provinceName,
            localityName, localityNameIndecId) for other consumers; we
            additionally mirror the pick into `locality` and `province` hidden
            inputs which are the names the BuscarTurnosPage searchParams expect. */}
        <div className="space-y-1">
          <label htmlFor="locality_picker" className="text-xs text-[var(--color-ln-mute)]">
            Localidad
          </label>
          <div className="w-64">
            <LocalityPickerAcross
              id="locality_picker"
              defaultValue={{
                localityName: currentLocality || null,
                provinceName: currentProvince || null,
              }}
              placeholder="Ej: Palermo, La Plata…"
              onSelect={handleSelect}
              onQueryChange={handleQueryChange}
            />
          </div>
        </div>

        {/* Hidden inputs wired to the GET query string names the page expects. */}
        <input type="hidden" name="locality" value={pickedLocality} />
        <input type="hidden" name="province" value={pickedProvince} />

        <button
          type="submit"
          className="text-sm px-4 py-1.5 rounded-[3px] bg-[var(--color-ln-azul)] text-white hover:bg-[var(--color-ln-azul-700)] transition-colors"
        >
          Buscar
        </button>
      </div>

      {/* Fase 10: additional filters — fecha_desde + solo_gratis */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <label htmlFor="fecha_desde_inp" className="text-xs text-[var(--color-ln-mute)]">
            Desde
          </label>
          <input
            id="fecha_desde_inp"
            name="fecha_desde"
            type="date"
            defaultValue={currentFechaDesde}
            className="text-sm border border-[var(--color-ln-line)] rounded-[4px] px-2 py-1.5 bg-[var(--color-ln-card)] text-[var(--color-ln-ink)] outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
          />
        </div>
        <LnCheckbox name="solo_gratis" value="true" defaultChecked={currentSoloGratis}>
          Solo campañas gratuitas
        </LnCheckbox>
      </div>
    </form>
  );
}
