"use client";

// Shared location form section. Replaces the three independent
// implementations in PetForm, WelfareReportForm, and MarkLostForm.
//
// Four modes match the three layers of location described in
// AGENTS.md → Aggregation & privacy policy (admin jurisdiction / point /
// postal address) in the combinations the existing forms need:
//
//   point                — map picker + bidirectionally-synced description text
//                          (forms can opt-out of the integrated text by passing
//                          inputNames.description = null — not currently used)
//   jurisdiction         — province + locality only (used by PetForm)
//   jurisdiction+point   — both above (org coverage, vet visits later)
//   full                 — postal address + jurisdiction + point (welfare)
//
// Bidirectional geocoding (mode="point"):
//   - Typing in the description field (debounced 600ms) calls the Nominatim
//     proxy and centers the map on the top result.
//   - Dragging or clicking the map pin reverse-geocodes the new coords and
//     fills the description field with the OSM display_name.
//   - A skip flag prevents feedback loops between the two directions.
//   - On any geocoder failure or empty result, the form keeps working with
//     text + pin as independent fields (graceful degradation).
//
// Form wire format the consuming server action MUST read:
//   provinceCode    — ISO 3166-2:AR code (string). Resolve via provinceByCode.
//   localityName    — display string (free text). Stored as-is for now;
//                     canonical ar_localities lookup comes when gov dashboards
//                     justify it.
//   locationLat     — decimal latitude (string). Pass to writePoint.
//   locationLng     — decimal longitude (string). Pass to writePoint.
//   locationAddress — free-text street / corner / reference (string, "full" mode).
//   locationDescription — geocoded description text (string, "point" mode).
//                     Form can override the field name via inputNames.description
//                     to preserve a legacy contract (e.g. MarkLostForm uses
//                     "lastKnownLocation").

import {
  type GeocodeResult,
  geocodeAddressAction,
  reverseGeocodeAction,
} from "@/app/actions/geocoding";
import { LocalityCombobox } from "@/components/LocalityCombobox";
import { PROVINCES } from "@/lib/ar-provincias";
import { inputClass, labelClass } from "@/lib/form-classes";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const LocationPicker = dynamic(() => import("./LocationPicker"), {
  loading: () => (
    <div className="w-full h-64 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 animate-pulse" />
  ),
});

// Canonical names per the trilogy unification design rules (AGENTS.md §"Design
// rules" rule #1): L1 (jurisdiction only), L2 (jurisdiction + map + bidirectional
// text + optional postal address).
//
// Legacy names are still accepted with a deprecation console.warn so consumers
// can migrate at their own pace. The "point" and "jurisdiction+point" variants
// are deprecated wholesale — point-without-jurisdiction is a UX anti-pattern,
// and jurisdiction+point is just L2 without the bidirectional text. Consumers
// of those should move to "l2".
export type LocationMode =
  | "l1"
  | "l2"
  // --- deprecated, accepted for backward compatibility ---
  | "point"
  | "jurisdiction"
  | "jurisdiction+point"
  | "full";

// Normalize the public mode prop down to the internal feature flags. Legacy
// names are mapped to their canonical replacement and emit a deprecation
// warning at runtime (in dev only).
type CanonicalMode = "l1" | "l2" | "point";

function resolveMode(mode: LocationMode): CanonicalMode {
  if (mode === "l1" || mode === "l2" || mode === "point") return mode;
  let canonical: CanonicalMode;
  if (mode === "jurisdiction") canonical = "l1";
  else if (mode === "full" || mode === "jurisdiction+point") canonical = "l2";
  else canonical = "l2"; // unreachable, satisfies TS
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    console.warn(
      `[LocationFields] mode="${mode}" is deprecated. Use mode="${canonical}" — see AGENTS.md "Design rules" rule #1.`,
    );
  }
  return canonical;
}

export type LocationFieldsValue = {
  provinceCode?: string | null;
  localityName?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  description?: string | null;
};

const FORWARD_DEBOUNCE_MS = 600;
const MIN_QUERY_LENGTH = 3;

export function LocationFields({
  mode,
  defaultValue,
  biasProvince = null,
  biasLocality = null,
  inputNames,
  useMyLocationVariant = "secondary",
}: {
  mode: LocationMode;
  defaultValue?: LocationFieldsValue;
  // Geocoder bias hints. Used only when mode="point".
  biasProvince?: string | null;
  biasLocality?: string | null;
  // Hidden input names. Lets a form keep its server-side contract while
  // migrating to the integrated picker (MarkLostForm reads "lastKnownLocation",
  // not "locationDescription").
  inputNames?: { lat?: string; lng?: string; description?: string };
  // How prominent the "Usar mi ubicación actual" affordance should be.
  // "primary" renders a big leading button (used by MarkLost step 1 and the
  // public denuncia step 3 — when you're standing in front of the situation
  // the device geolocation is the fastest path). "secondary" keeps the
  // current inline link next to the map header (used by forms where the
  // location is provided after the fact). Defaults to "secondary".
  useMyLocationVariant?: "primary" | "secondary";
}) {
  const canonicalMode = resolveMode(mode);
  const includesJurisdiction = canonicalMode === "l1" || canonicalMode === "l2";
  const includesPoint = canonicalMode === "l2" || canonicalMode === "point";
  // L2 inherits the postal-address field from the legacy `full` mode; standalone
  // point and L1 do not. (When all `full` consumers have migrated to `l2`, the
  // postal address can be retired or pulled into a sibling `l3` mode.)
  const includesAddress = canonicalMode === "l2";
  // Only the standalone "point" mode gets the integrated, bidirectionally
  // synced description text. L2 already has locationAddress; L1 has nothing
  // to sync.
  const integratedDescription = canonicalMode === "point";

  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    defaultValue?.lat != null && defaultValue?.lng != null
      ? { lat: defaultValue.lat, lng: defaultValue.lng }
      : null,
  );
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  // Province state lifted from the uncontrolled <select> so LocalityCombobox
  // (which scopes its search to a province) can react to province changes.
  const [selectedProvinceCode, setSelectedProvinceCode] = useState<string>(
    defaultValue?.provinceCode ?? "",
  );

  // Description text + sync state. Only meaningful when integratedDescription
  // is true; cheap to keep declared unconditionally so hook order stays stable.
  const [description, setDescription] = useState<string>(defaultValue?.description ?? "");
  const [geocodeLoading, setGeocodeLoading] = useState<"none" | "forward" | "reverse">("none");
  const [geocodeResults, setGeocodeResults] = useState<GeocodeResult[]>([]);
  const [geocodeMessage, setGeocodeMessage] = useState<"empty" | "failed" | null>(null);
  // When the reverse handler fills the description from a pin move, the
  // forward effect must NOT re-geocode the auto-filled text. The same flag
  // covers the multi-result picker (clicking an entry fills the description).
  const skipNextForward = useRef(false);

  function handleUseMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalización.");
      return;
    }
    setGeoError(null);
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Treat this like a user-driven pin move so we reverse-geocode it.
        handlePointChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
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

  // Forward geocoding (description → coords), debounced.
  useEffect(() => {
    if (!integratedDescription) return;
    if (skipNextForward.current) {
      skipNextForward.current = false;
      return;
    }
    const trimmed = description.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setGeocodeResults([]);
      setGeocodeMessage(null);
      return;
    }

    const timer = setTimeout(async () => {
      setGeocodeLoading("forward");
      setGeocodeMessage(null);
      try {
        const results = await geocodeAddressAction(trimmed, {
          province: biasProvince,
          locality: biasLocality,
        });
        if (results.length === 0) {
          setGeocodeResults([]);
          setGeocodeMessage("empty");
        } else {
          // Auto-place pin on top result. We do NOT need skipNextForward here:
          // LocationPicker only fires onChange on user gestures (click/drag),
          // not on prop changes — so updating `point` won't loop back.
          setPoint({ lat: results[0].lat, lng: results[0].lng });
          // Show the alternate results so the user can pick a different one if
          // the top guess is wrong. Single-result is silent.
          setGeocodeResults(results.length > 1 ? results : []);
        }
      } catch {
        setGeocodeMessage("failed");
      } finally {
        setGeocodeLoading("none");
      }
    }, FORWARD_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [description, biasProvince, biasLocality, integratedDescription]);

  // Reverse geocoding (coords → description) — fired by user gestures on the
  // map (click, drag) and by "Usar mi ubicación".
  async function handlePointChange(newPoint: { lat: number; lng: number }) {
    setPoint(newPoint);
    if (!integratedDescription) return;
    setGeocodeLoading("reverse");
    setGeocodeMessage(null);
    try {
      const r = await reverseGeocodeAction(newPoint.lat, newPoint.lng);
      if (r) {
        skipNextForward.current = true;
        setDescription(r.display_name);
        setGeocodeResults([]);
      } else {
        setGeocodeMessage("empty");
      }
    } catch {
      setGeocodeMessage("failed");
    } finally {
      setGeocodeLoading("none");
    }
  }

  function pickResult(result: GeocodeResult) {
    skipNextForward.current = true;
    setDescription(result.display_name);
    setPoint({ lat: result.lat, lng: result.lng });
    setGeocodeResults([]);
    setGeocodeMessage(null);
  }

  const descriptionInputName = inputNames?.description ?? "locationDescription";
  const latInputName = inputNames?.lat ?? "locationLat";
  const lngInputName = inputNames?.lng ?? "locationLng";

  // Primary "Usar mi ubicación actual" CTA, shown above the inputs when the
  // mode has a map (l2 or point) and the consumer opted into the primary
  // variant. Falls back silently if geolocation isn't available.
  const showPrimaryLocateButton = includesPoint && useMyLocationVariant === "primary";

  return (
    <div className="space-y-4">
      {showPrimaryLocateButton && (
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={geoLoading}
          aria-label="Usar mi ubicación actual"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gob-primary text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-primary focus-visible:ring-offset-2 transition-colors"
        >
          <span aria-hidden="true">📍</span>
          {geoLoading ? "Obteniendo ubicación…" : "Usar mi ubicación actual"}
        </button>
      )}

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
              value={selectedProvinceCode}
              onChange={(e) => setSelectedProvinceCode(e.target.value)}
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
            <LocalityCombobox
              provinceCode={selectedProvinceCode || null}
              defaultValue={{ localityName: defaultValue?.localityName ?? null }}
              name="localityName"
            />
          </div>
        </div>
      )}

      {includesPoint && (
        <div className="space-y-2">
          {integratedDescription && (
            <div className="space-y-1.5">
              <label htmlFor={descriptionInputName} className={labelClass}>
                Ubicación
              </label>
              <div className="relative">
                <input
                  id={descriptionInputName}
                  name={descriptionInputName}
                  type="text"
                  placeholder="Ej: Plaza Italia, esquina Cerviño"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputClass}
                  aria-busy={geocodeLoading !== "none"}
                />
                {geocodeLoading !== "none" && (
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500 dark:text-neutral-400"
                    aria-live="polite"
                  >
                    {geocodeLoading === "forward" ? "Buscando…" : "Identificando…"}
                  </span>
                )}
              </div>
              {geocodeResults.length > 0 && (
                <ul className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-200 dark:divide-neutral-800 bg-white dark:bg-neutral-900 text-sm overflow-hidden">
                  {geocodeResults.map((r) => (
                    <li key={`${r.lat}-${r.lng}-${r.display_name}`}>
                      <button
                        type="button"
                        onClick={() => pickResult(r)}
                        className="block w-full text-left px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-900 dark:text-neutral-50"
                      >
                        {r.display_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {geocodeMessage === "empty" && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  No encontramos esa dirección. Podés moverte por el mapa.
                </p>
              )}
              {geocodeMessage === "failed" && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  No pudimos buscar la dirección ahora. Tipeá lo que sepas y movete por el mapa.
                </p>
              )}
            </div>
          )}

          <div className="flex items-baseline justify-between gap-3">
            <p className={labelClass}>
              {integratedDescription ? "Ajuste fino" : "Ubicación precisa (opcional)"}
            </p>
            {showPrimaryLocateButton ? null : (
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={geoLoading}
                className="text-xs text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 disabled:opacity-50"
              >
                {geoLoading ? "Obteniendo…" : "Usar mi ubicación"}
              </button>
            )}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-500">
            Tocá el mapa para marcar el punto, arrastrá el pin para ajustarlo, o usá el botón si
            estás en el lugar.
          </p>
          <LocationPicker value={point} onChange={handlePointChange} />
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
              already treat empty as null via writePoint(null). The description
              text input above is already controlled and named, so it submits
              itself; no hidden mirror needed. */}
          <input type="hidden" name={latInputName} value={point ? String(point.lat) : ""} />
          <input type="hidden" name={lngInputName} value={point ? String(point.lng) : ""} />
        </div>
      )}
    </div>
  );
}
