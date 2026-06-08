"use client";

// AcceptButton — calls acceptInvitationAction and redirects to the org portal on success.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/poncho";
import { acceptInvitationAction } from "@/src/modules/organizations/actions";

type Props = {
  invitationToken: string;
};

export function AcceptButton({ invitationToken }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptInvitationAction({ invitationToken });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/org/${result.orgToken}`);
    });
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-gob-danger text-center" role="alert">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="success"
        loading={pending}
        onClick={handleAccept}
        className="w-full"
      >
        Aceptar invitación
      </Button>
    </div>
  );
}
