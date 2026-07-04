"use server";

// alert-subscriptions.ts — thin shim (strangler migration 31/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/alerts/application/subscriptions/
//
// This file provides thin action wrappers (used by /admin/programa and
// /gob/programa) that add the auth guard + revalidatePath, plus the input
// type. The bare ForUser writers are NOT exported here (authz triage
// 2026-07-04): every export of a "use server" file is an independently-
// addressable server action, so a bare writer taking a caller-supplied
// userId would let any client manage another user's subscriptions. Callers
// import the writers from src/modules/alerts/application/subscriptions/.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { type AlertDirection, type AlertMetricKey, db, profiles } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { createAlertSubscriptionForUser as _createAlertSubscriptionForUser } from "@/src/modules/alerts/application/subscriptions/create-alert-subscription";
import { deleteAlertSubscriptionForUser as _deleteAlertSubscriptionForUser } from "@/src/modules/alerts/application/subscriptions/delete-alert-subscription";
import { toggleAlertSubscriptionForUser as _toggleAlertSubscriptionForUser } from "@/src/modules/alerts/application/subscriptions/toggle-alert-subscription";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { CreateAlertSubscriptionInput } from "@/src/modules/alerts/application/subscriptions/types";

// ---------------------------------------------------------------------------
// Auth helper (admin-only) — stays in the shim, never in use-cases
// ---------------------------------------------------------------------------

async function requireAdminUser(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { error: "Sesión expirada" };

  // Verify admin role in profiles table (defense-in-depth: Supabase JWT role
  // claim may lag behind the DB; we always re-check profiles).
  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!profile || profile.role !== "admin") {
    return { error: "Acceso restringido a administradores" };
  }

  return { userId: user.id };
}

// ---------------------------------------------------------------------------
// Form-action wrappers — thin controllers (auth + revalidatePath only)
// ---------------------------------------------------------------------------

export async function createAlertSubscriptionAction(
  formData: FormData,
): Promise<{ ok: true; id: string } | { error: string }> {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;

  const input = {
    metricKey: formData.get("metricKey") as AlertMetricKey,
    direction: formData.get("direction") as AlertDirection,
    threshold: Number(formData.get("threshold")),
    jurisdictionProvince: (formData.get("jurisdictionProvince") as string) || null,
    jurisdictionLocality: (formData.get("jurisdictionLocality") as string) || null,
    label: (formData.get("label") as string) || null,
  };

  const result = await _createAlertSubscriptionForUser(auth.userId, input);
  if ("error" in result) return result;

  revalidatePath("/admin/programa");
  return { ok: true, id: result.id };
}

export async function deleteAlertSubscriptionAction(formData: FormData): Promise<void> {
  const auth = await requireAdminUser();
  if ("error" in auth) return;

  const id = formData.get("id") as string;
  if (!id) return;

  await _deleteAlertSubscriptionForUser(auth.userId, id);
  revalidatePath("/admin/programa");
}

export async function toggleAlertSubscriptionAction(formData: FormData): Promise<void> {
  const auth = await requireAdminUser();
  if ("error" in auth) return;

  const id = formData.get("id") as string;
  if (!id) return;
  const isActive = formData.get("isActive") === "true";

  await _toggleAlertSubscriptionForUser(auth.userId, id, isActive);
  revalidatePath("/admin/programa");
}
