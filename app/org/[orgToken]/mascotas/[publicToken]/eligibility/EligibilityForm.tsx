"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setAdoptionEligibilityAction } from "@/src/modules/adoption/actions";

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
      <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card p-3 text-[13px]">
        <p className="text-ln-op-ink-2">
          Estado actual:{" "}
          <strong className="text-ln-op-ink">
            {current.eligible === true
              ? "Apta"
              : current.eligible === false
                ? "NO apta"
                : "Sin determinar"}
          </strong>
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-ln-op-ink">Decisión</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDecision("eligible")}
            className={`px-3 py-1.5 rounded-[6px] border text-sm ${
              decision === "eligible"
                ? "bg-ln-op-ok text-white border-ln-op-ok"
                : "border-ln-op-line text-ln-op-ink-2 hover:bg-ln-op-stripe"
            }`}
          >
            Apta para adopción
          </button>
          <button
            type="button"
            onClick={() => setDecision("not_eligible")}
            className={`px-3 py-1.5 rounded-[6px] border text-sm ${
              decision === "not_eligible"
                ? "bg-ln-op-azul text-white border-ln-op-azul"
                : "border-ln-op-line text-ln-op-ink-2 hover:bg-ln-op-stripe"
            }`}
          >
            NO apta
          </button>
        </div>
      </div>

      {decision === "not_eligible" && (
        <div className="space-y-3">
          <div>
            <label htmlFor="elig-reason" className="block text-sm font-medium text-ln-op-ink mb-1">
              Motivo
            </label>
            <select
              id="elig-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as Reason)}
              className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:ring-1 focus:ring-ln-op-azul"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="elig-notes" className="block text-sm font-medium text-ln-op-ink mb-1">
              Notas {reason === "other" && <span className="text-ln-op-danger">*</span>}
            </label>
            <textarea
              id="elig-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={reason === "other" ? "Describí el motivo" : "Notas (opcional)"}
              className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink placeholder:text-ln-op-faint focus:outline-none focus:ring-1 focus:ring-ln-op-azul"
            />
          </div>
          <div>
            <label htmlFor="elig-until" className="block text-sm font-medium text-ln-op-ink mb-1">
              Hasta (opcional)
            </label>
            <input
              id="elig-until"
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:ring-1 focus:ring-ln-op-azul"
            />
            <p className="text-[11px] text-ln-op-mute mt-1">
              Si lo dejás vacío, queda no-apta hasta que la marques manualmente otra vez.
            </p>
          </div>
        </div>
      )}

      {error && <output className="block text-sm text-ln-op-danger">{error}</output>}
      {okMessage && <output className="block text-sm text-ln-op-ok">{okMessage}</output>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-4 py-2 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-medium hover:bg-ln-op-azul-700 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Confirmar elegibilidad"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/org/${orgToken}/mascotas`)}
          disabled={pending}
          className="px-4 py-2 rounded-[6px] border border-ln-op-line text-[13px] text-ln-op-ink-2 hover:bg-ln-op-stripe"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
