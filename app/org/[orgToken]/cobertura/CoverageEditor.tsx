"use client";

// CoverageEditor — interactive province + locality picker with zone table.
//
// Province selection drives a searchParam update so the server can pass down
// the correct localities list (same pattern as JurisdictionSwitcher pages).
// Locality options are pre-loaded by the server page and passed as a prop.

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import type { OrganizationCoverage } from "@/db";
import type { LocalityOption } from "@/lib/ar-localidades";
import type { Province } from "@/lib/reference/ar-provincias";
import {
  addCoverageZoneAction,
  removeCoverageZoneAction,
  setPrimaryCoverageZoneAction,
} from "@/src/modules/organizations/actions";

const selectClasses =
  "min-h-11 px-3 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink " +
  "focus:border-ln-op-azul focus:outline-none focus:ring-1 focus:ring-ln-op-azul " +
  "disabled:opacity-50 disabled:cursor-not-allowed w-full";

const labelClasses = "text-sm font-medium text-ln-op-mute";

type Props = {
  orgToken: string;
  provinces: readonly Province[];
  localities: LocalityOption[];
  zones: OrganizationCoverage[];
  canManage: boolean;
};

export function CoverageEditor({ orgToken, provinces, localities, zones, canManage }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedProvinceCode = searchParams.get("province") ?? "";
  const selectedProvince = provinces.find((p) => p.code === selectedProvinceCode) ?? null;

  const [selectedLocality, setSelectedLocality] = useState<string>("");

  function handleProvinceChange(code: string) {
    setSelectedLocality("");
    setError(null);
    const params = new URLSearchParams(searchParams.toString());
    if (code) {
      params.set("province", code);
    } else {
      params.delete("province");
    }
    params.delete("locality");
    router.replace(`/org/${orgToken}/cobertura?${params.toString()}`, { scroll: false });
  }

  function handleAdd() {
    if (!selectedProvince) return;
    setError(null);
    startTransition(async () => {
      const result = await addCoverageZoneAction({
        orgToken,
        province: selectedProvince.name,
        locality: selectedLocality || null,
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        setSelectedLocality("");
      }
    });
  }

  function handleRemove(coverageId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeCoverageZoneAction({ orgToken, coverageId });
      if ("error" in result) setError(result.error);
    });
  }

  function handleSetPrimary(coverageId: string) {
    setError(null);
    startTransition(async () => {
      const result = await setPrimaryCoverageZoneAction({ orgToken, coverageId });
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card p-5 space-y-4">
          <h2 className="text-md font-semibold text-ln-op-ink">Agregar zona de cobertura</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="province-select" className={labelClasses}>
                Provincia
              </label>
              <select
                id="province-select"
                className={selectClasses}
                value={selectedProvinceCode}
                onChange={(e) => handleProvinceChange(e.target.value)}
                disabled={pending}
              >
                <option value="">Seleccioná una provincia…</option>
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="locality-select" className={labelClasses}>
                Localidad
              </label>
              <select
                id="locality-select"
                className={selectClasses}
                value={selectedLocality}
                onChange={(e) => setSelectedLocality(e.target.value)}
                disabled={pending || !selectedProvinceCode}
              >
                <option value="">Toda la provincia</option>
                {localities.map((l) => (
                  <option key={l.slug} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-ln-op-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleAdd}
            disabled={pending || !selectedProvinceCode}
            className="inline-flex items-center gap-2 rounded-full bg-ln-op-azul px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ln-op-azul-700 disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Agregar zona"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-md font-semibold text-ln-op-ink">Zonas registradas ({zones.length})</h2>

        {zones.length === 0 ? (
          <p className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-4 py-6 text-center text-[13px] text-ln-op-mute">
            Esta organización aún no tiene zonas de cobertura configuradas.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[6px] border border-ln-op-line bg-ln-op-card">
            <table className="w-full text-[13px]">
              <caption className="sr-only">
                Zonas de cobertura de la organización por provincia y localidad
              </caption>
              <thead>
                <tr className="border-b border-ln-op-line bg-ln-op-stripe">
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-sm font-medium text-ln-op-mute"
                  >
                    Provincia
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-sm font-medium text-ln-op-mute"
                  >
                    Localidad
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-sm font-medium text-ln-op-mute"
                  >
                    Principal
                  </th>
                  {canManage && (
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-sm font-medium text-ln-op-mute"
                    >
                      Acciones
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ln-op-line">
                {zones.map((zone) => (
                  <tr key={zone.id} className="hover:bg-ln-op-stripe/60">
                    <td className="px-4 py-3 text-ln-op-ink">{zone.jurisdictionProvince}</td>
                    <td className="px-4 py-3 text-ln-op-ink">
                      {zone.jurisdictionLocality ?? (
                        <span className="italic text-ln-op-mute">Toda la provincia</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {zone.isPrimary ? (
                        <span className="inline-flex items-center rounded-full bg-ln-op-blue-bg px-2.5 py-0.5 text-[11px] font-medium text-ln-op-azul border border-ln-op-blue-bd">
                          Principal
                        </span>
                      ) : (
                        <span className="text-ln-op-mute">—</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          {!zone.isPrimary && (
                            <button
                              type="button"
                              onClick={() => handleSetPrimary(zone.id)}
                              disabled={pending}
                              className="rounded-full border border-ln-op-line px-3 py-1 text-sm font-medium text-ln-op-ink transition-colors hover:bg-ln-op-stripe disabled:opacity-60"
                            >
                              Marcar principal
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemove(zone.id)}
                            disabled={pending}
                            className="rounded-full border border-ln-op-danger-bd px-3 py-1 text-sm font-medium text-ln-op-danger transition-colors hover:bg-ln-op-danger hover:text-white disabled:opacity-60"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
