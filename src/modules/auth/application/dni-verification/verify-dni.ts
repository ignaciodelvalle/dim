// Use-case: verifyDniForUser — strangler migration 38/61.
//
// Pure writer: receives userId + raw DNI string, validates, runs the DB
// transaction, and returns the result. No Next.js request context.
//
// The outer shim (app/actions/dni-verification.ts) gates via requireUserOrRedirect.
// Tests call verifyDniForUser directly with a known userId.

import { eq } from "drizzle-orm";

import { auditLog, db, notifications, profiles } from "@/db";
import { pgError } from "@/lib/db-errors";
import { dniLast4, hashDni } from "@/lib/utils/dni-hash";

import type { DniVerifyResult } from "./types";

// ============================================================================
// Validation helpers
// ============================================================================

// Argentine DNI is 7–8 digits. No spaces, no dots, no dashes.
const DNI_RE = /^\d{7,8}$/;

function validateDni(raw: string): { trimmed: string; error: string | null } {
  const trimmed = raw.trim().replace(/[.\s-]/g, "");
  if (!DNI_RE.test(trimmed)) {
    return { trimmed, error: "El DNI debe tener 7 u 8 dígitos numéricos." };
  }
  return { trimmed, error: null };
}

// Postgres 23505 = unique_violation. Mirror of isUniqueViolationOn in upgrade.ts.
// pgError unwraps drizzle 0.45's `.cause` chain to the real postgres-js error.
function isDniUniqueViolation(err: unknown): boolean {
  const info = pgError(err);
  if (!info || info.code !== "23505") return false;
  const constraint = info.constraint ?? "";
  const detail = typeof info.raw.detail === "string" ? info.raw.detail : "";
  // The partial unique index is named profiles_dni_hash_unique (migration 0106).
  return constraint.includes("dni") || detail.includes("(dni_hash)");
}

// ============================================================================
// Pure inner writer — testable without FormData or Supabase client
// ============================================================================

/**
 * Sets dni_hash + dni_last4 + dni_verified=true for `userId`.
 *
 * No DNI in plaintext (Wave 5 Item 25a): the raw DNI is never persisted.
 * Only the HMAC-SHA256 hash (lib/dni-hash.ts) and the last 4 digits are stored.
 *
 * - Short-circuits idempotently if the profile already has dni_verified=true.
 * - Catches 23505 on the partial unique index and returns a friendly error.
 * - Inserts one audit_log row (action: "dni_verified_self").
 * - Inserts one self-notification (notificationType: "profile_self_updated").
 *
 * TODO(25b): replace this direct DB write with a verified assertion from the
 * Mi Argentina OAuth callback. The outer shape (userId in, result out) stays
 * the same; only the trust source changes.
 */
export async function verifyDniForUser(userId: string, rawDni: string): Promise<DniVerifyResult> {
  const { trimmed, error: formatError } = validateDni(rawDni);
  if (formatError) return { ok: false, error: formatError };

  // Load profile — need current state to check idempotency.
  const [profile] = await db
    .select({ dniVerified: profiles.dniVerified })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!profile) return { ok: false, error: "Perfil no encontrado." };

  // Idempotent short-circuit: already verified — nothing to do.
  if (profile.dniVerified) return { ok: true };

  const dniHashValue = hashDni(trimmed);
  const dniLast4Value = dniLast4(trimmed);

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(profiles)
        .set({
          dniHash: dniHashValue,
          dniLast4: dniLast4Value,
          dniVerified: true,
          dniVerifiedAt: new Date(),
          identitySource: "legacy",
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, userId));

      await tx.insert(auditLog).values({
        actorUserId: userId,
        action: "dni_verified_self",
        targetUserId: userId,
        payload: { method: "placeholder_form" },
      });

      await tx.insert(notifications).values({
        userId,
        notificationType: "profile_self_updated",
        title: "DNI declarado",
        body: "Tu DNI fue registrado correctamente en MiMAR.",
        severity: "success",
        ctaLabel: "Ver mi cuenta",
        ctaUrl: "/cuenta",
      });
    });
  } catch (err) {
    if (isDniUniqueViolation(err)) {
      return { ok: false, error: "Ese DNI ya está registrado por otra cuenta." };
    }
    const msg = err instanceof Error ? err.message : "error desconocido";
    return { ok: false, error: `No se pudo guardar el DNI: ${msg}` };
  }

  return { ok: true };
}
