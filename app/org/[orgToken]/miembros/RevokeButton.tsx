"use client";

// RevokeButton — confirms and calls revokeInvitationAction for a pending invite.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { revokeInvitationAction } from "@/app/actions/org-invitations";

type Props = {
  organizationId: string;
  invitationToken: string;
  email: string;
  orgToken: string;
};

export function RevokeButton({ organizationId, invitationToken, email, orgToken }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokeInvitationAction({ organizationId, invitationToken });
      if ("error" in result) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-gob-danger px-3 py-1 text-xs font-medium text-gob-danger transition-colors hover:bg-gob-danger hover:text-white"
      >
        Revocar
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-gob-text-muted">
        ¿Revocar la invitación de <strong>{email}</strong>?
      </p>
      {error && (
        <p className="text-xs text-gob-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleRevoke}
          disabled={pending}
          className="rounded-full bg-gob-danger px-3 py-1 text-xs font-medium text-white disabled:opacity-60 transition-colors hover:bg-gob-danger"
        >
          {pending ? "Revocando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded-full border border-gob-border-strong px-3 py-1 text-xs font-medium text-gob-text disabled:opacity-60 transition-colors hover:bg-gob-surface-alt"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
