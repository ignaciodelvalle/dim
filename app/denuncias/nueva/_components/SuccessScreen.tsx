"use client";

// SuccessScreen — shown after createWelfareReportAction succeeds.
// Displays the DEN-XXXX-XXXX reference code prominently.
// "Guardar como imagen" deferred — TODO(M-followup): render code to canvas PNG
// via <a download> (plan §Open decisions #5 — path (a): works everywhere).

import Link from "next/link";
import { useState } from "react";

type SuccessScreenProps = {
  referenceCode: string;
};

export function SuccessScreen({ referenceCode }: SuccessScreenProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referenceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — silently degrade.
    }
  }

  return (
    <div className="bg-white flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-sm w-full space-y-8 text-center">
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-full bg-gob-success/10 flex items-center justify-center mx-auto text-3xl"
          aria-hidden="true"
        >
          ✅
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-gob-text">Denuncia registrada</h1>
          <p className="text-sm text-gob-text-muted leading-relaxed">
            Tu denuncia fue recibida. Gracias por animarte a denunciar.
          </p>
        </div>

        {/* Reference code — the hero element */}
        <div className="rounded-2xl border-2 border-gob-border bg-gob-surface-alt px-6 py-6 space-y-3">
          <p className="text-xs uppercase tracking-widest text-gob-text-muted font-medium">
            Tu código de seguimiento
          </p>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Código copiado" : "Tocar para copiar el código"}
            className="block w-full focus:outline-none focus:ring-2 focus:ring-gob-primary rounded-lg"
          >
            <span className="block text-3xl font-mono font-bold tracking-widest tabular-nums text-gob-text break-all">
              {referenceCode}
            </span>
            <span className="block text-xs text-gob-text-muted mt-2">
              {copied ? "¡Copiado!" : "Tocá para copiar"}
            </span>
          </button>
        </div>

        {/* Warning */}
        <p className="text-xs text-gob-text-muted leading-relaxed">
          Si enviaste anónima, este código es la{" "}
          <strong className="text-gob-text-gray">única forma</strong> de volver a esta denuncia.
          Guardalo en un lugar seguro o sacale screenshot.
        </p>

        {/* TODO(M-followup): "Guardar como imagen" button — render code to PNG via
            canvas + <a download>. Deferred per owner directive (UI shell first). */}

        {/* CTA */}
        <div className="space-y-3">
          <Link
            href={`/denuncias/codigo/${referenceCode}`}
            className="block w-full px-4 py-3.5 rounded-xl bg-gob-primary text-white font-semibold text-sm text-center hover:opacity-90 transition-colors"
          >
            Ver mi denuncia →
          </Link>
          <Link
            href="/"
            className="block w-full px-4 py-3.5 rounded-xl border border-gob-border text-gob-text-gray font-medium text-sm text-center hover:bg-gob-surface-alt transition-colors"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
