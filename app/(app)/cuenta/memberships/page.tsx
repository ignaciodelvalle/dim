import Link from "next/link";

import { requireUserOrRedirect } from "@/lib/auth-guards";
import { getActiveMemberships } from "@/lib/capabilities";

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
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        {/* Header */}
        <header className="space-y-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Mis organizaciones
            </h1>
            <span className="text-sm font-medium text-neutral-500 dark:text-neutral-500">
              {count === 0 ? "ninguna" : count === 1 ? "1 membresía" : `${count} membresías`}
            </span>
          </div>
        </header>

        {/* Empty state */}
        {count === 0 && (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center space-y-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No tenés membresías de ninguna organización todavía.
            </p>
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              Si querés crear una clínica, refugio o red de rescate,{" "}
              <Link
                href="/cuenta/upgrade"
                className="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
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
                  className="flex items-start justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors gap-4"
                >
                  <div className="space-y-2 min-w-0">
                    {/* Org name */}
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                      {organization.displayName}
                    </p>

                    {/* Badges row */}
                    <div className="flex flex-wrap gap-2">
                      <OrgTypeBadge orgType={organization.orgType} />
                      <VerifiedBadge verified={organization.verified} />
                      <RoleBadge role={membership.role} />
                    </div>

                    {/* Joined date */}
                    <p className="text-xs text-neutral-500 dark:text-neutral-500">
                      Miembro desde{" "}
                      {membership.joinedAt.toLocaleDateString("es-AR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>

                  <span
                    className="text-neutral-400 dark:text-neutral-600 shrink-0 mt-0.5"
                    aria-hidden
                  >
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
            className="text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
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
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">
      {label}
    </span>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
        Verificada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">
      Pendiente verificación
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role] ?? role;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700">
      {label}
    </span>
  );
}
