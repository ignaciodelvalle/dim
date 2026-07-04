"use client";

// Fires the credential_scanned server action exactly once when the public
// credential page mounts (the guaranteed, coarse IP-area floor is captured
// server-side on that call — Task #45).
//
// For LOST pets it additionally renders a visible consent prompt asking the
// finder to share their precise location. GPS is requested ONLY after the
// person taps the share button (explicit grant, browser permission prompt on
// top); on success a follow-up credential_scanned event carries scan_coords.
// The base scan is never delayed waiting for consent — if the finder closes
// the page or declines, the coarse floor is already recorded.

import { logScanAction } from "@/app/actions/scans";
import { useEffect, useRef, useState } from "react";

type ConsentState = "idle" | "locating" | "shared" | "dismissed";

export function ScanLogger({
  publicToken,
  isLost = false,
  petName,
}: {
  publicToken: string;
  /** When true, show the location-consent prompt (lost pets only). */
  isLost?: boolean;
  /** Pet name for the consent copy (lost pets only). */
  petName?: string;
}) {
  const hasLogged = useRef(false);
  const [consent, setConsent] = useState<ConsentState>("idle");

  useEffect(() => {
    if (hasLogged.current) return;
    hasLogged.current = true;
    void logScanAction(publicToken);
  }, [publicToken]);

  if (!isLost || consent === "dismissed") return null;

  const shareLocation = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setConsent("dismissed");
      return;
    }
    setConsent("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void logScanAction(publicToken, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        });
        setConsent("shared");
      },
      // Denied / unavailable / timeout — never retry silently, never block.
      () => setConsent("dismissed"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const name = petName?.trim() || "esta mascota";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <section
        aria-label="Compartir ubicación"
        className="mx-auto max-w-md rounded-2xl border border-ln-line bg-ln-card p-4 shadow-lg"
      >
        {consent === "shared" ? (
          <output className="block text-sm font-medium text-ln-ok">
            ¡Gracias! Le avisamos a su familia dónde fue vista.
          </output>
        ) : (
          <>
            <p className="text-sm font-semibold text-ln-ink">
              Compartí tu ubicación para ayudar a encontrar a {name}
            </p>
            <p className="mt-1 text-xs text-ln-mute">
              Se comparte una sola vez con su familia para saber por dónde fue vista. No guardamos
              quién sos.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={shareLocation}
                disabled={consent === "locating"}
                className="flex-1 rounded-xl bg-ln-azul px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {consent === "locating" ? "Obteniendo ubicación…" : "Compartir mi ubicación"}
              </button>
              <button
                type="button"
                onClick={() => setConsent("dismissed")}
                className="rounded-xl border border-ln-line px-4 py-2.5 text-sm font-medium text-ln-ink-2"
              >
                Ahora no
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
