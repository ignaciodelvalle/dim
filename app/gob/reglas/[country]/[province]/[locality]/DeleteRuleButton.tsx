"use client";

import { useActionState, useEffect, useState } from "react";

import { type BusinessRuleFormState, deleteBusinessRuleAction } from "@/app/actions/business-rules";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";

const initialState: BusinessRuleFormState = { error: null };

export function DeleteRuleButton({
  ruleId,
  country,
  province,
  locality,
  base,
}: {
  ruleId: string;
  country: string;
  province: string | null;
  locality: string | null;
  /**
   * Portal prefix the post-delete redirect must stay inside
   * (portal-follows-viewer, 2026-07-02) — round-tripped through the delete
   * action's `redirectTo` via the hidden `portalBase` field below.
   */
  base: "/admin" | "/gob";
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, isPending] = useActionState(
    deleteBusinessRuleAction.bind(null, ruleId),
    initialState,
  );

  // Router-drop workaround (verify-report #650 WARNING-1) — the action no
  // longer calls redirect() on success; do a full document navigation here
  // instead of relying on the framework's own post-action transition (see
  // lib/ui/full-page-action-nav.ts's module docblock for the full mechanism).
  useEffect(() => {
    if (state.redirectTo) navigateAfterActionSuccess(state.redirectTo);
  }, [state.redirectTo]);

  const reasonValid = reason.trim().length > 0;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-semibold text-ln-op-danger no-underline underline-offset-4 hover:underline"
      >
        Eliminar
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-ln-op-ink-2">
        La acción no se puede deshacer. Eliminar una regla PPP puede des-marcar mascotas afectadas.
      </p>
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="jurisdictionCountry" value={country} />
        <input type="hidden" name="jurisdictionProvince" value={province ?? ""} />
        <input type="hidden" name="jurisdictionLocality" value={locality ?? ""} />
        <input type="hidden" name="portalBase" value={base} />
        <label htmlFor={`delete-rule-reason-${ruleId}`} className="sr-only">
          Motivo de la eliminación
        </label>
        <textarea
          id={`delete-rule-reason-${ruleId}`}
          name="reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo de la eliminación (queda en el audit log)"
          className="w-full rounded-md border border-ln-op-line bg-ln-op-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ln-op-azul"
        />
        {state.error && (
          <p className="text-[var(--text-sm)] text-ln-op-danger" role="alert">
            {state.error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!reasonValid || isPending}
            className="text-sm font-semibold text-ln-op-danger underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
          >
            {isPending ? "Eliminando..." : "Confirmar eliminación"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setReason("");
            }}
            className="text-sm text-ln-op-mute transition-colors hover:text-ln-op-ink"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
