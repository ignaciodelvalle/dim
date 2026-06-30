"use server";

// alert-subscriptions.ts — thin shim (strangler migration 31/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/alerts/application/subscriptions/
//
// This file re-exports all writers + the input type (used by form components
// and tests) and provides thin action wrappers (used by /admin/programa) that
// add the auth guard + revalidatePath.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { type AlertDirection, type AlertMetricKey, db, profiles } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { createAlertSubscriptionForUser } from "@/src/modules/alerts/application/subscriptions/create-alert-subscription";
import { deleteAlertSubscriptionForUser } from "@/src/modules/alerts/application/subscriptions/delete-alert-subscription";
import { toggleAlertSubscriptionForUser } from "@/src/modules/alerts/application/subscriptions/toggle-alert-subscription";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type { CreateAlertSubscriptionInput } from "@/src/modules/alerts/application/subscriptions/types";

// ---------------------------------------------------------------------------
// Writer re-exports — used by form components + tests
// ---------------------------------------------------------------------------

export { createAlertSubscriptionForUser } from "@/src/modules/alerts/application/subscriptions/create-alert-subscription";
export { deleteAlertSubscriptionForUser } from "@/src/modules/alerts/application/subscriptions/delete-alert-subscription";
export { toggleAlertSubscriptionForUser } from "@/src/modules/alerts/application/subscriptions/toggle-alert-subscription";

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

  const result = await createAlertSubscriptionForUser(auth.userId, input);
  if ("error" in result) return result;

  revalidatePath("/admin/programa");
  return { ok: true, id: result.id };
}

export async function deleteAlertSubscriptionAction(formData: FormData): Promise<void> {
  const auth = await requireAdminUser();
  if ("error" in auth) return;

  const id = formData.get("id") as string;
  if (!id) return;

  await deleteAlertSubscriptionForUser(auth.userId, id);
  revalidatePath("/admin/programa");
}

export async function toggleAlertSubscriptionAction(formData: FormData): Promise<void> {
  const auth = await requireAdminUser();
  if ("error" in auth) return;

  const id = formData.get("id") as string;
  if (!id) return;
  const isActive = formData.get("isActive") === "true";

  await toggleAlertSubscriptionForUser(auth.userId, id, isActive);
  revalidatePath("/admin/programa");
}
