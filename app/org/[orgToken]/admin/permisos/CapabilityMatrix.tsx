"use client";

// Member × capability matrix — read-only for implicit (role-based) caps,
// interactive (revoke) for explicit approved grants,
// interactive (grant) for empty grantable cells.
// Implicit cells (role-based) remain inert.
// Admin row cells are all inert (universal implicit grant).

import {
  type CapabilityActionState,
  decideCapabilityAction,
  grantCapabilityAction,
} from "@/src/modules/organizations/actions";
import { useRouter } from "next/navigation";
import React, { useActionState, useTransition } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatrixMember = {
  membershipId: string;
  displayName: string;
  role: string;
  /** Map from capability → grant id (only explicit approved grants). */
  explicitGrants: Record<string, string>;
  /** Set of capabilities that come from role (implicit). */
  implicitCaps: Set<string>;
};

export type MatrixProps = {
  members: MatrixMember[];
  columns: MatrixColumn[];
  organizationId: string;
  /** The viewer's own membership ID — used to block self-grant in empty cells. */
  callerMembershipId: string;
};

export type MatrixColumn = {
  capability: string;
  label: string;
};

// ---------------------------------------------------------------------------
// Single revoke cell — each cell needs its own action state
// ---------------------------------------------------------------------------

function RevokeCell({ grantId }: { grantId: string }) {
  const [state, formAction, isSubmitting] = useActionState<CapabilityActionState, FormData>(
    decideCapabilityAction,
    { error: null },
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <form action={formAction}>
        <input type="hidden" name="grantId" value={grantId} />
        <input type="hidden" name="decision" value="revoked" />
        <button
          type="submit"
          disabled={isSubmitting}
          title="Revocar este permiso"
          aria-label="Revocar"
          onClick={(e) => {
            if (!confirm("¿Revocar este permiso?")) e.preventDefault();
          }}
          className="group flex h-6 w-6 items-center justify-center rounded-[3px] bg-ln-op-ok-bg text-ln-op-ok transition-colors hover:bg-ln-op-danger-bg hover:text-ln-op-danger disabled:opacity-50"
        >
          <span aria-hidden className="text-[14px] leading-none">
            ✓
          </span>
        </button>
      </form>
      {state.error && <span className="text-[10px] text-ln-op-danger">{state.error}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grant cell — empty cell that becomes interactive for grantable capabilities
// ---------------------------------------------------------------------------

function GrantCell({
  organizationId,
  membershipId,
  capability,
  capabilityLabel,
  isSelf,
}: {
  organizationId: string;
  membershipId: string;
  capability: string;
  capabilityLabel: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (isSelf) {
    return (
      <div className="flex items-center justify-center">
        <span
          title="No podés concederte permisos a vos mismo"
          aria-label="Autoconceción bloqueada"
          className="text-[11px] text-ln-op-faint cursor-not-allowed select-none"
        >
          —
        </span>
      </div>
    );
  }

  function handleClick() {
    if (!confirm(`¿Conceder el permiso "${capabilityLabel}"?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await grantCapabilityAction({ organizationId, membershipId, capability });
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={isPending}
        title={`Conceder: ${capabilityLabel}`}
        aria-label="Conceder"
        onClick={handleClick}
        className="flex h-6 w-6 items-center justify-center rounded-[3px] text-ln-op-faint transition-colors hover:bg-ln-op-ok-bg hover:text-ln-op-ok disabled:opacity-50"
      >
        <span aria-hidden className="text-[14px] leading-none">
          +
        </span>
      </button>
      {error && <span className="text-[10px] text-ln-op-danger">{error}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

export function CapabilityMatrix({
  members,
  columns,
  organizationId,
  callerMembershipId,
}: MatrixProps) {
  if (members.length === 0) {
    return (
      <p className="py-4 text-[13px] text-ln-op-mute">No hay miembros activos para mostrar.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-ln-op-line-2">
            <th className="sticky left-0 z-10 min-w-[160px] bg-ln-op-card py-2 pr-3 text-left font-semibold text-ln-op-ink">
              Miembro
            </th>
            <th className="min-w-[60px] py-2 pr-2 text-left font-semibold text-ln-op-mute">Rol</th>
            {columns.map((col) => (
              <th
                key={col.capability}
                title={col.capability}
                className="min-w-[88px] px-2 py-2 text-center font-medium text-ln-op-mute"
              >
                <span className="block max-w-[84px] leading-[1.2]">{col.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr
              key={member.membershipId}
              className="border-b border-ln-op-line last:border-0 hover:bg-ln-op-stripe/50"
            >
              {/* Name */}
              <td className="sticky left-0 z-10 bg-ln-op-card py-2 pr-3 font-medium text-ln-op-ink">
                {member.displayName}
              </td>
              {/* Role */}
              <td className="py-2 pr-2 text-ln-op-mute">
                {ROLE_SHORT[member.role] ?? member.role}
              </td>
              {/* Capability cells */}
              {columns.map((col) => {
                const grantId = member.explicitGrants[col.capability];
                const isImplicit = member.implicitCaps.has(col.capability);

                if (grantId) {
                  // Explicit approved grant — interactive revoke
                  return (
                    <td key={col.capability} className="px-2 py-2 text-center">
                      <RevokeCell grantId={grantId} />
                    </td>
                  );
                }

                if (isImplicit) {
                  // Implicit via role — read-only, dimmed
                  return (
                    <td key={col.capability} className="px-2 py-2 text-center">
                      <span
                        title="Permiso incluido por el rol"
                        aria-label="Incluido por rol"
                        className="flex items-center justify-center"
                      >
                        <span className="text-[13px] text-ln-op-mute opacity-50">✓</span>
                        <span className="sr-only">por rol</span>
                      </span>
                    </td>
                  );
                }

                // No cap — interactive grant cell (admin role is already fully implicit, show inert)
                if (member.role === "admin") {
                  return (
                    <td key={col.capability} className="px-2 py-2 text-center">
                      <span className="text-[11px] text-ln-op-faint">—</span>
                    </td>
                  );
                }

                const isSelf = member.membershipId === callerMembershipId;
                return (
                  <td key={col.capability} className="px-2 py-2 text-center">
                    <GrantCell
                      organizationId={organizationId}
                      membershipId={member.membershipId}
                      capability={col.capability}
                      capabilityLabel={col.label}
                      isSelf={isSelf}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-ln-op-mute">
        <span className="flex items-center gap-1">
          <span className="text-[13px] text-ln-op-ok">✓</span>
          Explícito (revocable)
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[13px] opacity-50">✓</span>
          Por rol (implícito)
        </span>
        <span className="flex items-center gap-1">
          <span className="text-ln-op-faint">+</span>
          Conceder directo
        </span>
        <span className="flex items-center gap-1">
          <span>—</span>
          Sin permiso
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Short role labels for the compact matrix column
// ---------------------------------------------------------------------------

const ROLE_SHORT: Record<string, string> = {
  admin: "Admin",
  coordinator: "Coord.",
  member: "Miembro",
  volunteer: "Volunt.",
  vet_individual: "Vet.",
  foster: "Tránsito",
};
