"use server";

// Server actions for service_schedule_rules CRUD (Fase 2).
//
// Authorization model:
//   - Org-side: requireCapability('service_offering.create') + offering must be
//     status='approved' before rules can be created/edited. Soft-delete sets
//     status='archived' (never hard-delete: materialized time_slots may reference).
//
// Writer/wrapper split mirrors app/actions/service-offerings.ts.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, serviceOfferings, serviceScheduleRules } from "@/db";
import { requireCapability } from "@/lib/capabilities";
import { CreateScheduleRuleInput, UpdateScheduleRuleInput } from "@/lib/scheduling-schemas";

// ============================================================================
// Types
// ============================================================================

export type ScheduleRuleResult = { error: string } | { ok: true };
export type ScheduleRuleFormState = { error: string | null };

// ============================================================================
// Inner writers — testable without auth context
// ============================================================================

export async function createScheduleRuleForOrg(
  actorUserId: string,
  orgId: string,
  input: {
    serviceOfferingId: string;
    daysOfWeek: number[];
    startTimeLocal: string;
    endTimeLocal: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
  },
): Promise<ScheduleRuleResult> {
  const parsed = CreateScheduleRuleInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Datos inválidos: ${parsed.error.issues[0]?.message ?? "error"}` };
  }

  // Verify offering belongs to org and is approved.
  const [offering] = await db
    .select({
      id: serviceOfferings.id,
      status: serviceOfferings.status,
      organizationId: serviceOfferings.organizationId,
    })
    .from(serviceOfferings)
    .where(eq(serviceOfferings.id, parsed.data.serviceOfferingId))
    .limit(1);

  if (!offering) return { error: "Servicio no encontrado." };
  if (offering.organizationId !== orgId)
    return { error: "El servicio no pertenece a tu organización." };
  if (offering.status !== "approved") {
    return { error: "Solo se pueden crear reglas de agenda para servicios aprobados." };
  }

  try {
    await db.insert(serviceScheduleRules).values({
      serviceOfferingId: parsed.data.serviceOfferingId,
      daysOfWeek: parsed.data.daysOfWeek.map((d) => d as unknown as number),
      startTimeLocal: parsed.data.startTimeLocal,
      endTimeLocal: parsed.data.endTimeLocal,
      effectiveFrom: parsed.data.effectiveFrom,
      effectiveUntil: parsed.data.effectiveUntil ?? null,
      status: "active",
    });
  } catch (err) {
    return {
      error: `No se pudo crear la regla: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return { ok: true };
}

export async function updateScheduleRuleForOrg(
  actorUserId: string,
  ruleId: string,
  orgId: string,
  input: {
    daysOfWeek?: number[];
    startTimeLocal?: string;
    endTimeLocal?: string;
    effectiveFrom?: string;
    effectiveUntil?: string | null;
  },
): Promise<ScheduleRuleResult> {
  const parsed = UpdateScheduleRuleInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Datos inválidos: ${parsed.error.issues[0]?.message ?? "error"}` };
  }

  // Verify ownership via offering.
  const [rule] = await db
    .select({
      id: serviceScheduleRules.id,
      serviceOfferingId: serviceScheduleRules.serviceOfferingId,
    })
    .from(serviceScheduleRules)
    .where(eq(serviceScheduleRules.id, ruleId))
    .limit(1);

  if (!rule) return { error: "Regla no encontrada." };

  const [offering] = await db
    .select({ organizationId: serviceOfferings.organizationId })
    .from(serviceOfferings)
    .where(eq(serviceOfferings.id, rule.serviceOfferingId))
    .limit(1);

  if (!offering || offering.organizationId !== orgId) {
    return { error: "No tenés permiso para editar esta regla." };
  }

  const updates: Partial<typeof serviceScheduleRules.$inferInsert> = {};
  if (parsed.data.daysOfWeek !== undefined) {
    updates.daysOfWeek = parsed.data.daysOfWeek.map((d) => d as unknown as number);
  }
  if (parsed.data.startTimeLocal !== undefined) updates.startTimeLocal = parsed.data.startTimeLocal;
  if (parsed.data.endTimeLocal !== undefined) updates.endTimeLocal = parsed.data.endTimeLocal;
  if (parsed.data.effectiveFrom !== undefined) updates.effectiveFrom = parsed.data.effectiveFrom;
  if ("effectiveUntil" in parsed.data) updates.effectiveUntil = parsed.data.effectiveUntil ?? null;
  updates.updatedAt = new Date();

  try {
    await db.update(serviceScheduleRules).set(updates).where(eq(serviceScheduleRules.id, ruleId));
  } catch (err) {
    return {
      error: `No se pudo actualizar la regla: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return { ok: true };
}

// Soft-delete: sets status='archived'. Hard delete is forbidden because
// materialized time_slots carry a nullable FK back to the rule via rule_id.
export async function deleteScheduleRuleForOrg(
  actorUserId: string,
  ruleId: string,
  orgId: string,
): Promise<ScheduleRuleResult> {
  const [rule] = await db
    .select({
      id: serviceScheduleRules.id,
      serviceOfferingId: serviceScheduleRules.serviceOfferingId,
    })
    .from(serviceScheduleRules)
    .where(eq(serviceScheduleRules.id, ruleId))
    .limit(1);

  if (!rule) return { error: "Regla no encontrada." };

  const [offering] = await db
    .select({ organizationId: serviceOfferings.organizationId })
    .from(serviceOfferings)
    .where(eq(serviceOfferings.id, rule.serviceOfferingId))
    .limit(1);

  if (!offering || offering.organizationId !== orgId) {
    return { error: "No tenés permiso para eliminar esta regla." };
  }

  try {
    await db
      .update(serviceScheduleRules)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(serviceScheduleRules.id, ruleId));
  } catch (err) {
    return {
      error: `No se pudo eliminar la regla: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return { ok: true };
}

// ============================================================================
// Form-shaped wrappers — gate auth + capability, delegate to inner writers
// ============================================================================

// ── Org-side wrappers ────────────────────────────────────────────────────────

export async function createScheduleRuleAction(
  _prev: ScheduleRuleFormState,
  formData: FormData,
): Promise<ScheduleRuleFormState> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const user = auth.user!;
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  const serviceOfferingId = String(formData.get("serviceOfferingId") ?? "").trim();
  const daysRaw = formData.getAll("daysOfWeek").map((v) => Number.parseInt(String(v), 10));
  const startTimeLocal = String(formData.get("startTimeLocal") ?? "").trim();
  const endTimeLocal = String(formData.get("endTimeLocal") ?? "").trim();
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim();
  const effectiveUntilRaw = String(formData.get("effectiveUntil") ?? "").trim();
  const effectiveUntil = effectiveUntilRaw || null;

  const result = await createScheduleRuleForOrg(user.id, organization.id, {
    serviceOfferingId,
    daysOfWeek: daysRaw.filter((d) => !Number.isNaN(d)),
    startTimeLocal,
    endTimeLocal,
    effectiveFrom,
    effectiveUntil,
  });

  if ("error" in result) return { error: result.error };

  // Revalidate so the agenda page reflects the new rule.
  const offeringToken = String(formData.get("offeringPublicToken") ?? "").trim();
  const orgToken = String(formData.get("orgToken") ?? "").trim();
  if (orgToken && offeringToken) {
    revalidatePath(`/org/${orgToken}/servicios/${offeringToken}/agenda`);
  }

  return { error: null };
}

export async function updateScheduleRuleAction(
  _prev: ScheduleRuleFormState,
  formData: FormData,
): Promise<ScheduleRuleFormState> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const user = auth.user!;
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  const ruleId = String(formData.get("ruleId") ?? "").trim();
  const daysRaw = formData.getAll("daysOfWeek").map((v) => Number.parseInt(String(v), 10));
  const startTimeLocal = String(formData.get("startTimeLocal") ?? "").trim() || undefined;
  const endTimeLocal = String(formData.get("endTimeLocal") ?? "").trim() || undefined;
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim() || undefined;
  const effectiveUntilRaw = formData.get("effectiveUntil");
  const effectiveUntil =
    effectiveUntilRaw !== null ? String(effectiveUntilRaw).trim() || null : undefined;

  const result = await updateScheduleRuleForOrg(user.id, ruleId, organization.id, {
    daysOfWeek: daysRaw.length > 0 ? daysRaw.filter((d) => !Number.isNaN(d)) : undefined,
    startTimeLocal,
    endTimeLocal,
    effectiveFrom,
    effectiveUntil,
  });

  if ("error" in result) return { error: result.error };

  const offeringToken = String(formData.get("offeringPublicToken") ?? "").trim();
  const orgToken = String(formData.get("orgToken") ?? "").trim();
  if (orgToken && offeringToken) {
    revalidatePath(`/org/${orgToken}/servicios/${offeringToken}/agenda`);
  }

  return { error: null };
}

export async function deleteScheduleRuleAction(
  ruleId: string,
  orgToken: string,
  offeringToken: string,
): Promise<{ error: string | null }> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const user = auth.user!;
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  const result = await deleteScheduleRuleForOrg(user.id, ruleId, organization.id);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/org/${orgToken}/servicios/${offeringToken}/agenda`);
  return { error: null };
}
