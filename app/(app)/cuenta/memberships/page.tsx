// Mis organizaciones — Libreta Nacional redesign.
// Data fetching unchanged.

import Link from "next/link";

import { LnSectionHead } from "@/components/ui/DocElements";
import { LnCallout } from "@/components/ui/DocElements";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { getActiveMemberships } from "@/src/modules/organizations/infrastructure/authz-resolver";

const ORG_TYPE_LABELS: Record<string, string> = {
  clinic: "Clínica",
  shelter: "Refugio",
  rescue_network: "Red de rescate",
  sanitary_authority: "Autoridad sanitaria",
  other: "Organización",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador/a",
  coordinator: "Coordinador/a",
  member: "Miembro",
  volunteer: "Voluntario/a",
  foster: "Transitante",
  vet_individual: "Veterinario/a individual",
};

export default async function MembershipsPage() {
  const { user } = await requireUserOrRedirect();
  const memberships = await getActiveMemberships(user.id);
  const count = memberships.length;

  return (
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/cuenta"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mi cuenta
      </Link>

      {/* Header */}
      <div className="mb-[28px] flex items-baseline gap-[14px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Mis organizaciones
        </h1>
        <span className="font-[var(--font-ln-mono)] text-[12px] text-[var(--color-ln-mute)]">
          {count === 0 ? "ninguna" : count === 1 ? "1 membresía" : `${count} membresías`}
        </span>
      </div>

      {/* Empty state */}
      {count === 0 && (
        <div className="rounded-[4px] border border-dashed border-[var(--color-ln-line-strong)] p-[40px] text-center">
          <p className="text-[13px] text-[var(--color-ln-mute)]">
            No tenés membresías de ninguna organización todavía.
          </p>
          <p className="mt-[8px] text-[12.5px] text-[var(--color-ln-mute)]">
            Si querés crear una clínica, refugio o red de rescate,{" "}
            <Link
              href="/cuenta/upgrade"
              className="text-[var(--color-ln-azul)] no-underline hover:underline"
            >
              pasate a veterinario/a
            </Link>{" "}
            desde tu cuenta.
          </p>
        </div>
      )}

      {/* Memberships list */}
      {count > 0 && (
        <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
          {memberships.map(({ membership, organization }) => (
            <Link
              key={membership.id}
              href={`/org/${organization.publicToken}`}
              className="flex items-center justify-between gap-4 border-b border-[var(--color-ln-line-2)] px-[18px] py-[14px] no-underline last:border-b-0 hover:bg-[var(--color-ln-stripe)] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="font-[var(--font-ln-serif)] text-[15px] font-semibold leading-tight text-[var(--color-ln-ink)] truncate">
                  {organization.displayName}
                </p>
                <div className="mt-[6px] flex flex-wrap gap-[6px]">
                  <OrgTypeBadge orgType={organization.orgType} />
                  <VerifiedBadge verified={organization.verified} />
                  <RoleBadge role={membership.role} />
                </div>
                <p className="mt-[5px] font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
                  Desde{" "}
                  {membership.joinedAt.toLocaleDateString("es-AR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="flex-shrink-0 text-[16px] text-[var(--color-ln-mute)]"
              >
                ›
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OrgTypeBadge({ orgType }: { orgType: string }) {
  const label = ORG_TYPE_LABELS[orgType] ?? orgType;
  return (
    <span className="inline-flex items-center rounded-[2px] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] px-[7px] py-[2px] font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.1em] text-[var(--color-ln-azul)]">
      {label}
    </span>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center rounded-[2px] border border-[#c8e2d2] bg-[#eef6f0] px-[7px] py-[2px] font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.1em] text-[var(--color-ln-ok)]">
        Verificada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-[2px] border border-[#f0dcb4] bg-[#fdf2e0] px-[7px] py-[2px] font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.1em] text-[var(--color-ln-warn)]">
      Pendiente
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role] ?? role;
  return (
    <span className="inline-flex items-center rounded-[2px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] px-[7px] py-[2px] font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
      {label}
    </span>
  );
}
