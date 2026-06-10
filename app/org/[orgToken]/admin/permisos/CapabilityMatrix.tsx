"use client";

// Member × capability matrix — read-only for implicit (role-based) caps,
// interactive (revoke only) for explicit approved grants.
// Granting from scratch requires a member to submit a request first; there is
// no admin-side "grant without request" action, so empty cells are inert.

import {
  type CapabilityActionState,
  decideCapabilityAction,
} from "@/src/modules/organizations/actions";
import { useActionState } from "react";

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
// Matrix
// ---------------------------------------------------------------------------

export function CapabilityMatrix({
  members,
  columns,
}: {
  members: MatrixMember[];
  columns: MatrixColumn[];
}) {
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

                // No cap — empty cell
                return (
                  <td key={col.capability} className="px-2 py-2 text-center">
                    <span className="text-[11px] text-ln-op-faint">—</span>
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
