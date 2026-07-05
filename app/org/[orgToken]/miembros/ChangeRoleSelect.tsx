"use client";

// ChangeRoleSelect — inline role selector wired to changeMemberRoleAction.

import { useState, useTransition } from "react";

import { changeMemberRoleAction } from "@/src/modules/organizations/actions";

type Props = {
  organizationId: string;
  membershipId: string;
  currentRole: string;
  settableRoles: { value: string; label: string }[];
};

export function ChangeRoleSelect({
  organizationId,
  membershipId,
  currentRole,
  settableRoles,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState(currentRole);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value;
    if (newRole === selectedRole) return;
    setError(null);
    setSelectedRole(newRole);
    startTransition(async () => {
      const result = await changeMemberRoleAction({
        organizationId,
        membershipId,
        newRole,
      });
      if ("error" in result) {
        setError(result.error);
        setSelectedRole(currentRole);
      }
      // Tier B: the optimistic selectedRole (with revert above) is the
      // terminal UI state — no router.refresh(); it is banned (silent-drop
      // defect, see lib/ui/full-page-action-nav.ts).
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={selectedRole}
        onChange={handleChange}
        disabled={pending}
        className="rounded-[var(--radius-sm)] border border-ln-op-line bg-ln-op-card px-2 py-[5px] text-sm text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul disabled:opacity-60"
      >
        {settableRoles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-sm text-ln-op-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
