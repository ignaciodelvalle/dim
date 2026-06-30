"use server";

// schedule-rules.ts — thin shim (strangler 24/61).
//
// Business logic moved to:
//   src/modules/service-offerings/application/schedule-rules/
//
// This file re-exports all writer functions (used by integration tests)
// and provides thin Action wrappers (used by UI components) that add
// the auth guard + revalidatePath.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { revalidatePath } from "next/cache";

import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";

import { createScheduleRuleForOrg as _createScheduleRuleForOrg } from "@/src/modules/service-offerings/application/schedule-rules/create-schedule-rule";
import { deleteScheduleRuleForOrg as _deleteScheduleRuleForOrg } from "@/src/modules/service-offerings/application/schedule-rules/delete-schedule-rule";
import type {
  ScheduleRuleFormState,
  ScheduleRuleResult,
} from "@/src/modules/service-offerings/application/schedule-rules/types";
import { updateScheduleRuleForOrg as _updateScheduleRuleForOrg } from "@/src/modules/service-offerings/application/schedule-rules/update-schedule-rule";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  ScheduleRuleFormState,
  ScheduleRuleResult,
} from "@/src/modules/service-offerings/application/schedule-rules/types";

// ---------------------------------------------------------------------------
// Writer re-exports — async wrappers (identical signatures, used by tests)
// ---------------------------------------------------------------------------

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
  return _createScheduleRuleForOrg(actorUserId, orgId, input);
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
  return _updateScheduleRuleForOrg(actorUserId, ruleId, orgId, input);
}

export async function deleteScheduleRuleForOrg(
  actorUserId: string,
  ruleId: string,
  orgId: string,
): Promise<ScheduleRuleResult> {
  return _deleteScheduleRuleForOrg(actorUserId, ruleId, orgId);
}

// ---------------------------------------------------------------------------
// Form-shaped wrappers — gate auth + capability, delegate to inner writers
// ---------------------------------------------------------------------------

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
