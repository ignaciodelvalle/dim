"use client";

// ProposeTransferForm — 3-step wizard for cross-org transfer (spec §5.2).
// Trilogy unification handoff §4 PR-033.
//
// Steps:
//   1. Mascota — recap of which pet is being transferred (read-only).
//      CTA Continuar.
//   2. Destino — org dropdown (pre-filtered to verified orgs). CTA Continuar.
//   3. Razón + notas — reason enum + free-text. CTA Confirmar transferencia.
//
// Cierre: SuccessScreen "Handshake abierto. Esperando respuesta de [org]"
// per handoff §4 — replaces the previous router.push redirect.

import { useState, useTransition } from "react";

import { proposeCrossOrgTransferAction } from "@/app/actions/cross-org-transfer";
import { SuccessScreen } from "@/components/poncho/SuccessScreen";
import { WizardShell } from "@/components/poncho/Wizard";
import { labelClass } from "@/lib/form-classes";

interface ReceiverOption {
  id: string;
  displayName: string;
  jurisdiction: string;
  orgType: string;
}

const REASON_OPTIONS = [
  { value: "space_constraint", label: "Falta de espacio" },
  { value: "specialization_needed", label: "Especialización requerida" },
  { value: "network_redistribution", label: "Redistribución en network" },
  { value: "shelter_closing", label: "Cierre operativo del refugio" },
  { value: "post_adoption_failed_return", label: "Devolución post-adopción fallida" },
  { value: "other", label: "Otro motivo (describí abajo)" },
] as const;

const ORG_TYPE_LABEL: Record<string, string> = {
  shelter: "Refugio",
  rescue_network: "Red de rescate",
  clinic: "Clínica",
  sanitary_authority: "Autoridad sanitaria",
};

interface Props {
  senderOrgToken: string;
  petPublicToken: string;
  petName: string;
  receivers: ReceiverOption[];
}

const TOTAL_STEPS = 3;
const STEP_LABELS = ["Mascota", "Destino", "Razón y notas"];

export function ProposeTransferForm({ senderOrgToken, petPublicToken, petName, receivers }: Props) {
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [receiverOrgId, setReceiverOrgId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const reasonRequiresNotes = reason === "other";
  const canSubmit =
    !!receiverOrgId && !!reason && (!reasonRequiresNotes || notes.trim().length > 0) && !pending;
  const selectedReceiver = receivers.find((r) => r.id === receiverOrgId);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await proposeCrossOrgTransferAction({
        senderOrgToken,
        petPublicToken,
        receiverOrgId,
        reason,
        notes: notes.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <SuccessScreen
        title={`Handshake abierto para ${petName}`}
        description={
          selectedReceiver
            ? `Esperando respuesta de ${selectedReceiver.displayName}. ${petName} sigue bajo tu custodia hasta que acepten.`
            : `Esperando respuesta del destinatario. ${petName} sigue bajo tu custodia hasta que acepten.`
        }
        next={[
          { label: "Ver transferencias", href: `/org/${senderOrgToken}/transferencias` },
          {
            label: `Volver a la ficha de ${petName}`,
            href: `/org/${senderOrgToken}/mascotas/${petPublicToken}`,
            variant: "secondary",
          },
        ]}
      />
    );
  }

  return (
    <WizardShell
      currentStep={step}
      totalSteps={TOTAL_STEPS}
      stepLabels={STEP_LABELS}
      onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
    >
      {/* Step 1 — Mascota recap */}
      <section className={step === 1 ? "space-y-5" : "sr-only"} aria-hidden={step !== 1}>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Vas a transferir</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            {petName}
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Token: <span className="font-mono">{petPublicToken}</span>
          </p>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Esta propuesta crea un handshake con otra organización. La transferencia se concreta solo
          si el destinatario acepta.
        </p>
        <button
          type="button"
          onClick={() => setStep(2)}
          className="w-full px-4 py-3 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800 transition-colors"
        >
          Continuar
        </button>
      </section>

      {/* Step 2 — Destino */}
      <section className={step === 2 ? "space-y-5" : "sr-only"} aria-hidden={step !== 2}>
        <div>
          <label htmlFor="receiverOrgId" className={`${labelClass} mb-1`}>
            Organización destinataria
          </label>
          <select
            id="receiverOrgId"
            value={receiverOrgId}
            onChange={(e) => setReceiverOrgId(e.target.value)}
            required
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
          >
            <option value="">Elegí una organización verificada…</option>
            {receivers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.displayName} · {ORG_TYPE_LABEL[r.orgType] ?? r.orgType}
                {r.jurisdiction ? ` · ${r.jurisdiction}` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Solo aparecen orgs verificadas activas. Sin auto-selección por proximidad.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStep(3)}
          disabled={!receiverOrgId}
          className="w-full px-4 py-3 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
        >
          Continuar
        </button>
      </section>

      {/* Step 3 — Razón + notas */}
      <section className={step === 3 ? "space-y-5" : "sr-only"} aria-hidden={step !== 3}>
        <div>
          <label htmlFor="reason" className={`${labelClass} mb-1`}>
            Motivo de la transferencia
          </label>
          <select
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
          >
            <option value="">Elegí un motivo…</option>
            {REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="notes" className={`${labelClass} mb-1`}>
            Notas{reasonRequiresNotes ? " (obligatorias)" : " (opcional)"}
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            required={reasonRequiresNotes}
            placeholder="Contexto para que el destinatario evalúe — visible al receiver."
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <p>
            La propuesta expira en <strong>30 días</strong> si no recibe respuesta del destinatario.{" "}
            {petName} sigue bajo tu custodia hasta que la organización destinataria acepte.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="w-full px-4 py-3 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {pending ? "Enviando…" : "Confirmar transferencia"}
        </button>
      </section>
    </WizardShell>
  );
}
