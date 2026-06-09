"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";

/**
 * Selector de jurisdicción: provincia → localidad.
 *
 * Dos `<select>` nativos. El primero lista las provincias permitidas para el usuario
 * (manejadas por `govt_assignments` en el call site). El segundo lista las localidades
 * de la provincia seleccionada (el caller es responsable de fetchear esa lista).
 *
 * Comportamiento:
 *  - Al cambiar provincia, la localidad se limpia automáticamente.
 *  - Los cambios actualizan los searchParams vía `router.replace` con `scroll: false`,
 *    preservando todos los demás params presentes en la URL.
 *  - Si `allowedProvinces` tiene más de un elemento, el select de provincia incluye
 *    una opción vacía "Todas" para scope nacional.
 *  - El select de localidad queda `disabled` si no hay provincia seleccionada o si
 *    `localities` está vacío.
 *
 * Accesibilidad:
 *  - Cada select tiene un `<label>` vinculado via `htmlFor`.
 *  - Touch target mínimo de 44px (`min-h-11`).
 */

export type JurisdictionScope = {
  /** Código ISO 3166-2:AR. Ej: "AR-C" para CABA. null = scope nacional. */
  province: string | null;
  /** Slug de localidad. null si no aplica o no se seleccionó. */
  locality: string | null;
};

export type JurisdictionSwitcherProps = {
  /**
   * Provincias a las que el usuario tiene acceso.
   * Array vacío = acceso solo nacional.
   */
  allowedProvinces: Array<{ code: string; name: string }>;
  /** Localidades de la provincia actualmente seleccionada. El caller las fetchea. */
  localities?: Array<{ slug: string; name: string }>;
  /**
   * Claves de searchParam usadas para persistir la selección.
   * Default: { province: "province", locality: "locality" }.
   */
  paramKeys?: { province: string; locality: string };
  className?: string;
};

const selectClasses =
  "min-h-11 px-3 rounded-lg border border-ln-line bg-ln-card text-sm text-ln-ink " +
  "focus:border-ln-azul focus:outline-none focus:ring-2 focus:ring-ln-azul/20 " +
  "disabled:opacity-50 disabled:cursor-not-allowed w-full";

const labelClasses = "text-sm font-medium text-ln-ink-2";

export function JurisdictionSwitcher({
  allowedProvinces,
  localities = [],
  paramKeys = { province: "province", locality: "locality" },
  className = "",
}: JurisdictionSwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = useId();

  const provinceId = `${uid}-province`;
  const localityId = `${uid}-locality`;

  const selectedProvince = searchParams.get(paramKeys.province) ?? "";
  const selectedLocality = searchParams.get(paramKeys.locality) ?? "";

  const showNationalOption = allowedProvinces.length > 1;

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function handleProvinceChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    // Al cambiar provincia siempre limpiamos la localidad.
    updateParams({
      [paramKeys.province]: value || null,
      [paramKeys.locality]: null,
    });
  }

  function handleLocalityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    updateParams({ [paramKeys.locality]: value || null });
  }

  const localityDisabled = !selectedProvince || localities.length === 0;

  return (
    <div className={`flex flex-col sm:flex-row gap-4 sm:items-end ${className}`.trim()}>
      {/* Provincia */}
      <div className="flex flex-col gap-1 flex-1">
        <label htmlFor={provinceId} className={labelClasses}>
          Provincia
        </label>
        <select
          id={provinceId}
          value={selectedProvince}
          onChange={handleProvinceChange}
          className={selectClasses}
        >
          {showNationalOption && <option value="">Todas</option>}
          {allowedProvinces.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Localidad */}
      <div className="flex flex-col gap-1 flex-1">
        <label htmlFor={localityId} className={labelClasses}>
          Localidad
        </label>
        <select
          id={localityId}
          value={selectedLocality}
          onChange={handleLocalityChange}
          disabled={localityDisabled}
          className={selectClasses}
        >
          <option value="">Todas</option>
          {localities.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
