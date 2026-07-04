"use client";

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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Tier B optimistic assignment: the Tomar/Liberar button swap happens
  // immediately from local state (seeded from the SSR prop) and reverts on
  // error. No router.refresh() (banned, silent-drop defect; see
  // lib/ui/full-page-action-nav.ts).
  const [assignedTo, setAssignedTo] = useState(assignedToUserId);

  const isAssignedToMe = assignedTo === currentUserId;
  const canUnassign = isAssignedToMe || isAdmin;

  function handleAssign() {
    setError(null);
    const previous = assignedTo;
    setAssignedTo(currentUserId);
    startTransition(async () => {
      const result = await assignWelfareToMeAction(reportId);
      if ("error" in result) {
        setAssignedTo(previous);
        setError(result.error);
      }
    });
  }

  function handleUnassign() {
    setError(null);
    const previous = assignedTo;
    setAssignedTo(null);
    startTransition(async () => {
      const result = await unassignWelfareAction(reportId);
      if ("error" in result) {
        setAssignedTo(previous);
        setError(result.error);
      }
    });
  }

  if (!assignedTo) {
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
          <p role="alert" className="text-sm text-ln-op-danger">
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
          <p role="alert" className="text-sm text-ln-op-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Assigned to someone else, no action available.
  return null;
}
