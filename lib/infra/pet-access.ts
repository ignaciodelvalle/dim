// Centralized pet-access authorization. The pet is the spine of DIM's data
// model; users and organizations orbit, each holding ownership rows in
// different roles over time. This helper resolves "can the current user act
// on this pet?" via two paths:
//
//   - owner path: user has an active ownership row (any role) keyed on their
//     user_id. Covers personal owners, co-owners, fosters, caretakers, and
//     citizens holding strays — anyone whose user_id is the direct holder.
//   - org path:   user has an active membership in an organization that holds
//     an active ownership row on this pet (custody, foster, or owner). Covers
//     refugio coordinators, sanctuary admins, and any future org-side actor.
//
// The discriminator (`accessPath`) is returned so callers can branch on
// authorship: events written through the owner path attribute to
// authorRole='owner', events through the org path attribute to 'shelter' with
// authorOrganizationId set. The `eventAuthorship` field bakes that decision in
// so server actions can spread it directly into petEvents.values().
//
// Drizzle bypasses RLS by design, so this helper is the security boundary for
// every pet-scoped server action and page that previously gated on
// `ownerships.ownerUserId = user.id`. Adding a new entry point to a pet should
// either use this helper or have a written justification.

import {
  type Organization,
  type OrganizationMembership,
  type Pet,
  db,
  organizationMemberships,
  organizations,
  ownerships,
  pets,
  profiles,
} from "@/db";
import { createClient } from "@/lib/supabase/server";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { and, eq, isNull } from "drizzle-orm";

export type PetAccessPath = "owner" | "org";

// VET-role trust keystone (#43): the three provenance tiers below are bound to
// the SIGNER's validated matrícula, resolved here at the signing boundary:
//   - authorRole "vet"     + authorVerified=true  → verified_professional
//       (the acting user HELD a validated matrícula at sign time). This is the
//       only org-path tier that satisfies the compliance "verificado" gate.
//   - authorRole "shelter" + authorVerified=false → org_registered
//       (event.write by an org member WITHOUT a validated matrícula). A valid
//       institutional record, but NOT professional-verified.
//   - authorRole "owner"   + authorVerified=false → owner_declared (owner path).
// See lib/events/event-confidence.ts (computeConfidence) for how these columns
// project onto the ConfidenceTier, and lib/projections/pet-compliance.ts for the
// "al día" gate that only professional/institutional tiers clear.
export type PetEventAuthorship = {
  authorRole: "owner" | "shelter" | "vet";
  authorOrganizationId: string | null;
  authorVerified: boolean;
};

const OWNER_AUTHORSHIP: PetEventAuthorship = {
  authorRole: "owner",
  authorOrganizationId: null,
  authorVerified: false,
};

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PetAccessSuccess = {
  ok: true;
  supabase: SupabaseServerClient;
  user: { id: string };
  pet: Pet;
  accessPath: PetAccessPath;
  organization: Organization | null;
  // Membership is populated only on org-path access (the row that authorized
  // the access). Null on owner-path. Capability-gated wrappers like
  // requireAlivePetAccess consult it to check fine-grained permissions.
  membership: OrganizationMembership | null;
  eventAuthorship: PetEventAuthorship;
  error: null;
};

export type PetAccessFailure = {
  ok: false;
  supabase: SupabaseServerClient;
  user: { id: string } | null;
  pet: null;
  accessPath: null;
  organization: null;
  membership: null;
  // Defaulted to OWNER_AUTHORSHIP so callers can destructure without checks.
  // The error branch returns early before any event insert reads this field;
  // it is functionally dead in the failure case but keeps types simple.
  eventAuthorship: PetEventAuthorship;
  error: string;
};

export type PetAccessResult = PetAccessSuccess | PetAccessFailure;

export async function requirePetAccess(publicToken: string): Promise<PetAccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      supabase,
      user: null,
      pet: null,
      accessPath: null,
      organization: null,
      membership: null,
      eventAuthorship: OWNER_AUTHORSHIP,
      error: "Sesión expirada.",
    };
  }

  // Path 1: direct ownership by user_id. We don't filter by ownership.role —
  // owner / co_owner / foster / caretaker all qualify. The shelter_custody
  // role is impossible on this path (it requires owner_organization_id).
  const [ownerRow] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerUserId, user.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (ownerRow) {
    return {
      ok: true,
      supabase,
      user: { id: user.id },
      pet: ownerRow.pet,
      accessPath: "owner",
      organization: null,
      membership: null,
      eventAuthorship: OWNER_AUTHORSHIP,
      error: null,
    };
  }

  // Path 2: org-mediated. User is an active member of an organization that
  // has an active ownership row on this pet. Any ownership role qualifies —
  // shelter_custody (rehome track), foster (foster_in_transit case, rare),
  // or owner (sanctuary / org-as-permanent-owner).
  const [orgRow] = await db
    .select({
      pet: pets,
      organization: organizations,
      membership: organizationMemberships,
      // VET keystone (#43): resolve whether the acting user HELD a validated
      // matrícula at sign time — same join, no extra round-trip.
      signerMatriculaVerified: profiles.matriculaVerified,
    })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.organizationId, organizations.id),
        eq(organizationMemberships.userId, user.id),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .where(and(eq(pets.publicToken, publicToken), isNull(ownerships.endedAt)))
    .limit(1);
  if (orgRow) {
    // VET-role trust keystone (#43): bind the provenance tier to the SIGNER's
    // validated matrícula, NOT to the organization's verified status. A member
    // who holds a validated matrícula signs as verified_professional; anyone
    // else (clinic admin, volunteer) signs as org_registered — a valid record
    // that does NOT satisfy the compliance "verificado" gate. This is what
    // closes the "verificado por profesional" theater (#45).
    const eventAuthorship: PetEventAuthorship = orgRow.signerMatriculaVerified
      ? { authorRole: "vet", authorOrganizationId: orgRow.organization.id, authorVerified: true }
      : {
          authorRole: "shelter",
          authorOrganizationId: orgRow.organization.id,
          authorVerified: false,
        };
    return {
      ok: true,
      supabase,
      user: { id: user.id },
      pet: orgRow.pet,
      accessPath: "org",
      organization: orgRow.organization,
      membership: orgRow.membership,
      eventAuthorship,
      error: null,
    };
  }

  return {
    ok: false,
    supabase,
    user: { id: user.id },
    pet: null,
    accessPath: null,
    organization: null,
    membership: null,
    eventAuthorship: OWNER_AUTHORSHIP,
    error: "Mascota no encontrada o sin permisos.",
  };
}

// Same as requirePetAccess but additionally blocks writes when the pet is
// marked deceased AND, for org-mediated access, requires the `event.write`
// capability. Owner-path always allowed (your pet, your events). Admin
// org-members implicitly hold every capability so they always pass.
export async function requireAlivePetAccess(publicToken: string): Promise<PetAccessResult> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return access;
  if (access.pet.status === "deceased") {
    return {
      ok: false,
      supabase: access.supabase,
      user: access.user,
      pet: null,
      accessPath: null,
      organization: null,
      membership: null,
      eventAuthorship: OWNER_AUTHORSHIP,
      error: "Esta mascota está registrada como fallecida y no acepta nuevos eventos.",
    };
  }
  if (access.accessPath === "org" && access.membership) {
    const granted = await getGrantedCapabilities(access.membership);
    if (!granted.has("event.write")) {
      return {
        ok: false,
        supabase: access.supabase,
        user: access.user,
        pet: null,
        accessPath: null,
        organization: null,
        membership: null,
        eventAuthorship: OWNER_AUTHORSHIP,
        error:
          "Necesitás el permiso 'Registrar eventos clínicos' (event.write). Pediselo a un administrador.",
      };
    }
  }
  return access;
}
