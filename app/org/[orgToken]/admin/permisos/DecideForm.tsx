"use client";

import { type CapabilityActionState, decideCapabilityAction } from "@/app/actions/capabilities";
import { useActionState, useState } from "react";

const initialState: CapabilityActionState = { error: null };

export function DecideForm({
  grantId,
  pending,
  approved,
}: {
  grantId: string;
  pending: boolean;
  approved: boolean;
}) {
  const [state, formAction, isSubmitting] = useActionState(decideCapabilityAction, initialState);
  const [showReason, setShowReason] = useState<"approved" | "denied" | "revoked" | null>(null);

  function renderAction(
    decision: "approved" | "denied" | "revoked",
    label: string,
    tone: "approve" | "deny",
  ) {
    const isOpen = showReason === decision;
    const baseClass =
      tone === "approve"
        ? "bg-emerald-600 text-white hover:bg-emerald-700"
        : "bg-red-600 text-white hover:bg-red-700";
    if (!isOpen) {
      return (
        <button
          type="button"
          onClick={() => setShowReason(decision)}
          className={`text-xs px-2 py-1 rounded ${baseClass}`}
        >
          {label}
        </button>
      );
    }
    return (
      <form action={formAction} className="flex flex-col gap-2 w-full">
        <input type="hidden" name="grantId" value={grantId} />
        <input type="hidden" name="decision" value={decision} />
        <textarea
          name="reason"
          rows={2}
          maxLength={500}
          placeholder="Motivo (opcional)"
          className="text-xs w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className={`text-xs px-2 py-1 rounded ${baseClass} disabled:opacity-50`}
          >
            {isSubmitting ? "Enviando…" : `Confirmar ${label.toLowerCase()}`}
          </button>
          <button
            type="button"
            onClick={() => setShowReason(null)}
            className="text-xs px-2 py-1 rounded text-neutral-600 dark:text-neutral-400 hover:underline"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <div className="flex items-center gap-2 flex-wrap">
        {pending && (
          <>
            {renderAction("approved", "Aprobar", "approve")}
            {renderAction("denied", "Denegar", "deny")}
          </>
        )}
        {approved && renderAction("revoked", "Revocar", "deny")}
      </div>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}
