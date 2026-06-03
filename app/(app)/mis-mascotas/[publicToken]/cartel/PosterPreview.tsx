"use client";

// PosterPreview — A4 printable lost-pet poster.
//
// Controls (no-print): print button, B&W toggle, back link.
// Poster body: PERDIDA header, photo, identity, optional location,
// inline-editable reward + extra text, QR, MiMAR footer.
// All inline-editable fields are local state only — they never persist.

import Link from "next/link";
import { useState } from "react";

export type PosterPreviewProps = {
  publicToken: string;
  petName: string;
  species: string;
  breed: string | null;
  sex: string;
  age: string | null;
  color: string | null;
  distinguishingFeatures: string | null;
  photoUrl: string | null;
  // Lost episode
  placeName: string | null;
  lostSince: Date | null;
  // Owner contact — already filtered by disclosure prefs (null = not disclosed)
  ownerFirstName: string | null;
  ownerPhone: string | null;
  // Location disclosure gate applied before passing — null = not disclosed
  locationDisclosed: boolean;
  // Server-generated QR SVG string
  qrSvg: string;
};

export function PosterPreview({
  publicToken,
  petName,
  species,
  breed,
  sex,
  age,
  color,
  distinguishingFeatures,
  photoUrl,
  placeName,
  lostSince,
  ownerFirstName,
  ownerPhone,
  locationDisclosed,
  qrSvg,
}: PosterPreviewProps) {
  const [grayscale, setGrayscale] = useState(false);
  const [extraText, setExtraText] = useState("");

  const identityParts = [species, breed, sex, age].filter(Boolean).join(" · ");

  const lostSinceLabel = lostSince
    ? lostSince.toLocaleDateString("es-AR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <>
      {/* @page rule scoped to this component's mount lifetime so it is removed
          on client-side navigation and does not leak to other routes (e.g. libreta). */}
      <style>{"@page { size: A4 portrait; margin: 1cm; }"}</style>

      {/* ── Print controls (hidden when printing) ── */}
      <header className="no-print print:hidden bg-white border-b border-gob-border py-4 px-6 flex flex-wrap items-center gap-3 mb-6">
        <Link
          href={`/mis-mascotas/${publicToken}`}
          className="text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text mr-auto"
        >
          ← Volver al perfil de {petName}
        </Link>

        <button
          type="button"
          onClick={() => setGrayscale((v) => !v)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gob-border text-gob-text hover:bg-gob-surface-alt transition-colors"
        >
          {grayscale ? "Versión color" : "Versión blanco y negro"}
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-gob-primary text-white hover:bg-gob-primary transition-colors"
        >
          Imprimir cartel
        </button>
      </header>

      {/* ── A4 poster ── */}
      <main
        className={`mx-auto w-[210mm] min-h-[297mm] bg-white p-[1cm] space-y-4 print:w-full print:min-h-screen print:p-0 print:space-y-3${grayscale ? " print:grayscale" : ""}`}
        data-testid="poster-body"
      >
        {/* PERDIDA banner */}
        <div className="bg-gob-danger text-white text-center py-3 rounded-xl">
          <p className="text-4xl font-black tracking-widest uppercase">PERDIDA</p>
        </div>

        {/* Photo */}
        <div className="flex justify-center">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={petName}
              className="w-56 h-56 object-cover rounded-2xl ring-4 ring-gob-danger shadow-lg"
            />
          ) : (
            <div className="w-56 h-56 rounded-2xl bg-gob-surface-alt flex items-center justify-center text-6xl font-bold text-gob-text-muted ring-4 ring-gob-danger shadow-lg">
              {petName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Pet name */}
        <h1 className="text-center text-4xl font-black tracking-tight text-gob-text">{petName}</h1>

        {/* Identity line */}
        {identityParts && (
          <p className="text-center text-base text-gob-text-gray">{identityParts}</p>
        )}

        {/* Color */}
        {color && (
          <p className="text-sm text-gob-text">
            <span className="font-semibold">Color:</span> {color}
          </p>
        )}

        {/* Distinguishing features */}
        {distinguishingFeatures && (
          <p className="text-sm text-gob-text">
            <span className="font-semibold">Señas:</span> {distinguishingFeatures}
          </p>
        )}

        {/* Last seen (gated by disclosure pref) */}
        {locationDisclosed && (placeName || lostSinceLabel) && (
          <div className="text-sm text-gob-text space-y-0.5">
            {placeName && (
              <p>
                <span className="font-semibold">📍 Última vez vista:</span> {placeName}
              </p>
            )}
            {lostSinceLabel && (
              <p>
                <span className="font-semibold">Fecha:</span> {lostSinceLabel}
              </p>
            )}
          </div>
        )}

        {/* Owner contact */}
        {(ownerFirstName || ownerPhone) && (
          <div className="text-sm text-gob-text space-y-0.5">
            <p className="font-semibold">📞 Contacto:</p>
            {ownerFirstName && ownerPhone && (
              <p>
                {ownerFirstName} · {ownerPhone}
              </p>
            )}
            {ownerFirstName && !ownerPhone && <p>{ownerFirstName}</p>}
            {!ownerFirstName && ownerPhone && <p>{ownerPhone}</p>}
          </div>
        )}

        {/* QR code */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <div
            className="w-36 h-36 p-1 bg-white rounded-lg border border-gob-border"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered SVG from qrcode lib
            dangerouslySetInnerHTML={{ __html: qrSvg }}
            data-testid="qr-container"
          />
          <p className="text-xs text-gob-text-gray text-center">Escaneá para más info</p>
        </div>

        {/* Extra text — inline-editable, local state only */}
        <div className="border border-dashed border-gob-border rounded-xl p-3">
          <textarea
            value={extraText}
            onChange={(e) => setExtraText(e.target.value)}
            placeholder="Información adicional (opcional — solo visible en este cartel)"
            rows={2}
            className="w-full text-sm text-gob-text bg-transparent resize-none focus:outline-none placeholder:text-gob-text-muted"
          />
        </div>

        {/* Footer */}
        <footer className="text-center pt-4 border-t border-gob-border">
          <p className="text-xs text-gob-text-muted uppercase tracking-widest">
            MiMAR · Documento de Identificación para Mascotas
          </p>
        </footer>
      </main>
    </>
  );
}
