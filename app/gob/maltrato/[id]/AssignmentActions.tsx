"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
          <button
            type="button"
            onClick={handleAssign}
            disabled={pending}
            className="px-3 py-1.5 rounded-[4px] text-[12px] font-medium bg-ln-op-azul text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Procesando..." : "Asignármela"}
          </button>
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
          <button
            type="button"
            onClick={handleUnassign}
            disabled={pending}
            className="px-3 py-1.5 rounded-[4px] text-[12px] font-medium border border-ln-op-line text-ln-op-ink-2 hover:bg-ln-op-stripe disabled:opacity-50"
          >
            {pending ? "Procesando..." : "Desasignar"}
          </button>
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
