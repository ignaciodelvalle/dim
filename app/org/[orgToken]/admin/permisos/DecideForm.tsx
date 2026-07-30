"use client";

import { OpButton } from "@/components/ui/dashboard";
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
    const variant = tone === "approve" ? "ok" : "danger";
    if (!isOpen) {
      return (
        <OpButton variant={variant} size="sm" onClick={() => setShowReason(decision)}>
          {label}
        </OpButton>
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
          className="text-sm w-full rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card p-2 text-ln-op-ink focus:outline-none focus:ring-1 focus:ring-ln-op-azul"
        />
        <div className="flex items-center gap-2">
          <OpButton type="submit" variant={variant} size="sm" disabled={isSubmitting}>
            {/* Verb of the act, never "Confirmar <acto>" (D.3, 2026-07-30) —
                the commit button repeats the trigger's own verb: Aprobar /
                Denegar / Revocar. */}
            {isSubmitting ? "Enviando…" : label}
          </OpButton>
          <button
            type="button"
            onClick={() => setShowReason(null)}
            className="text-sm px-2 py-1 rounded-[var(--radius-sm)] text-ln-op-mute hover:underline"
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
