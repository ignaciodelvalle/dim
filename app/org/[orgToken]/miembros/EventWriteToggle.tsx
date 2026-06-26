"use client";

// EventWriteToggle — toggle canWritePetEvents via setMemberEventWriteAction.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setMemberEventWriteAction } from "@/src/modules/organizations/actions";

type Props = {
  organizationId: string;
  membershipId: string;
  canWrite: boolean;
};

export function EventWriteToggle({ organizationId, membershipId, canWrite }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const result = await setMemberEventWriteAction({
        organizationId,
        membershipId,
        canWrite: !canWrite,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        aria-pressed={canWrite}
        title={canWrite ? "Quitar acceso a eventos clínicos" : "Dar acceso a eventos clínicos"}
        className={[
          "rounded-[4px] px-3 py-[5px] text-sm font-medium transition-colors disabled:opacity-60",
          canWrite
            ? "border border-ln-op-ok-bd bg-ln-op-ok-bg text-ln-op-ok hover:bg-ln-op-ok hover:text-white"
            : "border border-ln-op-line text-ln-op-mute hover:bg-ln-op-stripe",
        ].join(" ")}
      >
        {pending ? "..." : canWrite ? "Clínica ✓" : "Clínica"}
      </button>
      {error && (
        <p className="text-sm text-ln-op-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
