import Link from "next/link";

import { requireUserOrRedirect } from "@/lib/auth-guards";
import { getActiveMemberships } from "@/src/modules/organizations/infrastructure/authz-resolver";

// Org type display labels — Argentine Spanish
const ORG_TYPE_LABELS: Record<string, string> = {
  clinic: "Clínica",
  shelter: "Refugio",
  rescue_network: "Red de rescate",
  sanitary_authority: "Autoridad sanitaria",
  other: "Organización",
};

// Membership role labels
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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        {/* Header */}
        <header className="space-y-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-gob-text ">
              Mis organizaciones
            </h1>
            <span className="text-sm font-medium text-gob-text-muted ">
              {count === 0 ? "ninguna" : count === 1 ? "1 membresía" : `${count} membresías`}
            </span>
          </div>
        </header>

        {/* Empty state */}
        {count === 0 && (
          <div className="rounded-lg border border-gob-border  p-8 text-center space-y-3">
            <p className="text-sm text-gob-text-gray ">
              No tenés membresías de ninguna organización todavía.
            </p>
            <p className="text-sm text-gob-text-muted ">
              Si querés crear una clínica, refugio o red de rescate,{" "}
              <Link
                href="/cuenta/upgrade"
                className="underline underline-offset-4 hover:text-gob-text  transition-colors"
              >
                pasate a veterinario/a
              </Link>{" "}
              desde tu cuenta.
            </p>
          </div>
        )}

        {/* Membership list */}
        {count > 0 && (
          <ul className="space-y-3">
            {memberships.map(({ membership, organization }) => (
              <li key={membership.id}>
                <Link
                  href={`/org/${organization.publicToken}`}
                  className="flex items-start justify-between rounded-lg border border-gob-border  p-4 hover:bg-gob-surface-alt  transition-colors gap-4"
                >
                  <div className="space-y-2 min-w-0">
                    {/* Org name */}
                    <p className="text-sm font-medium text-gob-text  truncate">
                      {organization.displayName}
                    </p>

                    {/* Badges row */}
                    <div className="flex flex-wrap gap-2">
                      <OrgTypeBadge orgType={organization.orgType} />
                      <VerifiedBadge verified={organization.verified} />
                      <RoleBadge role={membership.role} />
                    </div>

                    {/* Joined date */}
                    <p className="text-xs text-gob-text-muted ">
                      Miembro desde{" "}
                      {membership.joinedAt.toLocaleDateString("es-AR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>

                  <span className="text-gob-text-muted  shrink-0 mt-0.5" aria-hidden>
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Back link */}
        <div className="pt-2">
          <Link
            href="/cuenta"
            className="text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text  transition-colors"
          >
            ← Volver a mi cuenta
          </Link>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OrgTypeBadge({ orgType }: { orgType: string }) {
  const label = ORG_TYPE_LABELS[orgType] ?? orgType;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gob-info/10  text-gob-azul-link  border-gob-info ">
      {label}
    </span>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gob-success/10  text-gob-success  border-gob-success ">
        Verificada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gob-warning/10  text-gob-warning-text  border-gob-warning ">
      Pendiente verificación
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role] ?? role;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gob-surface-alt  text-gob-text-gray  border-gob-border ">
      {label}
    </span>
  );
}
