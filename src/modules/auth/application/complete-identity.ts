// Use-case: completeIdentityAction — step 2 of the two-step signup flow (strangler migration 26/61).
//
// Step 2 of the two-step signup flow. Requires an active session (set by
// signupAction → supabase.auth.signUp in step 1).
//
// Updates profiles.display_name to "${firstName} ${lastName}".
// When a DNI is provided: stores dni_hash + dni_last4 (never plaintext).
// dniVerified stays false — full verification happens via verifyDniAction.
// The partial unique index profiles_dni_hash_unique (migration 0106)
// enforces uniqueness when the hash is not null. A 23505 violation here
// means another account already holds that DNI — surface a friendly error.

import { eq, sql } from "drizzle-orm";

import { db, profiles } from "@/db";
import { pgError } from "@/lib/db-errors";
import { dniLast4, hashDni } from "@/lib/dni-hash";
import { CoordError, normalizeLocationForWrite } from "@/lib/location-normalize";
import { parseLocationFromFormData } from "@/lib/location-value";
import { LEGAL_VERSION } from "@/lib/reference/legal-version";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

import type { IdentityFormState } from "./types";

// Argentine DNI: 7–8 digits, no spaces/dots/dashes. Same regex as verifyDniAction.
const DNI_RE = /^\d{7,8}$/;

export async function completeIdentityAction(
  _previous: IdentityFormState,
  formData: FormData,
): Promise<IdentityFormState> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const rawDni = String(formData.get("dni") ?? "")
    .trim()
    .replace(/[.\s-]/g, "");

  if (!firstName || !lastName) {
    return { error: "Ingresá tu nombre y apellido." };
  }

  // Validate DNI format only when provided.
  if (rawDni && !DNI_RE.test(rawDni)) {
    return { error: "El DNI debe tener 7 u 8 dígitos numéricos." };
  }

  // Location — optional. LocationFields (l1 mode) submits provinceCode (ISO)
  // + localityName. locality:"none" canonicalizes the ISO code to the canonical
  // province display name; no locality catalog lookup (auth behavior unchanged).
  const loc = parseLocationFromFormData(formData);
  let normalizedLoc: Awaited<ReturnType<typeof normalizeLocationForWrite>>;
  try {
    normalizedLoc = await normalizeLocationForWrite(loc, { locality: "none" });
  } catch (err) {
    if (err instanceof CoordError) {
      return { error: err.message };
    }
    throw err;
  }
  const jurisdictionProvince = normalizedLoc.province;
  const jurisdictionLocality = normalizedLoc.locality;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Session expired between steps — send them back to start.
    redirect("/signup");
  }

  const displayName = `${firstName} ${lastName}`.trim();

  try {
    await db
      .update(profiles)
      .set({
        displayName,
        // Store DNI hash + last4 (never plaintext — Wave 5 Item 25a).
        // dniVerified stays false (default). The /cuenta/verificar-dni flow
        // sets dniVerified=true with audit trail.
        ...(rawDni ? { dniHash: hashDni(rawDni), dniLast4: dniLast4(rawDni) } : {}),
        // Persist user location when provided. Both columns are nullable so
        // omitting them (empty form) leaves the profile without location.
        ...(jurisdictionProvince !== null ? { jurisdictionProvince } : {}),
        ...(jurisdictionLocality !== null ? { jurisdictionLocality } : {}),
        // Persist provable consent (Ley 25.326 art. 5). The TOS/privacy checkbox
        // is required in step 1 (signupAction) and step 2 is unreachable without
        // it, so reaching here means consent was given. We record it on the same
        // profile-finalization update — the first point with both an authenticated
        // session and the profile row guaranteed to exist (created by the
        // handle_new_user trigger). tosVersion captures WHAT was accepted.
        // COALESCE preserves the original consent timestamp on retries — only
        // writes now() when tos_accepted_at is currently NULL.
        tosAcceptedAt: sql`COALESCE(${profiles.tosAcceptedAt}, now())`,
        tosVersion: LEGAL_VERSION,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, user.id));
  } catch (err) {
    // drizzle 0.45 wraps the pg error; pgError unwraps the `.cause` chain to
    // the real postgres-js error carrying `code` / `constraint` / `detail`.
    const info = pgError(err);
    if (
      info?.code === "23505" &&
      ((info.constraint ?? "").includes("dni") ||
        String(info.raw.detail ?? "").includes("dni_hash"))
    ) {
      return { error: "Ese DNI ya está registrado por otra cuenta." };
    }
    const msg = err instanceof Error ? err.message : "error desconocido";
    return { error: `No se pudo guardar tu perfil: ${msg}` };
  }

  return { error: null, ok: true };
}
