"use client";

// Client component — vet self-resignation form (Slice 3d, §7.8).
// Destructive action: warning-first design (cognitive-doc-design pattern).
// On submit: calls vetSelfResignAction → redirects to /cuenta with success banner.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { vetSelfResignAction } from "@/app/actions/profile-self-service";

export function VetSelfResignForm() {
  const router = useRouter();

  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed) return;
    setError(null);
    setLoading(true);

    try {
      const result = await vetSelfResignAction({ reason: reason.trim() || undefined });

      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }

      // Success — redirect to /cuenta; the page banner is a URL param so it
      // survives the router navigation without extra state management.
      router.push("/cuenta?banner=resignation_confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-3"
        >
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Warning — consequence list (warning-first design) */}
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-5 space-y-3">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Estas son las consecuencias de renunciar:
        </p>
        <ul className="space-y-1.5">
          {[
            "Perderás la posibilidad de escribir eventos como veterinario/a.",
            "Tu matrícula quedará registrada pero marcada como NO verificada.",
            "Tus mascotas propias siguen siendo tuyas.",
            "Para volver a tener el rol vet, vas a tener que solicitarlo de cero y ser aprobado/a nuevamente.",
          ].map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400"
            >
              <span aria-hidden className="mt-0.5 shrink-0 text-amber-500">
                •
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Motivo (optional) */}
      <div>
        <label
          htmlFor="reason"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
        >
          Motivo{" "}
          <span className="text-xs font-normal text-neutral-500 dark:text-neutral-500">
            (opcional)
          </span>
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Contanos por qué renunciás..."
          className="w-full text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 resize-none"
        />
      </div>

      {/* Confirm checkbox */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 accent-neutral-900 dark:accent-neutral-50"
        />
        <span className="text-sm text-neutral-700 dark:text-neutral-300">
          Entiendo y confirmo que quiero renunciar a mi rol de veterinario/a.
        </span>
      </label>

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={!confirmed || loading}
          className="px-5 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Procesando..." : "Renunciar"}
        </button>
        <a
          href="/cuenta"
          className="px-5 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
