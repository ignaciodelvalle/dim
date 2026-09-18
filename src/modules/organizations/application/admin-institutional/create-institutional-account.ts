// Use-case: createInstitutionalAccountForAuthority
//
// Creates a new institutional account (govt, admin or national) with:
//   1. Zod validation
//   2. Capability check (admin only)
//   3. Pre-flight duplicate email check via auth admin SDK
//   4. auth.admin.createUser (unconfirmed, NO password, first-access flag)
//   5. DB transaction: profile + govt_assignments + audit_log + notification
//      (compensating auth.admin.deleteUser on tx failure)
//   6. auth.admin.inviteUserByEmail — GoTrue mails the link (after commit)
//   7. auth.admin.generateLink — the same access, for the copy-by-hand panel
//
// §2.2: notifications accumulate in pendingNotifications[] inside the tx and
// are inserted AFTER the transaction commits (best-effort, logged on failure).

import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { auditLog, db, govtAssignments, notifications, profiles } from "@/db";
import { canCreateInstitutional } from "@/lib/domain/institutional-scope";
import {
  CoordError,
  JurisdictionValidationError,
  normalizeLocationForWrite,
} from "@/lib/domain/location-normalize";
import { resolveSiteUrl } from "@/lib/infra/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FIRST_ACCESS_PATH,
  pendingPasswordSetupMetadata,
} from "@/src/modules/auth/domain/first-access";

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
  // `national` (pilot T1-P9): the read-only, country-wide observer role
  // (migration 0214). It holds no govt_assignments — its read scope is
  // universal by role — so initial localities are refused rather than dropped.
  role: z.enum(["govt", "admin", "national"]),
  email: z.email("Invalid email address"),
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .max(100, "Display name must be at most 100 characters")
    .trim(),
  initialLocalities: z.array(localitySchema),
});

/** One audit action per role, so a filter by action never mixes them up. */
const INSTITUTIONAL_CREATED_ACTION = {
  govt: "institutional_govt_created",
  admin: "institutional_admin_created",
  national: "institutional_national_created",
} as const;

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function createInstitutionalAccountForAuthority(
  actorUserId: string,
  input: {
    role: "govt" | "admin" | "national";
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
  if (role === "national" && initialLocalities.length > 0) {
    return {
      error:
        "VALIDATION_ERROR: Un observador nacional no lleva localidades: lee todo el país por su rol.",
    };
  }

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

  // 4. Create the auth user WITHOUT a password and with the first-access flag
  // (pilot T1-P3). The person chooses the password at FIRST_ACCESS_PATH, and
  // every guarded page sends them there until they do.
  //
  // UNCONFIRMED ON PURPOSE (`email_confirm: false`): GoTrue only sends an
  // invite to an address it has not confirmed yet, and the invite goes out in
  // step 6, AFTER the transaction commits — so a rolled-back creation never
  // mails anybody a link to an account that no longer exists. Following the
  // invite (or the fallback magic link) confirms the address.
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: false,
    app_metadata: pendingPasswordSetupMetadata(),
    user_metadata: {
      display_name: displayName,
      // NOTE: do NOT pass role here. The handle_new_user trigger (db/triggers.sql)
      // hardcodes role='owner' and IGNORES all request metadata — a `user_role`
      // key would be dead and misleading. The real role is set by the in-tx
      // UPDATE below (step 5a), which is the authoritative role-setting path.
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
        action: INSTITUTIONAL_CREATED_ACTION[role],
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
        body: "Un administrador te creó una cuenta. Te enviamos un mail con el link para entrar y elegir tu contraseña.",
        severity: "info",
        ctaLabel: "Acceder",
        ctaUrl: "/iniciar-sesion",
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

  // 6. Mail the invite through Supabase Auth's own mailer (the project's SMTP,
  // GoTrue's "invite" template). Best-effort: a mail that cannot go out does
  // not undo a committed account — the admin gets the link below to forward
  // by hand, and the panel says which of the two happened.
  const redirectTo = `${resolveSiteUrl()}${FIRST_ACCESS_PATH}`;
  let inviteEmailSent = false;
  try {
    const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (inviteErr) console.error("institutional invite mail failed (account exists)", inviteErr);
    inviteEmailSent = !inviteErr;
  } catch (e) {
    console.error("institutional invite mail threw (account exists)", e);
  }

  // 7. Fallback link for the copy-by-hand panel. GoTrue keeps it in a
  // different one-time-token slot from the invite (recovery vs confirmation),
  // so generating it does not void the mailed link; whichever the person
  // opens first is the one that works, and it voids the other.
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  return {
    ok: true,
    profileId: authUserId,
    // Empty when generation failed: the panel then points at "Reset credentials".
    magicLink: linkErr || !linkData?.properties?.action_link ? "" : linkData.properties.action_link,
    inviteEmailSent,
  };
}
