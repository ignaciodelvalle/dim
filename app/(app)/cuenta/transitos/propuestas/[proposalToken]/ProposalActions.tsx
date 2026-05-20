"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  acceptFosterProposalAction,
  rejectFosterProposalAction,
} from "@/app/actions/foster-proposals";
import { labelClass } from "@/lib/form-classes";

const REJECTION_REASONS = [
  { value: "capacity", label: "No tengo capacity ahora" },
  { value: "health_mismatch", label: "No me siento preparado/a para esta condición" },
  { value: "timing", label: "Mal momento" },
  { value: "distance", label: "Muy lejos" },
  { value: "household", label: "Razones del hogar" },
  { value: "other", label: "Otro" },
] as const;

type RejectionReason = (typeof REJECTION_REASONS)[number]["value"];

export function ProposalActions({
  proposalPublicToken,
  petName,
  orgName,
}: {
  proposalPublicToken: string;
  petName: string;
  orgName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "accept" | "reject">("none");

  // Accept state
  const [allowCoFoster, setAllowCoFoster] = useState(false);
  const [acceptNotes, setAcceptNotes] = useState("");

  // Reject state
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>("capacity");
  const [rejectNotes, setRejectNotes] = useState("");

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptFosterProposalAction({
        proposalPublicToken,
        allowCoFoster,
        responseNotes: acceptNotes.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      let msg = `Aceptaste el tránsito de ${petName}. Te quedan ${result.remainingSlots} slot(s).`;
      if (result.cascadeCancelledProposals.length > 0) {
        msg += ` ${result.cascadeCancelledProposals.length} propuesta(s) pendiente(s) se cancelaron por falta de capacity.`;
      }
      setOkMessage(msg);
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectFosterProposalAction({
        proposalPublicToken,
        rejectionReason,
        responseNotes: rejectNotes.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOkMessage(`Rechazaste la propuesta de ${orgName}.`);
      router.refresh();
    });
  }

  if (okMessage) {
    return (
      <p className="text-sm rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
        {okMessage}
      </p>
    );
  }

  if (mode === "accept") {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20 p-4 space-y-3">
        <h3 className="font-medium text-emerald-900 dark:text-emerald-100">
          Aceptar tránsito de {petName}
        </h3>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={allowCoFoster}
            onChange={(e) => setAllowCoFoster(e.target.checked)}
            className="h-4 w-4 mt-0.5"
          />
          <span className="text-neutral-800 dark:text-neutral-200">
            Permito que la organización asigne otro co-foster mientras yo lo cuide. Podés cambiarlo
            después.
          </span>
        </label>
        <textarea
          value={acceptNotes}
          onChange={(e) => setAcceptNotes(e.target.value)}
          rows={2}
          placeholder="Notas para el refugio (opcional)"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
        />
        {error && <output className="block text-sm text-red-600 dark:text-red-400">{error}</output>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={accept}
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? "Aceptando..." : "Confirmar aceptación"}
          </button>
          <button
            type="button"
            onClick={() => setMode("none")}
            disabled={pending}
            className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (mode === "reject") {
    return (
      <div className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-4 space-y-3">
        <h3 className="font-medium text-neutral-900 dark:text-neutral-50">Rechazar propuesta</h3>
        <div>
          <label htmlFor="reject-reason" className={`${labelClass} mb-1`}>
            Motivo
          </label>
          <select
            id="reject-reason"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value as RejectionReason)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
          >
            {REJECTION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={rejectNotes}
          onChange={(e) => setRejectNotes(e.target.value)}
          rows={2}
          placeholder="Notas (opcional)"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
        />
        {error && <output className="block text-sm text-red-600 dark:text-red-400">{error}</output>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reject}
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Enviando..." : "Confirmar rechazo"}
          </button>
          <button
            type="button"
            onClick={() => setMode("none")}
            disabled={pending}
            className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => setMode("accept")}
        className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
      >
        Aceptar
      </button>
      <button
        type="button"
        onClick={() => setMode("reject")}
        className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900"
      >
        Rechazar
      </button>
    </div>
  );
}
