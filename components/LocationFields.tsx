"use client";

// Shared location form section. Replaces the three independent
// implementations in PetForm, WelfareReportForm, and MarkLostForm.
//
// Four modes match the three layers of location described in
// AGENTS.md → Aggregation & privacy policy (admin jurisdiction / point /
// postal address) in the combinations the existing forms need:
//
//   point                — just the map picker (used by "marcar perdida")
//   jurisdiction         — province + locality only (used by PetForm)
//   jurisdiction+point   — both above (org coverage, vet visits later)
//   full                 — postal address + jurisdiction + point (welfare)
//
// Form wire format the consuming server action MUST read:
//   provinceCode    — ISO 3166-2:AR code (string). Resolve via provinceByCode.
//   localityName    — display string (free text). Stored as-is for now;
//                     canonical ar_localities lookup comes when gov dashboards
//                     justify it.
//   locationLat     — decimal latitude (string). Pass to writePoint.
//   locationLng     — decimal longitude (string). Pass to writePoint.
//   locationAddress — free-text street / corner / reference (string, "full" mode).

import { PROVINCES } from "@/lib/ar-provincias";
import dynamic from "next/dynamic";
import { useState } from "react";

const LocationPicker = dynamic(() => import("./LocationPicker"), {
  loading: () => (
    <div className="w-full h-64 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 animate-pulse" />
  ),
});

export type LocationMode = "point" | "jurisdiction" | "jurisdiction+point" | "full";

export type LocationFieldsValue = {
  provinceCode?: string | null;
  localityName?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
};

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent";

const labelClass = "block text-sm font-medium text-neutral-900 dark:text-neutral-50";

export function LocationFields({
  mode,
  defaultValue,
}: {
  mode: LocationMode;
  defaultValue?: LocationFieldsValue;
}) {
  const includesJurisdiction =
    mode === "jurisdiction" || mode === "jurisdiction+point" || mode === "full";
  const includesPoint = mode === "point" || mode === "jurisdiction+point" || mode === "full";
  const includesAddress = mode === "full";

  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    defaultValue?.lat != null && defaultValue?.lng != null
      ? { lat: defaultValue.lat, lng: defaultValue.lng }
      : null,
  );
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  function handleUseMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalización.");
      return;
    }
    setGeoError(null);
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLoading(false);
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Permiso de ubicación denegado. Podés tocar el mapa para marcar el punto."
            : "No se pudo obtener tu ubicación. Tocá el mapa para marcarla.",
        );
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="space-y-4">
      {includesAddress && (
        <div className="space-y-1.5">
          <label htmlFor="locationAddress" className={labelClass}>
            Dirección o referencia
          </label>
          <input
            id="locationAddress"
            name="locationAddress"
            type="text"
            placeholder="Calle y altura, esquina, o referencia visible"
            defaultValue={defaultValue?.address ?? ""}
            className={inputClass}
          />
        </div>
      )}

      {includesJurisdiction && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="provinceCode" className={labelClass}>
              Provincia
            </label>
            <select
              id="provinceCode"
              name="provinceCode"
              defaultValue={defaultValue?.provinceCode ?? ""}
              className={inputClass}
            >
              <option value="">No especificar</option>
              {PROVINCES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="localityName" className={labelClass}>
              Barrio o localidad
            </label>
            <input
              id="localityName"
              name="localityName"
              type="text"
              placeholder="Palermo, Tigre, …"
              defaultValue={defaultValue?.localityName ?? ""}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {includesPoint && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className={labelClass}>Ubicación precisa (opcional)</p>
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={geoLoading}
              className="text-xs text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 disabled:opacity-50"
            >
              {geoLoading ? "Obteniendo…" : "Usar mi ubicación"}
            </button>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-500">
            Tocá el mapa para marcar el punto, o usá el botón si estás en el lugar.
          </p>
          <LocationPicker value={point} onChange={setPoint} />
          {geoError && (
            <p className="text-xs text-amber-700 dark:text-amber-400" role="alert">
              {geoError}
            </p>
          )}
          {point && (
            <p className="text-xs text-neutral-500 dark:text-neutral-500 font-mono">
              {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
            </p>
          )}
          {/* Hidden inputs carry the picked coords through the standard form
              submit. Empty strings when no point is set — the server actions
              already treat empty as null via writePoint(null). */}
          <input type="hidden" name="locationLat" value={point ? String(point.lat) : ""} />
          <input type="hidden" name="locationLng" value={point ? String(point.lng) : ""} />
        </div>
      )}
    </div>
  );
}
