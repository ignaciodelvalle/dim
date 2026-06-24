"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { OpButton } from "@/components/ui/dashboard";
import { assignWelfareToMeAction, unassignWelfareAction } from "@/src/modules/welfare/actions";

type AssignmentActionsProps = {
  reportId: string;
  assignedToUserId: string | null;
  currentUserId: string;
  isAdmin: boolean;
};

export function AssignmentActions({
  reportId,
  assignedToUserId,
  currentUserId,
  isAdmin,
}: AssignmentActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isAssignedToMe = assignedToUserId === currentUserId;
  const canUnassign = isAssignedToMe || isAdmin;

  function handleAssign() {
    setError(null);
    startTransition(async () => {
      const result = await assignWelfareToMeAction(reportId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleUnassign() {
    setError(null);
    startTransition(async () => {
      const result = await unassignWelfareAction(reportId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!assignedToUserId) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <OpButton
            type="button"
            onClick={handleAssign}
            disabled={pending}
            variant="primary"
            size="sm"
          >
            {pending ? "Procesando..." : "Asignármela"}
          </OpButton>
        </div>
        {error && (
          <p role="alert" className="text-[12px] text-ln-op-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (canUnassign) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <OpButton
            type="button"
            onClick={handleUnassign}
            disabled={pending}
            variant="ghost"
            size="sm"
          >
            {pending ? "Procesando..." : "Desasignar"}
          </OpButton>
        </div>
        {error && (
          <p role="alert" className="text-[12px] text-ln-op-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Assigned to someone else, no action available.
  return null;
}
