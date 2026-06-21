"use server";

// Alert subscription server actions — Paquete H threshold alerts on /admin/programa.
//
// Pure inner writers (called by form-action wrappers, also usable from tests):
//   createAlertSubscriptionForUser(actorUserId, input) → AlertSubscription | { error }
//   deleteAlertSubscriptionForUser(actorUserId, id)    → { ok } | { error }
//
// Form-action wrappers (resolve auth, call writer, revalidatePath):
//   createAlertSubscriptionAction(formData)
//   deleteAlertSubscriptionAction(formData)
//   toggleAlertSubscriptionAction(formData)
//
// Auth: resolved via createClient().auth.getUser() — never trust client-supplied userId.
// Writes go through Drizzle (BYPASSRLS service-role).
// Admin-only feature: all mutations reject non-admin callers.
//
// NO audit log in v1 (AUDIT_LOG_ACTIONS unchanged).

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ALERT_DIRECTIONS,
  ALERT_METRIC_KEYS,
  type AlertDirection,
  type AlertMetricKey,
  type AlertSubscription,
  alertSubscriptions,
  db,
  profiles,
} from "@/db";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CreateAlertSubscriptionSchema = z.object({
  metricKey: z.enum([...ALERT_METRIC_KEYS] as [AlertMetricKey, ...AlertMetricKey[]]),
  direction: z.enum([...ALERT_DIRECTIONS] as [AlertDirection, ...AlertDirection[]]),
  threshold: z.coerce.number().finite(),
  jurisdictionProvince: z.string().min(1).nullable().optional(),
  jurisdictionLocality: z.string().min(1).nullable().optional(),
  label: z.string().max(120).nullable().optional(),
});

export type CreateAlertSubscriptionInput = z.infer<typeof CreateAlertSubscriptionSchema>;

// ---------------------------------------------------------------------------
// Auth helper
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
// Pure inner writers
// ---------------------------------------------------------------------------

/**
 * Create an alert subscription for a given actor user.
 * Caller must already have verified the actor is admin.
 */
export async function createAlertSubscriptionForUser(
  actorUserId: string,
  input: CreateAlertSubscriptionInput,
): Promise<AlertSubscription | { error: string }> {
  const parsed = CreateAlertSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { metricKey, direction, threshold, jurisdictionProvince, jurisdictionLocality, label } =
    parsed.data;

  const [row] = await db
    .insert(alertSubscriptions)
    .values({
      actorUserId,
      metricKey,
      direction,
      threshold: String(threshold),
      jurisdictionProvince: jurisdictionProvince ?? null,
      jurisdictionLocality: jurisdictionLocality ?? null,
      label: label ?? null,
      isActive: true,
    })
    .returning();

  if (!row) return { error: "Error al crear la suscripción" };
  return row;
}

/**
 * Delete an alert subscription. Ownership check: the row's actorUserId must
 * match the caller's userId OR the caller must be admin (checked by role in DB).
 *
 * For simplicity v1: caller passes their own userId; the WHERE clause enforces
 * ownership. Admin users can delete any subscription by calling this with the
 * target actorUserId (resolved from the row), but this action only deletes rows
 * where actorUserId = the provided userId.
 *
 * A stricter "admin deletes any" path is available by not filtering on
 * actorUserId — but v1 admin only deletes their own subs from the UI.
 */
export async function deleteAlertSubscriptionForUser(
  actorUserId: string,
  id: string,
): Promise<{ ok: true } | { error: string }> {
  // Verify the row exists and belongs to the caller.
  const [existing] = await db
    .select({ id: alertSubscriptions.id, actorUserId: alertSubscriptions.actorUserId })
    .from(alertSubscriptions)
    .where(eq(alertSubscriptions.id, id))
    .limit(1);

  if (!existing) return { error: "Suscripción no encontrada" };

  // Ownership check: only the owner may delete (admin writes own rows via this action).
  if (existing.actorUserId !== actorUserId) {
    return { error: "No tenés permiso para eliminar esta suscripción" };
  }

  await db
    .delete(alertSubscriptions)
    .where(and(eq(alertSubscriptions.id, id), eq(alertSubscriptions.actorUserId, actorUserId)));

  return { ok: true };
}

/**
 * Toggle is_active for a subscription. Owner-only.
 */
export async function toggleAlertSubscriptionForUser(
  actorUserId: string,
  id: string,
  isActive: boolean,
): Promise<{ ok: true } | { error: string }> {
  const [existing] = await db
    .select({ id: alertSubscriptions.id, actorUserId: alertSubscriptions.actorUserId })
    .from(alertSubscriptions)
    .where(eq(alertSubscriptions.id, id))
    .limit(1);

  if (!existing) return { error: "Suscripción no encontrada" };
  if (existing.actorUserId !== actorUserId) {
    return { error: "No tenés permiso para modificar esta suscripción" };
  }

  await db
    .update(alertSubscriptions)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(alertSubscriptions.id, id), eq(alertSubscriptions.actorUserId, actorUserId)));

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Form-action wrappers
// ---------------------------------------------------------------------------

export async function createAlertSubscriptionAction(
  formData: FormData,
): Promise<{ ok: true; id: string } | { error: string }> {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;

  const input: CreateAlertSubscriptionInput = {
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
