"use client";

// Sender form for cross-org transfer (spec §5.2). The receiver org id
// is selected from a dropdown that the parent server component
// pre-populates with verified shelter / clinic / rescue_network orgs.

import { useState, useTransition } from "react";

import { proposeCrossOrgTransferAction } from "@/app/actions/cross-org-transfer";
import { labelClass } from "@/lib/form-classes";
import { useRouter } from "next/navigation";

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

export function ProposeTransferForm({ senderOrgToken, petPublicToken, petName, receivers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [receiverOrgId, setReceiverOrgId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reasonRequiresNotes = reason === "other";
  const canSubmit =
    !!receiverOrgId && !!reason && (!reasonRequiresNotes || notes.trim().length > 0) && !pending;

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
      router.push(`/org/${senderOrgToken}/transferencias`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="receiverOrgId" className={`${labelClass} mb-1`}>
          Organización destinataria
        </label>
        <select
          id="receiverOrgId"
          value={receiverOrgId}
          onChange={(e) => setReceiverOrgId(e.target.value)}
          required
          className="w-full rounded-lg border border-gob-border-strong bg-white px-3 py-2 text-sm text-gob-text"
        >
          <option value="">Elegí una organización verificada…</option>
          {receivers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.displayName} · {ORG_TYPE_LABEL[r.orgType] ?? r.orgType}
              {r.jurisdiction ? ` · ${r.jurisdiction}` : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gob-text-muted">
          Solo aparecen orgs verificadas activas. Sin auto-selección por proximidad.
        </p>
      </div>

      <div>
        <label htmlFor="reason" className={`${labelClass} mb-1`}>
          Motivo de la transferencia
        </label>
        <select
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          className="w-full rounded-lg border border-gob-border-strong bg-white px-3 py-2 text-sm text-gob-text"
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
          className="w-full rounded-lg border border-gob-border-strong bg-white px-3 py-2 text-sm text-gob-text"
        />
      </div>

      <div className="rounded-lg border border-gob-warning/40 bg-gob-warning/10 p-3 text-xs text-gob-warning-text">
        <p>
          La propuesta expira en <strong>30 días</strong> si no recibe respuesta del destinatario.
          {petName} sigue bajo tu custodia hasta que la organización destinataria acepte.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-gob-danger/30 bg-gob-danger/10 p-3 text-sm text-gob-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-gob-border pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md px-4 py-2 text-sm text-gob-text-gray hover:bg-gob-surface-alt"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Enviando…" : "Enviar propuesta"}
        </button>
      </div>
    </div>
  );
}
