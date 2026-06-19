"use client";

// PetCreatedAha — celebratory success screen shown after first pet creation.
//
// Core aha: "your pet has a verifiable QR credential you can share right now."
//
// Three CTAs (spec: max 3, regla de 4 verbos):
//   1. "Compartir" — Web Share API, falls back to copy-to-clipboard.
//   2. "Ver perfil" — navigates to the pet profile page.
//   3. "Ver credencial pública" — opens the public-facing credential page.
//
// A11y:
//   - Focus moves to the h1 heading on mount.
//   - QR wrapper has role="img" + aria-label describing the linked URL.
//   - All interactive elements have visible focus rings.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Props {
  petName: string;
  publicToken: string;
  credentialUrl: string;
  /** Inline SVG string — generated server-side with QRCode.toString. */
  qrSvg: string;
}

export function PetCreatedAha({ petName, publicToken, credentialUrl, qrSvg }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">("idle");

  // A11y: focus the heading on mount so screen-reader users land in context.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function handleShare() {
    const shareData = {
      title: `Credencial de ${petName} — MiMAR`,
      text: `La libreta sanitaria digital de ${petName} en MiMAR.`,
      url: credentialUrl,
    };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // User cancelled share or API unavailable — fall through to clipboard.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    // Fallback: copy URL to clipboard.
    try {
      await navigator.clipboard.writeText(credentialUrl);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2500);
    } catch {
      setShareState("error");
      setTimeout(() => setShareState("idle"), 2500);
    }
  }

  const shareLabel =
    shareState === "copied"
      ? "¡Link copiado!"
      : shareState === "error"
        ? "No se pudo copiar"
        : "Compartir";

  return (
    <div className="min-h-screen bg-[var(--color-ln-paper)] flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-sm w-full space-y-8 text-center">
        {/* Success badge */}
        <div
          className="w-16 h-16 rounded-full bg-[var(--color-ln-ok-050)] border border-[var(--color-ln-ok-100)] flex items-center justify-center mx-auto"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8 text-[var(--color-ln-ok)]"
            role="img"
            aria-label="Éxito"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        {/* Heading — receives focus on mount for a11y */}
        <div className="space-y-2">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-semibold text-[var(--color-ln-ink)] outline-none"
          >
            {petName} ya tiene su credencial
          </h1>
          <p className="text-sm text-[var(--color-ln-mute)] leading-relaxed">
            Cualquiera que escanee el QR puede ver su libreta pública. Guardalo en el collar o
            compartilo con el veterinario.
          </p>
        </div>

        {/* QR block — ≥200px per spec (generated at 240px).
            role=img + aria-label on the wrapper describes the QR purpose
            and the URL it encodes for screen-reader users. */}
        <div
          className="rounded-[6px] border border-[var(--color-ln-line)] bg-white p-4 mx-auto inline-block"
          aria-label={`Código QR que enlaza a la credencial pública de ${petName}: ${credentialUrl}`}
          role="img"
        >
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered SVG from qrcode lib */}
          <div className="w-[240px] h-[240px]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        </div>

        {/* Credential URL — small, readable, below the QR */}
        <p
          className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)] break-all"
          aria-hidden="true"
        >
          {credentialUrl}
        </p>

        {/* Actions — max 3 per spec */}
        <div className="space-y-3">
          {/* Primary: share */}
          <button
            type="button"
            onClick={handleShare}
            className="block w-full px-4 py-3.5 rounded-[3px] font-semibold text-sm text-center transition-colors bg-[var(--color-ln-azul)] text-white border border-[var(--color-ln-azul)] hover:bg-[var(--color-ln-azul-700)] hover:border-[var(--color-ln-azul-700)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ln-azul)] focus-visible:ring-offset-2"
          >
            {shareLabel}
          </button>

          {/* Secondary: view pet profile */}
          <Link
            href={`/mis-mascotas/${publicToken}`}
            className="block w-full px-4 py-3.5 rounded-[3px] font-semibold text-sm text-center transition-colors border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-[var(--color-ln-ink-2)] hover:bg-[var(--color-ln-stripe)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ln-azul)] focus-visible:ring-offset-2"
          >
            Ver perfil
          </Link>

          {/* Tertiary: view public credential in a new tab */}
          <Link
            href={`/p/${publicToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full px-4 py-3.5 rounded-[3px] font-medium text-sm text-center text-[var(--color-ln-mute)] hover:text-[var(--color-ln-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ln-azul)] focus-visible:ring-offset-2"
          >
            Ver credencial pública
          </Link>
        </div>
      </div>
    </div>
  );
}
