"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { assignWelfareToMeAction, unassignWelfareAction } from "@/app/actions/welfare-assign";

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

  const isAssignedToMe = assignedToUserId === currentUserId;
  const canUnassign = isAssignedToMe || isAdmin;

  function handleAssign() {
    startTransition(async () => {
      const result = await assignWelfareToMeAction(reportId);
      if ("error" in result) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleUnassign() {
    startTransition(async () => {
      const result = await unassignWelfareAction(reportId);
      if ("error" in result) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!assignedToUserId) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAssign}
          disabled={pending}
          className="px-3 py-1.5 rounded text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Procesando..." : "Asignármela"}
        </button>
      </div>
    );
  }

  if (canUnassign) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleUnassign}
          disabled={pending}
          className="px-3 py-1.5 rounded text-sm font-medium border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 disabled:opacity-50"
        >
          {pending ? "Procesando..." : "Desasignar"}
        </button>
      </div>
    );
  }

  // Assigned to someone else, no action available.
  return null;
}
