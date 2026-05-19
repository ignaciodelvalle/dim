"use client";

// Sender form for cross-org transfer (spec §5.2). The receiver org id
// is selected from a dropdown that the parent server component
// pre-populates with verified shelter / clinic / rescue_network orgs.

import { useState, useTransition } from "react";

import { proposeCrossOrgTransferAction } from "@/app/actions/cross-org-transfer";
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
        <label
          htmlFor="receiverOrgId"
          className="mb-1 block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
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

      <div>
        <label
          htmlFor="reason"
          className="mb-1 block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
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
        <label
          htmlFor="notes"
          className="mb-1 block text-sm font-medium text-neutral-900 dark:text-neutral-50"
        >
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
          La propuesta expira en <strong>30 días</strong> si no recibe respuesta del destinatario.
          {petName} sigue bajo tu custodia hasta que la organización destinataria acepte.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
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
