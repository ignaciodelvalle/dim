"use client";

// Client component — govt self-deactivation form (Slice 3d, §7.5).
// Destructive action: warning-first design (cognitive-doc-design pattern).
// Coverage state shown explicitly per-locality before any confirm/submit.
// On submit: calls govtSelfDeactivateAction → redirects to /cuenta.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { govtSelfDeactivateAction } from "@/app/actions/profile-self-service";

type LocalityRow = {
  province: string;
  locality: string;
  otherActiveGovtCount: number;
};

export function GovtSelfDeactivateForm({ localities }: { localities: LocalityRow[] }) {
  const router = useRouter();

  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasUncoveredLocality = localities.some((l) => l.otherActiveGovtCount === 0);
  const canProceed = !hasUncoveredLocality;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed || !canProceed) return;
    setError(null);
    setLoading(true);

    try {
      const result = await govtSelfDeactivateAction({ reason: reason.trim() || undefined });

      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }

      router.push("/cuenta?banner=govt_deactivated");
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

      {/* My localities — coverage status per row */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          Mis localidades actualmente asignadas
        </h2>

        {localities.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-500">
            No tenés localidades asignadas.
          </p>
        ) : (
          <ul className="space-y-2">
            {localities.map((loc) => {
              const covered = loc.otherActiveGovtCount > 0;
              return (
                <li
                  key={`${loc.province}/${loc.locality}`}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    covered
                      ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20"
                      : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20"
                  }`}
                >
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    {loc.province} / {loc.locality}
                  </span>
                  {covered ? (
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      {loc.otherActiveGovtCount === 1
                        ? "1 otro govt activo"
                        : `${loc.otherActiveGovtCount} otros govts activos`}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">
                      Solo vos cubrís esta localidad
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Block banner — shown when at least one locality would be uncovered */}
      {hasUncoveredLocality && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-5 py-4 space-y-2"
        >
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">
            No podés desactivarte todavía.
          </p>
          <p className="text-sm text-red-600 dark:text-red-400">
            Una o más localidades quedarían sin govt si te desactivás. Pedile a tu administrador que
            asigne otro govt a esas localidades antes de continuar.
          </p>
        </div>
      )}

      {/* Proceed section — only shown when coverage is OK */}
      {canProceed && (
        <>
          {/* Confirmation text */}
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-5 space-y-2">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Si confirmás la desactivación:
            </p>
            <ul className="space-y-1.5">
              {[
                "Tu cuenta va a quedar desactivada.",
                "Tus localidades pasan a los otros govts activos que ya las cubren.",
                "Los pedidos pendientes en tus localidades van a la cola de los otros govts o, como fallback, a la del admin.",
                "Tu usuario en el sistema se conserva (no se borra) pero no vas a poder acceder a esta sección.",
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
              placeholder="Contanos por qué desactivás tu cuenta..."
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
              Entiendo y confirmo que quiero desactivar mi cuenta de operador govt.
            </span>
          </label>
        </>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        {canProceed && (
          <button
            type="submit"
            disabled={!confirmed || loading}
            className="px-5 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Procesando..." : "Desactivar cuenta"}
          </button>
        )}
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
