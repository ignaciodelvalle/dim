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
    <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-sm w-full space-y-8 text-center">
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center mx-auto text-3xl"
          aria-hidden="true"
        >
          ✅
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Denuncia registrada
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Tu denuncia fue recibida. Gracias por animarte a denunciar.
          </p>
        </div>

        {/* Reference code — the hero element */}
        <div className="rounded-2xl border-2 border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-6 py-6 space-y-3">
          <p className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-500 font-medium">
            Tu código de seguimiento
          </p>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Código copiado" : "Tocar para copiar el código"}
            className="block w-full focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 rounded-lg"
          >
            <span className="block text-3xl font-mono font-bold tracking-widest tabular-nums text-neutral-900 dark:text-neutral-50 break-all">
              {referenceCode}
            </span>
            <span className="block text-xs text-neutral-400 dark:text-neutral-600 mt-2">
              {copied ? "¡Copiado!" : "Tocá para copiar"}
            </span>
          </button>
        </div>

        {/* Warning */}
        <p className="text-xs text-neutral-500 dark:text-neutral-500 leading-relaxed">
          Si enviaste anónima, este código es la{" "}
          <strong className="text-neutral-700 dark:text-neutral-300">única forma</strong> de volver
          a esta denuncia. Guardalo en un lugar seguro o sacale screenshot.
        </p>

        {/* TODO(M-followup): "Guardar como imagen" button — render code to PNG via
            canvas + <a download>. Deferred per owner directive (UI shell first). */}

        {/* CTA */}
        <div className="space-y-3">
          <Link
            href={`/denuncias/codigo/${referenceCode}`}
            className="block w-full px-4 py-3.5 rounded-xl bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-semibold text-sm text-center hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            Ver mi denuncia →
          </Link>
          <Link
            href="/"
            className="block w-full px-4 py-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium text-sm text-center hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
