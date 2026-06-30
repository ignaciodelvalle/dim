// update-profile.ts — updateProfileForUser use-case.
//
// Validates input, checks profile existence, computes before-values for the
// audit payload, updates the profiles row, and inserts an audit_log entry.
// No notifications, no transaction wrapper (plain Drizzle queries).

import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { auditLog, db, profiles } from "@/db";

import type { UpdateProfileResult } from "./types";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

// Emergency / vet contact fields share the same nullable-string semantics
// as the main phone field. Names are free-form (1-80 chars) and clear
// to null when sent as empty string.
// Phone fields no longer enforce AR format server-side — the client form
// surfaces a soft warning via `lib/ar-phone.ts` instead. Older landlines,
// satellite phones, and foreign numbers all save without error.
const emergencyTextField = z.string().max(80, "Máximo 80 caracteres").optional();
const phoneField = z.string().max(40, "Máximo 40 caracteres").optional();

const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(80, "El nombre no puede superar 80 caracteres")
    .trim(),
  // phone semantics:
  //   undefined  → caller did not include phone in the update; leave DB value unchanged
  //   ""         → caller explicitly cleared phone; set to null in DB
  //   string     → store as-is (format hint shown client-side as warning, not error)
  phone: phoneField,
  // Emergency contact + preferred vet — surfaced on <PetEmergencyCard>. Same
  // undefined / "" / string semantics as `phone`. Added by migration 0042.
  preferredVetName: emergencyTextField,
  preferredVetPhone: phoneField,
  emergencyContactName: emergencyTextField,
  emergencyContactPhone: phoneField,
});

// ---------------------------------------------------------------------------
// Writer: updateProfileForUser
// ---------------------------------------------------------------------------

export async function updateProfileForUser(
  userId: string,
  input: {
    displayName: string;
    phone?: string;
    preferredVetName?: string;
    preferredVetPhone?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  },
): Promise<UpdateProfileResult> {
  // 1. Validate
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { error: `VALIDATION_ERROR: ${firstError.message}` };
  }
  const {
    displayName,
    phone,
    preferredVetName,
    preferredVetPhone,
    emergencyContactName,
    emergencyContactPhone,
  } = parsed.data;

  // 2. Load current profile for before-values + existence check
  const [current] = await db
    .select({
      displayName: profiles.displayName,
      phone: profiles.phone,
      preferredVetName: profiles.preferredVetName,
      preferredVetPhone: profiles.preferredVetPhone,
      emergencyContactName: profiles.emergencyContactName,
      emergencyContactPhone: profiles.emergencyContactPhone,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!current) return { error: "NOT_FOUND" };

  // 3. Build changed_fields + before_values for the audit payload
  const changedFields: string[] = [];
  const beforeValues: Record<string, unknown> = {};

  if (displayName !== current.displayName) {
    changedFields.push("displayName");
    beforeValues.displayName = current.displayName;
  }

  // phone: undefined → don't touch DB value.
  //        ""        → clear (set to null).
  //        string    → validate passed, store as-is.
  const phoneIsProvided = phone !== undefined;
  const newPhone = phoneIsProvided ? (phone === "" ? null : phone) : current.phone;
  if (newPhone !== current.phone) {
    changedFields.push("phone");
    beforeValues.phone = current.phone;
  }

  // Same semantics for the 4 emergency / vet fields.
  type EmergencyKey =
    | "preferredVetName"
    | "preferredVetPhone"
    | "emergencyContactName"
    | "emergencyContactPhone";
  const emergencyInputs: Record<EmergencyKey, string | undefined> = {
    preferredVetName,
    preferredVetPhone,
    emergencyContactName,
    emergencyContactPhone,
  };
  const emergencyUpdates: Partial<Record<EmergencyKey, string | null>> = {};
  for (const [key, value] of Object.entries(emergencyInputs) as Array<
    [EmergencyKey, string | undefined]
  >) {
    if (value === undefined) continue;
    const next = value === "" ? null : value;
    if (next !== current[key]) {
      changedFields.push(key);
      beforeValues[key] = current[key];
      emergencyUpdates[key] = next;
    }
  }

  // 4. Update profiles
  const updateSet: Record<string, unknown> = {
    displayName,
    updatedAt: new Date(),
  };
  if (phoneIsProvided) {
    updateSet.phone = phone === "" ? null : phone;
  }
  Object.assign(updateSet, emergencyUpdates);

  await db.update(profiles).set(updateSet).where(eq(profiles.id, userId));

  // 5. Insert audit_log
  await db.insert(auditLog).values({
    actorUserId: userId,
    action: "profile_self_updated",
    targetUserId: userId,
    payload: {
      changed_fields: changedFields,
      before_values: beforeValues,
    },
  });

  return { ok: true };
}
