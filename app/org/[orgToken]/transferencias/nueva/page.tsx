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

import { OpBreach, OpCallout, OpCrumbs } from "@/components/ui/dashboard";
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
      <div className="max-w-2xl space-y-6">
        <OpCrumbs
          items={[
            { label: "Panel", href: `/org/${orgToken}` },
            { label: "Transferencias", href: `/org/${orgToken}/transferencias` },
            { label: "Nueva propuesta" },
          ]}
        />
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          Nueva propuesta de transferencia
        </h1>
        <OpBreach
          title="Sin permiso"
          detail={`Solo roles admin o coordinator pueden iniciar transferencias. Tu rol actual es ${membership?.role ?? "—"}.`}
        />
      </div>
    );
  }

  if (!petToken) {
    return (
      <div className="max-w-2xl space-y-6">
        <OpCrumbs
          items={[
            { label: "Panel", href: `/org/${orgToken}` },
            { label: "Transferencias", href: `/org/${orgToken}/transferencias` },
            { label: "Nueva propuesta" },
          ]}
        />
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          Nueva propuesta de transferencia
        </h1>
        <OpCallout
          title="Token de mascota requerido"
          body={
            <>
              Para proponer una transferencia tenés que entrar desde el perfil de la mascota:{" "}
              <span className="font-mono text-[12px]">/org/{orgToken}/mascotas/[publicToken]</span>.
            </>
          }
        />
      </div>
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
      <div className="max-w-2xl space-y-6">
        <OpCrumbs
          items={[
            { label: "Panel", href: `/org/${orgToken}` },
            { label: "Transferencias", href: `/org/${orgToken}/transferencias` },
            { label: "Nueva propuesta" },
          ]}
        />
        <h1 className="text-[22px] font-semibold text-ln-op-ink">
          Nueva propuesta de transferencia
        </h1>
        <OpBreach
          title="Mascota no encontrada"
          detail={`No encontramos una mascota con ese token bajo custodia activa de ${organization.displayName}.`}
        />
        <Link
          href={`/org/${orgToken}/transferencias`}
          className="text-[13px] text-ln-op-azul hover:underline no-underline"
        >
          ← Volver a transferencias
        </Link>
      </div>
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
    <div className="max-w-xl space-y-6">
      <OpCrumbs
        items={[
          { label: "Panel", href: `/org/${orgToken}` },
          { label: "Transferencias", href: `/org/${orgToken}/transferencias` },
          { label: "Nueva propuesta" },
        ]}
      />

      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Transferir {pet.name}</h1>
        <p className="text-[13px] text-ln-op-mute">
          Proponer la transferencia de custodia desde {organization.displayName} a otra organización
          verificada.
        </p>
      </header>

      <ProposeTransferForm
        senderOrgToken={orgToken}
        petPublicToken={pet.publicToken}
        petName={pet.name}
        receivers={receiverOptions}
      />
    </div>
  );
}
