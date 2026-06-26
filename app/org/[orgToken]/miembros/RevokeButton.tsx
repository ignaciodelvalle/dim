"use client";

// RevokeButton — confirms and calls revokeInvitationAction for a pending invite.

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  return (
    <div className="flex flex-col gap-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-[4px] border border-ln-op-danger px-3 py-[5px] text-sm font-medium text-ln-op-danger transition-colors hover:bg-ln-op-danger hover:text-white"
      >
        Revocar
      </button>
      {error && (
        <p className="text-sm text-ln-op-danger" role="alert">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={handleRevoke}
        title={`¿Revocar la invitación de ${email}?`}
        description="La invitación quedará inválida y el destinatario no podrá unirse con este enlace."
        confirmLabel="Revocar"
        tone="danger"
        pending={pending}
        triggerRef={triggerRef}
      />
    </div>
  );
}
