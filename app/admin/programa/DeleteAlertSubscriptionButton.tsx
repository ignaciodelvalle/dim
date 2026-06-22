"use client";

// C10 — 2-step inline confirmation for deleting an alert subscription.
//
// The page (/admin/programa) is a server component; only this button is a
// client component. It posts to the existing deleteAlertSubscriptionAction
// server action via a plain <form>, gated behind an idle → confirming step
// (mirrors DeleteRuleButton's pattern). No reason capture — alert subscriptions
// are operator-owned config, not an audited destructive action.

import { useState } from "react";

import { deleteAlertSubscriptionAction } from "@/app/actions/alert-subscriptions";

export function DeleteAlertSubscriptionButton({ subscriptionId }: { subscriptionId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="h-11 rounded-[6px] border border-ln-op-danger-bd px-3 text-[12px] text-ln-op-danger hover:bg-ln-op-danger-bg"
        aria-label="Eliminar suscripción"
      >
        Eliminar
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <form action={deleteAlertSubscriptionAction}>
        <input type="hidden" name="id" value={subscriptionId} />
        <button
          type="submit"
          className="h-11 rounded-[6px] bg-ln-op-danger px-3 text-[12px] font-semibold text-white hover:opacity-90"
        >
          Confirmar
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="h-11 rounded-[6px] border border-ln-op-line px-3 text-[12px] text-ln-op-mute hover:text-ln-op-ink"
      >
        Cancelar
      </button>
    </div>
  );
}
