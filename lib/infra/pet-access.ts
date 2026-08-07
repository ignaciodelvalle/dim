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
import { findOpenCaseForPetAndKind } from "@/lib/infra/case-helpers";
import { getProfileCached } from "@/lib/infra/request-cache";
import { createClient } from "@/lib/supabase/server";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

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

// Structural discriminator for a denied access (external audit 2026-07). A page
// must be able to tell "you have no session" apart from "you have a session but
// no permission" WITHOUT string-matching the human `error` message:
//   - "no-session"            → the caller has no valid Supabase session. A page
//       should redirect to /login (with returnTo), not render a misleading 404.
//   - "not-found-or-forbidden" → the session resolved, but the pet doesn't exist
//       for this caller, they lack access, the pet is deceased, or they lack the
//       write capability. Pages fail closed to notFound() (no information leak);
//       an erased account (valid JWT, no rights) is deliberately in this bucket
//       so it 404s like any other permission denial rather than looping /login.
export type PetAccessFailureReason = "no-session" | "not-found-or-forbidden";

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
  reason: PetAccessFailureReason;
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
      reason: "no-session",
      error: "Sesión expirada.",
    };
  }

  // Right-to-erasure lockout (Ley 25.326 art. 16, Wave D2/E2): a valid Supabase
  // session is necessary but NOT sufficient to mutate a pet. erase_subject_data()
  // soft-deletes the profile (deleted_at) and hashes PII, but does not invalidate
  // an already-issued JWT — so a self-erased account keeps a live token until it
  // naturally expires. requireUserOrRedirect() blocks erased accounts at the
  // page/layer boundary, but Drizzle bypasses RLS and every pet-scoped SERVER
  // ACTION resolves the user here, not through that page guard. Without this
  // check an erased account could still write pets/events. getProfileCached is
  // request-memoized (already selects deletedAt) so a page render pass reuses the
  // same round-trip; a server-action call pays one indexed read — the price of
  // the security boundary.
  const actingProfile = await getProfileCached(user.id);
  if (actingProfile?.deletedAt != null) {
    return {
      ok: false,
      supabase,
      user: { id: user.id },
      pet: null,
      accessPath: null,
      organization: null,
      membership: null,
      eventAuthorship: OWNER_AUTHORSHIP,
      reason: "not-found-or-forbidden",
      error: "Tu cuenta fue eliminada.",
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
    reason: "not-found-or-forbidden",
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
      reason: "not-found-or-forbidden",
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
        reason: "not-found-or-forbidden",
        error:
          "Necesitás el permiso 'Registrar eventos clínicos' (event.write). Pediselo a un administrador.",
      };
    }
  }
  return access;
}

// ---------------------------------------------------------------------------
// Shared former-owner derivation.
//
// "Immediate former owner" — no new table, no migration:
//   Ownership rows for a pet form a chronological chain. Exactly one write
//   path ends an INDIVIDUAL's (ownerUserId-based) ownership row and opens a
//   custody_episode in the same breath: executeDecomiso (ends every active
//   ownership row for the pet, any role, in one UPDATE, then opens the
//   episode). Every subsequent step in the SAME custody chain — org-to-org
//   handoff (acceptDecomisoHandoffInTx), reassignment, reject — only ever
//   touches ownerOrganizationId-scoped shelter_custody rows; none of them
//   re-ends an individual's row, and a handoff that opens a NEW episode for
//   the receiver always closes the previous one first (findOpenCaseForPet-
//   AndKind returns at most one open custody_episode per pet — see the
//   double-seizure guard in validateExecuteDecomiso). So the MOST RECENTLY
//   ENDED ownership row with a non-null ownerUserId is unambiguously the
//   immediate former owner for whichever custody_episode is open right now,
//   no matter how many org-to-org handoffs happened along the way. No role
//   filter needed (owner / co_owner / foster / caretaker all qualify,
//   matching Path 1 of requirePetAccess which is equally role-agnostic).
//
// SINGLE derivation shared by two call sites that each need a different
// shape of the answer (docs-sync 2026-07-18 — the two used to be parallel,
// hand-copied implementations that could silently drift):
//   - getFormerOwnerReadAccess (below) — answers "does THIS caller qualify
//     for a read grant on this pet".
//   - findImmediateFormerOwnerOwnership's other caller,
//     src/modules/decomiso/application/return-custody-to-owner.ts — needs the
//     ROW itself (id + owner) with no caller to compare against, in order to
//     reactivate it.
export type ImmediateFormerOwnerOwnership = {
  id: string;
  ownerUserId: string;
};

type OwnershipExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function findImmediateFormerOwnerOwnership(
  petId: string,
  executor: OwnershipExecutor = db,
): Promise<ImmediateFormerOwnerOwnership | null> {
  const [row] = await executor
    .select({ id: ownerships.id, ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, petId),
        isNotNull(ownerships.ownerUserId),
        isNotNull(ownerships.endedAt),
      ),
    )
    .orderBy(desc(ownerships.endedAt))
    .limit(1);
  if (!row?.ownerUserId) return null;
  return { id: row.id, ownerUserId: row.ownerUserId };
}

// ---------------------------------------------------------------------------
// Former-owner READ-ONLY access during an open custody episode (PO decision
// 2026-07-18): "El ex-dueño conserva LECTURA durante el proceso [de custodia
// oficial / decomiso]. Si lo pierde [definitivamente], también los permisos.
// Si se lo devuelve, nunca se le fue."
//
// Deliberately a SIBLING resolver, not a third branch of requirePetAccess:
//   - requirePetAccess / requireAlivePetAccess remain the WRITE boundary.
//     Every event-writing server action gates on one of those two, and
//     NEITHER of them calls into this function — so a former owner who lost
//     ownership keeps failing "not-found-or-forbidden" on every write path,
//     with ZERO changes to those call sites. The read grant below can never
//     leak write capability by construction (no capability check to forget).
//   - Only the pet profile page (the one read surface a former owner should
//     see) calls this, AFTER requirePetAccess has already failed for them.
//
// Severing on permanent loss and continuity on return both fall out of the
// findImmediateFormerOwnerOwnership derivation for free, no extra
// bookkeeping needed:
//   - adoption_finalized / death_recorded close the custody_episode (cascade
//     or direct close) with no new custody_episode opened → findOpenCaseFor-
//     PetAndKind returns null → this resolver returns { ok: false } → read
//     access is gone, matching "si lo pierde, también los permisos."
//   - IF a return-to-owner path re-opens (or reactivates) the ex-owner's
//     'owner' ownership row and closes the episode, Path 1 of
//     requirePetAccess grants FULL access again automatically — this
//     resolver is never even reached at that point. (This is exactly what
//     src/modules/decomiso/application/return-custody-to-owner.ts's
//     returnCustodyToOwnerInTx now does.)
export type FormerOwnerReadAccess =
  | {
      ok: true;
      pet: Pet;
      accessPath: "former-owner-during-custody";
      readOnly: true;
      custodyCase: { id: string; publicCode: string };
    }
  | { ok: false };

export async function getFormerOwnerReadAccess(
  publicToken: string,
  userId: string,
): Promise<FormerOwnerReadAccess> {
  const [petRow] = await db.select().from(pets).where(eq(pets.publicToken, publicToken)).limit(1);
  if (!petRow) return { ok: false };

  // Must be a CURRENTLY OPEN custody_episode for this pet — the derivation
  // below is only meaningful while the custody process is still running.
  const custodyCase = await findOpenCaseForPetAndKind(petRow.id, "custody_episode");
  if (!custodyCase) return { ok: false };

  // The pet's overall most-recently-ended individual ownership row (any
  // user) — the SAME shared derivation returnCustodyToOwnerInTx uses to
  // reactivate it. The caller only qualifies as the IMMEDIATE former owner
  // if it's THEIRS — otherwise they're a stale prior owner from an earlier,
  // unrelated tenure (e.g. the pet was legitimately transferred away long
  // before this custody episode ever opened), and a different user is the
  // true immediate former owner tied to the CURRENT episode.
  const formerOwner = await findImmediateFormerOwnerOwnership(petRow.id);
  if (!formerOwner || formerOwner.ownerUserId !== userId) {
    return { ok: false };
  }

  return {
    ok: true,
    pet: petRow,
    accessPath: "former-owner-during-custody",
    readOnly: true,
    custodyCase: { id: custodyCase.id, publicCode: custodyCase.publicCode },
  };
}
