"use client";

// RevokeButton — confirms and calls revokeInvitationAction for a pending invite.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { revokeInvitationAction } from "@/src/modules/organizations/actions";

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
        // Keep the confirm panel open so the error is visible to the user.
        setError(result.error);
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
        className="rounded-[4px] border border-ln-op-danger px-3 py-[5px] text-[12px] font-medium text-ln-op-danger transition-colors hover:bg-ln-op-danger hover:text-white"
      >
        Revocar
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[12px] text-ln-op-mute">
        ¿Revocar la invitación de <strong>{email}</strong>?
      </p>
      {error && (
        <p className="text-[12px] text-ln-op-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleRevoke}
          disabled={pending}
          className="rounded-[4px] bg-ln-op-danger px-3 py-[5px] text-[12px] font-medium text-white transition-colors disabled:opacity-60"
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
          className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-[12px] font-medium text-ln-op-ink transition-colors hover:bg-ln-op-stripe disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
