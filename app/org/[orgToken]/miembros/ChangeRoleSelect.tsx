"use client";

// ChangeRoleSelect — inline role selector wired to changeMemberRoleAction.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { changeMemberRoleAction } from "@/app/actions/org-memberships";

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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value;
    if (newRole === currentRole) return;
    setError(null);
    startTransition(async () => {
      const result = await changeMemberRoleAction({
        organizationId,
        membershipId,
        newRole,
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
      <select
        defaultValue={currentRole}
        onChange={handleChange}
        disabled={pending}
        className="rounded-lg border border-gob-border bg-white px-2 py-1 text-xs text-gob-text focus:outline-none focus:ring-2 focus:ring-gob-primary disabled:opacity-60"
      >
        {settableRoles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-xs text-gob-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
