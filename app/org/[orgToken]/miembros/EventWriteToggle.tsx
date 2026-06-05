"use client";

// EventWriteToggle — toggle canWritePetEvents via setMemberEventWriteAction.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setMemberEventWriteAction } from "@/app/actions/org-memberships";

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
          "rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60",
          canWrite
            ? "bg-gob-success-light border border-gob-success text-gob-success hover:bg-gob-success hover:text-white"
            : "border border-gob-border text-gob-text-muted hover:bg-gob-surface-alt",
        ].join(" ")}
      >
        {pending ? "..." : canWrite ? "Clínica ✓" : "Clínica"}
      </button>
      {error && (
        <p className="text-xs text-gob-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
