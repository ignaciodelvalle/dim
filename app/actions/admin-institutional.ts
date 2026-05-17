"use server";

// Institutional account management actions for the admin UI (Fase 5).
//
// This module follows the writer/wrapper pattern from admin-revocations.ts:
//   - Inner writer functions (e.g. createInstitutionalAccountForAuthority) are
//     exported and testable without the Next.js runtime.
//   - Public wrapper functions (e.g. createInstitutionalAccountAction) gate via
//     requireAdminOrRedirect and call revalidatePath.
//
// PR-A scope: createInstitutionalAccountForAuthority + wrapper.
// PR-B scope will add deactivateAdminForAuthority + deactivateGovtForAuthority.
// PR-C scope will add resetInstitutionalCredentialsForAuthority + assignGovtLocalityForAuthority.

import crypto from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";

import { auditLog, db, govtAssignments, notifications, profiles } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { canCreateInstitutional } from "@/lib/institutional-scope";
import type { ActorProfile } from "@/lib/institutional-scope";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type CreateInstitutionalResult =
  | { error: string }
  | { ok: true; profileId: string; magicLink: string };

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
// Helper: load actor's profile for capability checks
// ---------------------------------------------------------------------------

async function loadActorProfile(actorUserId: string): Promise<ActorProfile | null> {
  const [row] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, actorUserId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    role: row.role as ActorProfile["role"],
    accountType: row.accountType as ActorProfile["accountType"],
    deactivatedAt: row.deactivatedAt,
  };
}

// ---------------------------------------------------------------------------
// Inner writer: createInstitutionalAccountForAuthority (PR-A)
//
// Creates a new institutional account (govt or admin) with:
//   1. Zod validation
//   2. Capability check (admin only)
//   3. Pre-flight duplicate email check via auth admin SDK
//   4. auth.admin.createUser (email_confirm: true, throwaway password)
//   5. DB transaction: profile + govt_assignments + audit_log + notification
//   6. Compensating auth.admin.deleteUser on tx failure
//   7. auth.admin.generateLink for magic link
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

      // b. If role='govt': insert govt_assignments for each initialLocality
      if (role === "govt" && initialLocalities.length > 0) {
        await tx.insert(govtAssignments).values(
          initialLocalities.map((l) => ({
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
          initial_localities: initialLocalities,
          method: "auth_admin_sdk",
        },
      });

      // d. Insert welcome notification to the new operator
      await tx.insert(notifications).values({
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

// ---------------------------------------------------------------------------
// Public wrapper: createInstitutionalAccountAction
// ---------------------------------------------------------------------------
//
// Gated via requireAdminOrRedirect. Delegates to the inner writer.
// On success: revalidates the admin govts and admins list pages.

export async function createInstitutionalAccountAction(input: {
  role: "govt" | "admin";
  email: string;
  displayName: string;
  initialLocalities: { province: string; locality: string }[];
}): Promise<CreateInstitutionalResult> {
  const { user } = await requireAdminOrRedirect();
  const result = await createInstitutionalAccountForAuthority(user.id, input);
  if ("ok" in result) {
    revalidatePath("/admin/govts");
    revalidatePath("/admin/admins");
  }
  return result;
}
