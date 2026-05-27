// Sender entry point — propose a cross-org transfer for a pet currently
// under this org's active shelter_custody. The form requires a pet
// token via `?petToken=DIM-…` (typically linked from
// /org/[orgToken]/mascotas/[petToken]).

// ---------------------------------------------------------------------------
// WIRED (sprint 4 PR-033 — 2026-05-27)
//
// Reachable from /org/[orgToken]/mascotas/[publicToken] "Proponer transferencia"
// action; form is now a 3-step Poncho wizard with SuccessScreen on submit.
// ---------------------------------------------------------------------------

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import Link from "next/link";

import { db, organizationMemberships, organizations, ownerships, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";

import { ProposeTransferForm } from "./ProposeTransferForm";

const ALLOWED_PROPOSE_ROLES = new Set(["admin", "coordinator"]);

export default async function OrgTransferenciaNuevaPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgToken: string }>;
  searchParams: Promise<{ petToken?: string }>;
}) {
  const { orgToken } = await params;
  const sp = await searchParams;
  const petToken = sp.petToken?.trim() ?? "";
  const { user, organization } = await requireOrgAccessByToken(orgToken);

  // Role gate (CT9): admin / coordinator only. The full capability
  // check happens server-side in the action; this is a UX pre-check so
  // unauthorized members see a friendly message instead of submitting
  // and getting rejected.
  const [membership] = await db
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organization.id),
        eq(organizationMemberships.userId, user.id),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);
  const hasPermission =
    !!membership && (ALLOWED_PROPOSE_ROLES.has(membership.role) || membership.role === "admin");

  if (!hasPermission) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
        <div className="max-w-2xl mx-auto pt-10 space-y-4">
          <Link
            href={`/org/${orgToken}/transferencias`}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            ← Volver a transferencias
          </Link>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Nueva propuesta de transferencia
          </h1>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            Solo roles <strong>admin</strong> o <strong>coordinator</strong> de la organización
            pueden iniciar transferencias. Tu rol actual es{" "}
            <strong>{membership?.role ?? "—"}</strong>.
          </div>
        </div>
      </main>
    );
  }

  if (!petToken) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
        <div className="max-w-2xl mx-auto pt-10 space-y-4">
          <Link
            href={`/org/${orgToken}/transferencias`}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            ← Volver a transferencias
          </Link>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Nueva propuesta de transferencia
          </h1>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
            Para proponer una transferencia tenés que entrar desde el perfil de la mascota:
            <span className="font-mono"> /org/{orgToken}/mascotas/[publicToken]</span>.
          </div>
        </div>
      </main>
    );
  }

  // Resolve pet + verify the org holds active shelter_custody.
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, petToken),
        eq(ownerships.ownerOrganizationId, organization.id),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  if (!petRow) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
        <div className="max-w-2xl mx-auto pt-10 space-y-4">
          <Link
            href={`/org/${orgToken}/transferencias`}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            ← Volver a transferencias
          </Link>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Nueva propuesta de transferencia
          </h1>
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
            No encontramos una mascota con ese token bajo custodia activa de{" "}
            {organization.displayName}.
          </div>
        </div>
      </main>
    );
  }
  const pet = petRow.pet;

  // Pre-fetch the verified-org candidates (small list, capped at 200).
  const receivers = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      orgType: organizations.orgType,
      jurisdictionProvince: organizations.jurisdictionProvince,
      jurisdictionLocality: organizations.jurisdictionLocality,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.verified, true),
        eq(organizations.status, "active"),
        inArray(organizations.orgType, ["shelter", "rescue_network", "clinic"]),
        ne(organizations.id, organization.id),
      ),
    )
    .orderBy(organizations.displayName)
    .limit(200);

  const receiverOptions = receivers.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    orgType: r.orgType,
    jurisdiction:
      r.jurisdictionLocality && r.jurisdictionProvince
        ? `${r.jurisdictionLocality}, ${r.jurisdictionProvince}`
        : (r.jurisdictionProvince ?? ""),
  }));

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-xl mx-auto pt-10 space-y-6">
        <Link
          href={`/org/${orgToken}/transferencias`}
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a transferencias
        </Link>

        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Transferir {pet.name}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Proponer la transferencia de custodia desde {organization.displayName} a otra
            organización verificada.
          </p>
        </header>

        <ProposeTransferForm
          senderOrgToken={orgToken}
          petPublicToken={pet.publicToken}
          petName={pet.name}
          receivers={receiverOptions}
        />
      </div>
    </main>
  );
}
