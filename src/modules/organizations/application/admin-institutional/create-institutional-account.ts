// Use-case: createInstitutionalAccountForAuthority
//
// Creates a new institutional account (govt or admin) with:
//   1. Zod validation
//   2. Capability check (admin only)
//   3. Pre-flight duplicate email check via auth admin SDK
//   4. auth.admin.createUser (email_confirm: true, throwaway password)
//   5. DB transaction: profile + govt_assignments + audit_log + notification
//   6. Compensating auth.admin.deleteUser on tx failure
//   7. auth.admin.generateLink for magic link
//
// §2.2: notifications accumulate in pendingNotifications[] inside the tx and
// are inserted AFTER the transaction commits (best-effort, logged on failure).

import crypto from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { auditLog, db, govtAssignments, notifications, profiles } from "@/db";
import { canCreateInstitutional } from "@/lib/domain/institutional-scope";
import {
  CoordError,
  JurisdictionValidationError,
  normalizeLocationForWrite,
} from "@/lib/domain/location-normalize";
import { createAdminClient } from "@/lib/supabase/admin";

import { loadActorProfile } from "./helpers";
import type { CreateInstitutionalResult } from "./types";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const localitySchema = z.object({
  province: z.string().min(1, "Province is required"),
  locality: z.string().min(1, "Locality is required"),
});

const createInstitutionalSchema = z.object({
  role: z.enum(["govt", "admin"]),
  email: z.email("Invalid email address"),
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .max(100, "Display name must be at most 100 characters")
    .trim(),
  initialLocalities: z.array(localitySchema),
});

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function createInstitutionalAccountForAuthority(
  actorUserId: string,
  input: {
    role: "govt" | "admin";
    email: string;
    displayName: string;
    initialLocalities: { province: string; locality: string }[];
  },
): Promise<CreateInstitutionalResult> {
  // 1. Validate inputs
  const parsed = createInstitutionalSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { error: `VALIDATION_ERROR: ${firstError.message}` };
  }
  const { role, email, displayName, initialLocalities } = parsed.data;

  // 1.5 Resolve each initial locality through the canonical catalog before
  // touching auth or the DB. Bad data fails fast with a clear message — no
  // orphan auth users to compensate for. The catalog returns the canonical
  // (Province name, Locality name) pair, which is what we persist.
  // locality:"strict" — resolveCanonicalJurisdiction per locality (admin-institutional behavior unchanged).
  const canonicalLocalities: { province: string; locality: string }[] = [];
  for (const l of initialLocalities) {
    try {
      const normalizedLoc = await normalizeLocationForWrite(
        {
          province: l.province,
          provinceCode: null,
          locality: l.locality,
          localityIndecId: null,
          lat: null,
          lng: null,
          address: null,
        },
        { locality: "strict" },
      );
      canonicalLocalities.push({
        province: normalizedLoc.province ?? l.province,
        locality: normalizedLoc.locality ?? l.locality,
      });
    } catch (err) {
      if (err instanceof JurisdictionValidationError) {
        return { error: err.message };
      }
      if (err instanceof CoordError) {
        return { error: err.message };
      }
      throw err;
    }
  }

  // 2. Load actor + capability check
  const actorProfile = await loadActorProfile(actorUserId);
  if (!actorProfile) return { error: "CAPABILITY_DENIED" };
  if (!canCreateInstitutional(actorProfile)) return { error: "CAPABILITY_DENIED" };

  const supabase = createAdminClient();

  // 3. Pre-flight duplicate email check
  const { data: existingUsers, error: listErr } = await supabase.auth.admin.listUsers({
    perPage: 200,
  });
  if (listErr) return { error: `AUTH_LIST_FAILED: ${listErr.message}` };

  const duplicateUser = existingUsers?.users.find((u) => u.email === email);
  if (duplicateUser) return { error: "DUPLICATE_EMAIL" };

  // 4. Create auth user with throwaway password (never surfaced or logged)
  const throwawayPassword = crypto.randomBytes(32).toString("hex");
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: throwawayPassword,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      // Pass role via metadata so the handle_new_user trigger sets the right role
      // (the trigger reads raw_user_meta_data.user_role). We also UPDATE the profile
      // inside the tx for correctness, but the trigger pre-populates the row first.
      user_role: role,
    },
  });

  if (authErr || !authData.user) {
    return { error: `AUTH_CREATE_FAILED: ${authErr?.message ?? "unknown error"}` };
  }

  const authUserId = authData.user.id;

  // 5. DB transaction: update profile + insert assignments + audit_log + notification
  // Note: handle_new_user trigger already created a profile row — we UPDATE it here
  // to set account_type='institutional' and the correct role.
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      // a. Update the auto-created profile to institutional
      const updatedRows = await tx
        .update(profiles)
        .set({
          displayName,
          role,
          accountType: "institutional",
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, authUserId))
        .returning({ id: profiles.id });

      if (updatedRows.length < 1) {
        throw new Error("PROFILE_UPDATE_FAILED: profile row not found after auth.admin.createUser");
      }

      // b. If role='govt': insert govt_assignments for each canonical locality
      if (role === "govt" && canonicalLocalities.length > 0) {
        await tx.insert(govtAssignments).values(
          canonicalLocalities.map((l) => ({
            userId: authUserId,
            jurisdictionProvince: l.province,
            jurisdictionLocality: l.locality,
            grantedByUserId: actorUserId,
          })),
        );
      }

      // c. Insert audit_log
      await tx.insert(auditLog).values({
        actorUserId,
        action: role === "admin" ? "institutional_admin_created" : "institutional_govt_created",
        targetUserId: authUserId,
        payload: {
          role,
          display_name: displayName,
          email,
          initial_localities: canonicalLocalities,
          method: "auth_admin_sdk",
        },
      });

      // d. Welcome notification to the new operator (accumulated post-tx)
      pendingNotifications.push({
        userId: authUserId,
        notificationType: "institutional_account_created",
        title: "Tu cuenta institucional fue creada",
        body: "Un administrador te creó una cuenta. Usá el link de acceso que te compartió para entrar.",
        severity: "info",
        ctaLabel: "Acceder",
        ctaUrl: "/login",
      });
    });
  } catch (txErr) {
    // Compensating delete: remove the auth user to avoid orphans
    try {
      await supabase.auth.admin.deleteUser(authUserId);
    } catch (cleanupErr) {
      // Best-effort orphan logging — do NOT swallow the original error
      try {
        await db.insert(auditLog).values({
          actorUserId,
          action: "institutional_create_orphan_auth_user",
          payload: {
            orphan_auth_user_id: authUserId,
            intended_email: email,
            tx_error: txErr instanceof Error ? txErr.message : String(txErr),
            cleanup_error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          },
        });
      } catch {
        // Swallow — we've done our best
      }
    }
    return {
      error: `DB_TX_FAILED: ${txErr instanceof Error ? txErr.message : String(txErr)}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  // 6. Generate magic link
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkErr || !linkData?.properties?.action_link) {
    // Account was created successfully but magic link generation failed.
    // Return a partial success so the admin knows to use "Reset credentials" instead.
    return {
      ok: true,
      profileId: authUserId,
      magicLink: "",
    };
  }

  return {
    ok: true,
    profileId: authUserId,
    magicLink: linkData.properties.action_link,
  };
}
