"use client";

// Shared location form section. Single-input pattern for both L1 and L2,
// per critique-direcciones-2026-05-27 §"Opción B": the user types one
// thing, the structured fields are derived from the selected result.
//
//   l1 — single locality autocomplete (cross-province ar_localities).
//        Province is derived from the chosen locality.
//   l2 — single Nominatim autocomplete on the address line. Map below
//        is for confirmation + drag-to-adjust; dragging reverse-geocodes
//        and refills the address + jurisdiction. No separate province/
//        locality inputs for L2 — the autocomplete pick (or pin drag)
//        fills the hidden inputs in bloque.
//
// Hidden-input wire format (back-compat with every existing action):
//   provinceCode        — ISO 3166-2:AR. Always emitted (empty when user
//                         hasn't picked anything).
//   provinceName        — display name. Companion to provinceCode.
//   localityName        — canonical when picked, raw query otherwise.
//   localityNameIndecId — INDEC id from ar_localities; empty when L2 (no
//                         INDEC match path) or when L1 user typed free text.
//   locationLat         — decimal latitude (L2 only).
//   locationLng         — decimal longitude (L2 only).
//   locationAddress     — address text (L2 only). MarkLost can override
//                         the field name via inputNames.description for
//                         back-compat with its setPetLostAction reader;
//                         removal of the alias is tracked in critique §5.
//
import {
  type GeocodeResult,
  geocodeAddressAction,
  geocodeAddressPublicAction,
  reverseGeocodeAction,
  reverseGeocodePublicAction,
} from "@/app/actions/geocoding";
import { LocalityPickerAcross } from "@/components/LocalityPickerAcross";
import { LnInput } from "@/components/ui/Field";
import { type Province, provinceByName } from "@/lib/reference/ar-provincias";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const LocationPicker = dynamic(() => import("./LocationPicker"), {
  loading: () => (
    <div className="w-full h-64 rounded-lg border border-ln-line  bg-ln-stripe  animate-pulse" />
  ),
});

// Two modes: l1 (jurisdiction only) and l2 (jurisdiction + map + address).
// Deprecated aliases (`point`, `jurisdiction`, `jurisdiction+point`, `full`)
// were retired in critique §6/§8 — they had zero active consumers by the
// time the cleanup landed.
export type LocationMode = "l1" | "l2";

export type LocationFieldsValue = {
  provinceCode?: string | null;
  localityName?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  // Legacy alias for the address text; some consumers (MarkLost) read it
  // under a different name on the server. Pre-fill from address first,
  // description second.
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
  allowAnonymous = false,
  onLocationPresenceChange,
  required = false,
}: {
  mode: LocationMode;
  defaultValue?: LocationFieldsValue;
  biasProvince?: string | null;
  biasLocality?: string | null;
  /** Renders the red-seal `*` on the L1 "Localidad" label, matching the
   * LnField required marker used by sibling fields (QA round 2 2026-07-03 #7:
   * the helper said "Requerido" but the label carried no asterisk). Does not
   * add native validation — callers own the required semantics. */
  required?: boolean;
  // Override the wire-format name for the L2 address / lat / lng hidden
  // inputs. Retained for flexibility; no current consumer overrides these
  // (the lastKnownLocation alias was retired by critique §5).
  inputNames?: { lat?: string; lng?: string; description?: string };
  // "primary" renders a big leading "Usar mi ubicación actual" button
  // (PetSighting, denuncia step 3). "secondary" keeps the inline link.
  useMyLocationVariant?: "primary" | "secondary";
  // True for anonymous public flows (PetSightingForm, DenunciaWizard).
  // Routes geocoding calls through the IP-rate-limited public actions.
  allowAnonymous?: boolean;
  // Optional: notified whenever the field's location presence changes (true when
  // any of jurisdiction / address / map point is set). Lets a parent warn on
  // empty location without coupling to the uncontrolled hidden inputs (UI-7 B6).
  onLocationPresenceChange?: (hasLocation: boolean) => void;
}) {
  const isL2 = mode === "l2";

  // Map point (L2 only). Pre-filled when defaultValue has lat/lng.
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    defaultValue?.lat != null && defaultValue?.lng != null
      ? { lat: defaultValue.lat, lng: defaultValue.lng }
      : null,
  );
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  // Picked jurisdiction (L2 only) — driven by Nominatim result selection or
  // map-drag reverse geocoding. The hidden inputs read from here. Defaults
  // pre-fill from props so edit forms render with the persisted values.
  const [pickedProvince, setPickedProvince] = useState<{
    code: string;
    name: string;
  } | null>(
    defaultValue?.provinceCode
      ? {
          code: defaultValue.provinceCode,
          name: defaultValue.provinceCode, // best-effort; provinceByCode resolution happens server-side
        }
      : null,
  );
  const [pickedLocality, setPickedLocality] = useState<string | null>(
    defaultValue?.localityName ?? null,
  );

  // L2 address text + autocomplete state.
  const [addressText, setAddressText] = useState<string>(
    defaultValue?.address ?? defaultValue?.description ?? "",
  );
  const [geocodeLoading, setGeocodeLoading] = useState<"none" | "forward" | "reverse">("none");
  const [geocodeResults, setGeocodeResults] = useState<GeocodeResult[]>([]);
  const [geocodeMessage, setGeocodeMessage] = useState<"empty" | "failed" | null>(null);
  // Suppress forward effect when address text was filled by a result pick
  // or by reverse geocoding (prevents infinite loops).
  const skipNextForward = useRef(false);

  const addressInputName = inputNames?.description ?? "locationAddress";
  const latInputName = inputNames?.lat ?? "locationLat";
  const lngInputName = inputNames?.lng ?? "locationLng";

  // Forward geocoding (address text → coords + jurisdiction), debounced.
  useEffect(() => {
    if (!isL2) return;
    if (skipNextForward.current) {
      skipNextForward.current = false;
      return;
    }
    const trimmed = addressText.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setGeocodeResults([]);
      setGeocodeMessage(null);
      return;
    }

    const forwardAction = allowAnonymous ? geocodeAddressPublicAction : geocodeAddressAction;
    const timer = setTimeout(async () => {
      setGeocodeLoading("forward");
      setGeocodeMessage(null);
      try {
        const results = await forwardAction(trimmed, {
          province: biasProvince,
          locality: biasLocality,
        });
        if (results.length === 0) {
          setGeocodeResults([]);
          setGeocodeMessage("empty");
        } else {
          // Auto-place pin and provisional jurisdiction on top result.
          // LocationPicker only fires onChange on user gestures, so this
          // doesn't loop back into handlePointChange.
          setPoint({ lat: results[0].lat, lng: results[0].lng });
          applyJurisdictionFromResult(results[0]);
          // Show alternates so the user can correct the top guess.
          setGeocodeResults(results.length > 1 ? results : []);
        }
      } catch {
        setGeocodeMessage("failed");
      } finally {
        setGeocodeLoading("none");
      }
    }, FORWARD_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [addressText, biasProvince, biasLocality, isL2, allowAnonymous]);

  // Notify the parent whenever location presence changes (UI-7 B6). Presence =
  // any of jurisdiction / address text / map point set.
  // biome-ignore lint/correctness/useExhaustiveDependencies: onLocationPresenceChange is a stable callback from the parent; including it would loop on inline closures.
  useEffect(() => {
    if (!onLocationPresenceChange) return;
    const hasLocation =
      pickedProvince != null ||
      pickedLocality != null ||
      addressText.trim().length > 0 ||
      point != null;
    onLocationPresenceChange(hasLocation);
  }, [pickedProvince, pickedLocality, addressText, point]);

  // Reverse geocoding (coords → address + jurisdiction). Fires on map gesture.
  async function handlePointChange(newPoint: { lat: number; lng: number }) {
    setPoint(newPoint);
    if (!isL2) return;
    setGeocodeLoading("reverse");
    setGeocodeMessage(null);
    const reverseAction = allowAnonymous ? reverseGeocodePublicAction : reverseGeocodeAction;
    try {
      const r = await reverseAction(newPoint.lat, newPoint.lng);
      if (r) {
        skipNextForward.current = true;
        setAddressText(r.display_name);
        applyJurisdictionFromResult(r);
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

  // Map a Nominatim result's free-text province name to an ISO code via
  // PROVINCES. Sets pickedProvince + pickedLocality (best effort; both
  // null when the result doesn't resolve cleanly).
  function applyJurisdictionFromResult(r: {
    province: string | null;
    locality: string | null;
  }): void {
    const province: Province | null = r.province ? provinceByName(r.province) : null;
    setPickedProvince(province ? { code: province.code, name: province.name } : null);
    setPickedLocality(r.locality ?? null);
  }

  function pickResult(result: GeocodeResult) {
    skipNextForward.current = true;
    setAddressText(result.display_name);
    setPoint({ lat: result.lat, lng: result.lng });
    applyJurisdictionFromResult(result);
    setGeocodeResults([]);
    setGeocodeMessage(null);
  }

  function handleUseMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalización.");
      return;
    }
    setGeoError(null);
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Treat as a pin move so we reverse-geocode and fill the address.
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

  const showPrimaryLocateButton = isL2 && useMyLocationVariant === "primary";

  return (
    <div className="space-y-4">
      {showPrimaryLocateButton && (
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={geoLoading}
          aria-label="Usar mi ubicación actual"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-ln-azul text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-azul focus-visible:ring-offset-2 transition-colors"
        >
          <span aria-hidden="true">📍</span>
          {geoLoading ? "Obteniendo ubicación…" : "Usar mi ubicación actual"}
        </button>
      )}

      {/* L1 — cross-province locality autocomplete, single input. */}
      {!isL2 && (
        <div className="space-y-1.5">
          <label htmlFor="localityName-input" className="block text-sm font-medium text-ln-ink">
            Localidad
            {required && (
              <span className="ml-1 text-[var(--color-ln-seal)]" aria-hidden="true">
                *
              </span>
            )}
          </label>
          <LocalityPickerAcross
            id="localityName"
            defaultValue={{
              provinceCode: defaultValue?.provinceCode ?? null,
              localityName: defaultValue?.localityName ?? null,
            }}
          />
        </div>
      )}

      {/* L2 — Nominatim autocomplete on the address line, plus map for
          confirmation and drag-to-adjust. No separate province/locality
          inputs; the autocomplete (or the map drag) fills them via the
          hidden inputs below. */}
      {isL2 && (
        <>
          <div className="space-y-1.5">
            <label htmlFor={addressInputName} className="block text-sm font-medium text-ln-ink">
              Dirección o referencia
            </label>
            <div className="relative">
              <LnInput
                id={addressInputName}
                name={addressInputName}
                type="text"
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                placeholder="Empezá a tipear: calle y altura, esquina, plaza…"
                aria-busy={geocodeLoading !== "none"}
              />
              {geocodeLoading !== "none" && (
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ln-mute "
                  aria-live="polite"
                >
                  {geocodeLoading === "forward" ? "Buscando…" : "Identificando…"}
                </span>
              )}
            </div>
            {geocodeResults.length > 0 && (
              <ul className="border border-ln-line  rounded-lg divide-y divide-ln-line  bg-ln-card  text-sm overflow-hidden">
                {geocodeResults.map((r) => (
                  <li key={`${r.lat}-${r.lng}-${r.display_name}`}>
                    <button
                      type="button"
                      onClick={() => pickResult(r)}
                      className="block w-full text-left px-3 py-2 hover:bg-ln-stripe  text-ln-ink "
                    >
                      {r.display_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {geocodeMessage === "empty" && (
              <p className="text-xs text-ln-mute ">
                No encontramos esa dirección. Podés moverte por el mapa para ajustarla.
              </p>
            )}
            {geocodeMessage === "failed" && (
              <p className="text-xs text-ln-warn ">
                No pudimos buscar la dirección ahora. Tipeá lo que sepas y movete por el mapa.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="block text-sm font-medium text-ln-ink">Ajuste fino</p>
              {showPrimaryLocateButton ? null : (
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={geoLoading}
                  className="text-xs text-ln-ink-2  underline underline-offset-4 hover:text-ln-ink  disabled:opacity-50"
                >
                  {geoLoading ? "Obteniendo…" : "Usar mi ubicación"}
                </button>
              )}
            </div>
            <p className="text-xs text-ln-mute ">
              Tocá el mapa para marcar el punto, arrastrá el pin para ajustarlo, o usá el botón si
              estás en el lugar.
            </p>
            <LocationPicker value={point} onChange={handlePointChange} />
            {geoError && (
              <p className="text-xs text-ln-warn " role="alert">
                {geoError}
              </p>
            )}
            {point && (
              <p className="text-xs text-ln-mute  font-mono">
                {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
              </p>
            )}
          </div>

          {/* L2 hidden inputs — jurisdiction derived from autocomplete pick
              or map-drag reverse-geocoding; lat/lng from the pin. */}
          <input type="hidden" name="provinceCode" value={pickedProvince?.code ?? ""} />
          <input type="hidden" name="provinceName" value={pickedProvince?.name ?? ""} />
          <input type="hidden" name="localityName" value={pickedLocality ?? ""} />
          <input type="hidden" name="localityNameIndecId" value="" />
          <input type="hidden" name={latInputName} value={point ? String(point.lat) : ""} />
          <input type="hidden" name={lngInputName} value={point ? String(point.lng) : ""} />
        </>
      )}
    </div>
  );
}
