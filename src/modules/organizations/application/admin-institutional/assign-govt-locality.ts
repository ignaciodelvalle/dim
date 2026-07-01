// Use-case: assignGovtLocalityForAuthority
//
// Assigns a new locality to an active govt:
//   1. Capability check (admin only)
//   2. Validate target is active institutional govt
//   3. Check for duplicate active assignment (noOp if exists)
//   4. INSERT govt_assignments row
//   5. INSERT audit_log action='govt_locality_assigned'
//   6. INSERT notification to target (single insert — best-effort, try/catch)
//
// ARCH-P: the notification insert is wrapped in try/catch so a failure
// does not propagate to the caller (single-insert hardening pattern).

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";

import { auditLog, db, govtAssignments, notifications, profiles } from "@/db";
import { canAssignGovtLocality } from "@/lib/domain/institutional-scope";
import {
  CoordError,
  JurisdictionValidationError,
  normalizeLocationForWrite,
} from "@/lib/domain/location-normalize";

import { loadActorProfile } from "./helpers";
import type { AssignGovtLocalityResult } from "./types";

const assignLocalitySchema = z.object({
  targetUserId: z.string().min(1, "targetUserId is required"),
  province: z.string().min(1, "Province is required"),
  locality: z.string().min(1, "Locality is required"),
});

export async function assignGovtLocalityForAuthority(
  actorUserId: string,
  input: { targetUserId: string; province: string; locality: string },
): Promise<AssignGovtLocalityResult> {
  // 1. Validate input
  const parsed = assignLocalitySchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { error: `VALIDATION_ERROR: ${firstError.message}` };
  }
  const { targetUserId, province: rawProvince, locality: rawLocality } = parsed.data;

  // 1.5 Resolve through the canonical catalog. We only persist canonical names.
  // locality:"strict" — resolveCanonicalJurisdiction (govt assignment behavior unchanged).
  let canonicalProvince: string;
  let canonicalLocality: string;
  try {
    const normalizedLoc = await normalizeLocationForWrite(
      {
        province: rawProvince,
        provinceCode: null,
        locality: rawLocality,
        localityIndecId: null,
        lat: null,
        lng: null,
        address: null,
      },
      { locality: "strict" },
    );
    canonicalProvince = normalizedLoc.province ?? rawProvince;
    canonicalLocality = normalizedLoc.locality ?? rawLocality;
  } catch (err) {
    if (err instanceof JurisdictionValidationError) return { error: err.message };
    if (err instanceof CoordError) return { error: err.message };
    throw err;
  }

  // 2. Load actor + capability check
  const actorProfile = await loadActorProfile(actorUserId);
  if (!actorProfile) return { error: "CAPABILITY_DENIED" };
  if (!canAssignGovtLocality(actorProfile)) return { error: "CAPABILITY_DENIED" };

  // 3. Validate target is active institutional govt
  const [targetProfile] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, targetUserId))
    .limit(1);

  if (!targetProfile) return { error: "NOT_FOUND" };
  if (targetProfile.role !== "govt" || targetProfile.accountType !== "institutional") {
    return { error: "NOT_INSTITUTIONAL_GOVT" };
  }
  if (targetProfile.deactivatedAt !== null) return { error: "TARGET_DEACTIVATED" };

  // 4. Check for duplicate active assignment (UNIQUE: user_id + province + locality WHERE revoked_at IS NULL)
  const [existing] = await db
    .select({ id: govtAssignments.id })
    .from(govtAssignments)
    .where(
      and(
        eq(govtAssignments.userId, targetUserId),
        eq(govtAssignments.jurisdictionProvince, canonicalProvince),
        eq(govtAssignments.jurisdictionLocality, canonicalLocality),
        isNull(govtAssignments.revokedAt),
      ),
    )
    .limit(1);

  if (existing) {
    return { ok: true, assignmentId: existing.id, noOp: true };
  }

  // 5. INSERT govt_assignments
  const [newAssignment] = await db
    .insert(govtAssignments)
    .values({
      userId: targetUserId,
      jurisdictionProvince: canonicalProvince,
      jurisdictionLocality: canonicalLocality,
      grantedByUserId: actorUserId,
    })
    .returning({ id: govtAssignments.id });

  // 6. INSERT audit_log
  await db.insert(auditLog).values({
    actorUserId,
    action: "govt_locality_assigned",
    targetUserId,
    payload: {
      province: canonicalProvince,
      locality: canonicalLocality,
      govt_assignment_id: newAssignment.id,
    },
  });

  // 7. INSERT notification to target govt — best-effort, must not undo the assignment.
  try {
    await db.insert(notifications).values({
      userId: targetUserId,
      notificationType: "govt_locality_assigned",
      title: "Nueva localidad asignada a tu cuenta",
      body: `Un administrador asignó la localidad ${canonicalLocality}, ${canonicalProvince} a tu jurisdicción.`,
      severity: "info",
      ctaLabel: "Ver mis localidades",
      ctaUrl: "/gob",
    });
  } catch (e) {
    console.error("notifications insert failed (assignGovtLocalityForAuthority did succeed)", e);
  }

  return { ok: true, assignmentId: newAssignment.id };
}
