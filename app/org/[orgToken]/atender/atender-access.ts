// Atender (walk-in clinical signing) access resolver.
//
// A veterinary clinic signs clinical events on pets it does NOT hold custody
// of: the owner brings the pet and shows the physical DIM credential. The
// shared pet-access guards (requirePetAccess / requireAlivePetAccess) resolve
// access through an OWNERSHIP row (owner path) or an org CUSTODY row (org
// path) — neither exists for a walk-in, so they fail-closed with "Mascota no
// encontrada o sin permisos." That guard is correct for custody surfaces and
// MUST NOT be weakened.
//
// This resolver is the dedicated authorization boundary for the walk-in case.
// The consent proxy is: the acting member holds `event.write` on THIS org
// (orgToken) AND knows the high-entropy DIM code (31^8, ≈ physical possession
// of the credential). No custody row is required. It resolves ONLY pet
// identity (name/species/status) — never owner PII.
//
// PROVENANCE (#43 keystone): the event authorship tier is bound to the
// SIGNER's validated matrícula, exactly as lib/infra/pet-access.ts computes it
// on the org path. A member with a validated matrícula signs as
// `verified_professional` (authorRole "vet", authorVerified true); anyone else
// signs as `org_registered` (authorRole "shelter", authorVerified false). The
// 3-line mapping below is intentionally mirrored from pet-access.ts (the
// canonical source) rather than shared, to keep this walk-in boundary
// self-contained; keep the two in sync.

import { db, organizationMemberships, organizations, pets, profiles } from "@/db";
import type { PetEventAuthorship } from "@/lib/infra/pet-access";
import { createClient } from "@/lib/supabase/server";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { and, eq, isNull } from "drizzle-orm";

// DIM credential token shape: DIM-XXXX-XXXX (case-insensitive). Mirrors the
// pattern used by the govt decomiso lookup (lookup-pet-for-decomiso.ts).
export const ATENDER_TOKEN_PATTERN = /^DIM-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

/** Normalize a raw credential code for lookup (trim + upper-case). */
export function normalizeAtenderToken(raw: string): string {
  return raw.trim().toUpperCase();
}

export type AtenderPet = {
  id: string;
  publicToken: string;
  name: string;
  species: string;
  status: "active" | "lost" | "deceased";
};

export type AtenderSigner = {
  /** How the signature is attributed in the UI header. */
  label: string;
  matriculaVerified: boolean;
};

export type AtenderAccessSuccess = {
  ok: true;
  user: { id: string };
  organizationId: string;
  organizationName: string;
  pet: AtenderPet;
  signer: AtenderSigner;
  eventAuthorship: PetEventAuthorship;
  error: null;
};

export type AtenderAccessFailure = {
  ok: false;
  error: string;
};

export type AtenderAccessResult = AtenderAccessSuccess | AtenderAccessFailure;

/**
 * Resolve the acting member's authorization on `orgToken` WITHOUT resolving a
 * specific pet. Used by the code-entry page/action to gate the surface before
 * a DIM code is even known. Returns the org + signer authorship context.
 */
export async function resolveAtenderContext(orgToken: string): Promise<
  | {
      ok: true;
      user: { id: string };
      organizationId: string;
      organizationName: string;
      signer: AtenderSigner;
      eventAuthorship: PetEventAuthorship;
    }
  | AtenderAccessFailure
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada." };

  // Resolve org + active membership by token (no custody involved).
  const [membershipRow] = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.displayName,
      membershipId: organizationMemberships.id,
      membershipRole: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(
        eq(organizationMemberships.userId, user.id),
        eq(organizations.publicToken, orgToken),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (!membershipRow) {
    return { ok: false, error: "No pertenecés a esta organización." };
  }

  // Signer profile: matrícula (provenance tier) + right-to-erasure lockout.
  // Drizzle bypasses RLS, so this mutation boundary re-checks deletedAt itself
  // (a self-erased account keeps a live JWT until it expires — Ley 25.326
  // art. 16, same guard as requirePetAccess / requireCapability).
  const [signerProfile] = await db
    .select({
      matriculaNumber: profiles.matriculaNumber,
      matriculaVerified: profiles.matriculaVerified,
      deletedAt: profiles.deletedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (signerProfile?.deletedAt != null) {
    return { ok: false, error: "Tu cuenta fue eliminada." };
  }

  const granted = await getGrantedCapabilities({
    id: membershipRow.membershipId,
    role: membershipRow.membershipRole,
  });
  if (!granted.has("event.write")) {
    return {
      ok: false,
      error:
        "Necesitás el permiso 'Registrar eventos clínicos' (event.write). Pediselo a un administrador.",
    };
  }

  const matriculaVerified = signerProfile?.matriculaVerified === true;

  // #43 provenance mapping — mirrored from lib/infra/pet-access.ts (org path).
  const eventAuthorship: PetEventAuthorship = matriculaVerified
    ? {
        authorRole: "vet",
        authorOrganizationId: membershipRow.organizationId,
        authorVerified: true,
      }
    : {
        authorRole: "shelter",
        authorOrganizationId: membershipRow.organizationId,
        authorVerified: false,
      };

  const signerLabel =
    matriculaVerified && signerProfile?.matriculaNumber
      ? `matrícula ${signerProfile.matriculaNumber}`
      : membershipRow.organizationName;

  return {
    ok: true,
    user: { id: user.id },
    organizationId: membershipRow.organizationId,
    organizationName: membershipRow.organizationName,
    signer: { label: signerLabel, matriculaVerified },
    eventAuthorship,
  };
}

/**
 * Resolve the full walk-in signing context: org authorization (event.write) +
 * the pet identified by its DIM credential token. No custody row is required.
 * Rejects deceased pets (clinical events target living animals — parity with
 * requireAlivePetAccess). Never exposes owner PII.
 */
export async function resolveAtenderPet(
  orgToken: string,
  publicToken: string,
): Promise<AtenderAccessResult> {
  const context = await resolveAtenderContext(orgToken);
  if (!context.ok) return context;

  const normalized = normalizeAtenderToken(publicToken);
  if (!ATENDER_TOKEN_PATTERN.test(normalized)) {
    return { ok: false, error: "El formato del código es DIM-XXXX-XXXX." };
  }

  // Resolve ONLY pet identity — no ownerships join, no owner PII.
  const [petRow] = await db
    .select({
      id: pets.id,
      publicToken: pets.publicToken,
      name: pets.name,
      species: pets.species,
      status: pets.status,
    })
    .from(pets)
    .where(eq(pets.publicToken, normalized))
    .limit(1);

  if (!petRow) {
    return { ok: false, error: `No se encontró ninguna mascota con el código ${normalized}.` };
  }
  if (petRow.status === "deceased") {
    return {
      ok: false,
      error: "Esta mascota está registrada como fallecida y no acepta nuevos eventos.",
    };
  }

  return {
    ok: true,
    user: context.user,
    organizationId: context.organizationId,
    organizationName: context.organizationName,
    pet: petRow,
    signer: context.signer,
    eventAuthorship: context.eventAuthorship,
    error: null,
  };
}
