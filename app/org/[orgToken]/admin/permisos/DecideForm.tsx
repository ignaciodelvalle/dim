"use client";

import {
  type CapabilityActionState,
  decideCapabilityAction,
} from "@/src/modules/organizations/actions";
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
        ? "bg-ln-op-ok text-white hover:bg-ln-op-ok/90"
        : "bg-ln-op-danger text-white hover:bg-ln-op-danger/90";
    if (!isOpen) {
      return (
        <button
          type="button"
          onClick={() => setShowReason(decision)}
          className={`text-sm px-2 py-1 rounded-[4px] transition-colors ${baseClass}`}
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
          className="text-sm w-full rounded-[4px] border border-ln-op-line bg-ln-op-card p-2 text-ln-op-ink focus:outline-none focus:ring-1 focus:ring-ln-op-azul"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className={`text-sm px-2 py-1 rounded-[4px] transition-colors disabled:opacity-50 ${baseClass}`}
          >
            {isSubmitting ? "Enviando…" : `Confirmar ${label.toLowerCase()}`}
          </button>
          <button
            type="button"
            onClick={() => setShowReason(null)}
            className="text-sm px-2 py-1 rounded-[4px] text-ln-op-mute hover:underline"
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
      {state.error && <p className="text-sm text-ln-op-danger">{state.error}</p>}
    </div>
  );
}
