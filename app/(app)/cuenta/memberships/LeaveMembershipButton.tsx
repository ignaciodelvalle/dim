"use client";

// LeaveMembershipButton — self-leave an organization from the owner account
// page. Same flow as org/miembros/LeaveOrgButton but styled for the warm
// (ln-*) owner tier; reloads the page in place instead of navigating away.

import { useState, useTransition } from "react";

import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";
import { leaveOrganizationAction } from "@/src/modules/organizations/actions";

type Props = {
  organizationId: string;
  isLastAdmin: boolean;
};

export function LeaveMembershipButton({ organizationId, isLastAdmin }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleLeave() {
    setError(null);
    startTransition(async () => {
      const result = await leaveOrganizationAction({ organizationId });
      if ("error" in result) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      // Full document reload so the SSR memberships list drops the row
      // (router.refresh() is banned — see lib/ui/full-page-action-nav.ts).
      navigateAfterActionSuccess(window.location.href);
    });
  }

  if (isLastAdmin) {
    return (
      <button
        type="button"
        disabled
        title="Sos el único administrador. Asigná otro administrador antes de salir."
        className="cursor-not-allowed rounded-[3px] border border-[var(--color-ln-line-strong)] px-[10px] py-[5px] font-[var(--font-ln-sans)] text-[11.5px] font-medium text-[var(--color-ln-mute)] opacity-50"
      >
        Renunciar
      </button>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-[3px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-[10px] py-[5px] font-[var(--font-ln-sans)] text-[11.5px] font-medium text-[var(--color-ln-err)] transition-colors hover:bg-[var(--color-ln-stripe)]"
      >
        Renunciar
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-[6px]">
      <p className="m-0 text-right text-[11.5px] text-[var(--color-ln-mute)]">
        ¿Confirmar que querés renunciar?
      </p>
      {error && (
        <p className="m-0 text-right text-[11.5px] text-[var(--color-ln-err)]" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-[6px]">
        <button
          type="button"
          onClick={handleLeave}
          disabled={pending}
          className="rounded-[3px] bg-[var(--color-ln-err)] px-[10px] py-[5px] font-[var(--font-ln-sans)] text-[11.5px] font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? "Saliendo..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded-[3px] border border-[var(--color-ln-line-strong)] px-[10px] py-[5px] font-[var(--font-ln-sans)] text-[11.5px] font-medium text-[var(--color-ln-ink)] transition-colors hover:bg-[var(--color-ln-stripe)] disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
