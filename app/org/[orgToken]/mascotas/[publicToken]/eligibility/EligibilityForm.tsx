"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setAdoptionEligibilityAction } from "@/app/actions/adoption-eligibility";

const REASONS = [
  { value: "medical_treatment", label: "Tratamiento médico en curso" },
  { value: "behavioral_evaluation", label: "Evaluación de comportamiento" },
  { value: "recovery", label: "Recuperación" },
  { value: "quarantine", label: "Cuarentena" },
  { value: "legal_hold", label: "Retención legal" },
  { value: "age", label: "Edad" },
  { value: "pending_intake_eval", label: "Evaluación de intake pendiente" },
  { value: "other", label: "Otro (especificar)" },
] as const;

type Reason = (typeof REASONS)[number]["value"];

export function EligibilityForm({
  petPublicToken,
  orgToken,
  current,
}: {
  petPublicToken: string;
  orgToken: string;
  current: {
    eligible: boolean | null;
    reason: string | null;
    notes: string | null;
    until: string | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState<"eligible" | "not_eligible">(
    current.eligible === true
      ? "eligible"
      : current.eligible === false
        ? "not_eligible"
        : "eligible",
  );
  const [reason, setReason] = useState<Reason>(
    (current.reason as Reason | null) ?? "medical_treatment",
  );
  const [notes, setNotes] = useState(current.notes ?? "");
  const [until, setUntil] = useState(current.until ?? "");
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  function submit() {
    setError(null);
    setOkMessage(null);
    const eligible = decision === "eligible";
    startTransition(async () => {
      const result = await setAdoptionEligibilityAction({
        petPublicToken,
        eligible,
        ineligibleReason: eligible ? null : reason,
        ineligibleReasonNotes: eligible ? null : notes.trim() || null,
        ineligibleUntilIso: eligible || !until ? null : new Date(until).toISOString(),
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOkMessage(
        eligible
          ? "Marcada como apta para adopción."
          : "Marcada como NO apta. Resolvé el motivo cuando corresponda.",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-3 text-sm">
        <p className="text-neutral-600 dark:text-neutral-400">
          Estado actual:{" "}
          <strong>
            {current.eligible === true
              ? "Apta"
              : current.eligible === false
                ? "NO apta"
                : "Sin determinar"}
          </strong>
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">Decisión</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDecision("eligible")}
            className={`px-3 py-1.5 rounded-lg border text-sm ${
              decision === "eligible"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            Apta para adopción
          </button>
          <button
            type="button"
            onClick={() => setDecision("not_eligible")}
            className={`px-3 py-1.5 rounded-lg border text-sm ${
              decision === "not_eligible"
                ? "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 border-neutral-900 dark:border-neutral-50"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            NO apta
          </button>
        </div>
      </div>

      {decision === "not_eligible" && (
        <div className="space-y-3">
          <div>
            <label
              htmlFor="elig-reason"
              className="block text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1"
            >
              Motivo
            </label>
            <select
              id="elig-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as Reason)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="elig-notes"
              className="block text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1"
            >
              Notas {reason === "other" && <span className="text-red-600">*</span>}
            </label>
            <textarea
              id="elig-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={reason === "other" ? "Describí el motivo" : "Notas (opcional)"}
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="elig-until"
              className="block text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1"
            >
              Hasta (opcional)
            </label>
            <input
              id="elig-until"
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Si lo dejás vacío, queda no-apta hasta que la marques manualmente otra vez.
            </p>
          </div>
        </div>
      )}

      {error && <output className="block text-sm text-red-600 dark:text-red-400">{error}</output>}
      {okMessage && (
        <output className="block text-sm text-emerald-700 dark:text-emerald-300">
          {okMessage}
        </output>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar elegibilidad"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/org/${orgToken}/mascotas`)}
          disabled={pending}
          className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
