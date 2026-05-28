"use client";

// Client component — govt self-deactivation form (Slice 3d, §7.5).
// Destructive action: warning-first design (cognitive-doc-design pattern).
// Coverage state shown explicitly per-locality before any confirm/submit.
// On submit: calls govtSelfDeactivateAction → redirects to /cuenta.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { govtSelfDeactivateAction } from "@/app/actions/profile-self-service";
import { Checkbox } from "@/components/poncho";

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
          className="rounded-md bg-gob-danger/10  border border-gob-danger  px-4 py-3"
        >
          <p className="text-sm text-gob-danger ">{error}</p>
        </div>
      )}

      {/* My localities — coverage status per row */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gob-text ">
          Mis localidades actualmente asignadas
        </h2>

        {localities.length === 0 ? (
          <p className="text-sm text-gob-text-muted ">No tenés localidades asignadas.</p>
        ) : (
          <ul className="space-y-2">
            {localities.map((loc) => {
              const covered = loc.otherActiveGovtCount > 0;
              return (
                <li
                  key={`${loc.province}/${loc.locality}`}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    covered
                      ? "border-gob-success  bg-gob-success/10 "
                      : "border-gob-danger  bg-gob-danger/10 "
                  }`}
                >
                  <span className="text-sm text-gob-text-gray ">
                    {loc.province} / {loc.locality}
                  </span>
                  {covered ? (
                    <span className="text-xs font-medium text-gob-success ">
                      {loc.otherActiveGovtCount === 1
                        ? "1 otro govt activo"
                        : `${loc.otherActiveGovtCount} otros govts activos`}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-gob-danger ">
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
          className="rounded-lg border border-gob-danger  bg-gob-danger/10  px-5 py-4 space-y-2"
        >
          <p className="text-sm font-semibold text-gob-danger ">No podés desactivarte todavía.</p>
          <p className="text-sm text-gob-danger ">
            Una o más localidades quedarían sin govt si te desactivás. Pedile a tu administrador que
            asigne otro govt a esas localidades antes de continuar.
          </p>
        </div>
      )}

      {/* Proceed section — only shown when coverage is OK */}
      {canProceed && (
        <>
          {/* Confirmation text */}
          <div className="rounded-lg border border-gob-warning  bg-gob-warning/10  p-5 space-y-2">
            <p className="text-sm font-semibold text-gob-warning-text ">
              Si confirmás la desactivación:
            </p>
            <ul className="space-y-1.5">
              {[
                "Tu cuenta va a quedar desactivada.",
                "Tus localidades pasan a los otros govts activos que ya las cubren.",
                "Los pedidos pendientes en tus localidades van a la cola de los otros govts o, como fallback, a la del admin.",
                "Tu usuario en el sistema se conserva (no se borra) pero no vas a poder acceder a esta sección.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-gob-warning-text ">
                  <span aria-hidden className="mt-0.5 shrink-0 text-gob-warning">
                    •
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Motivo (optional) */}
          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-gob-text-gray  mb-1">
              Motivo <span className="text-xs font-normal text-gob-text-muted ">(opcional)</span>
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Contanos por qué desactivás tu cuenta..."
              className="w-full text-sm rounded-md border border-gob-border  bg-white  px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gob-primary  resize-none"
            />
          </div>

          {/* Confirm checkbox */}
          <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>
            Entiendo y confirmo que quiero desactivar mi cuenta de operador govt.
          </Checkbox>
        </>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        {canProceed && (
          <button
            type="submit"
            disabled={!confirmed || loading}
            className="px-5 py-2 text-sm bg-gob-danger hover:bg-gob-danger text-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Procesando..." : "Desactivar cuenta"}
          </button>
        )}
        <a
          href="/cuenta"
          className="px-5 py-2 text-sm border border-gob-border-strong  rounded-md hover:bg-gob-surface-alt  transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
