"use server";

// Thin action controllers for the rehome-by-titular domain.
//
// Each action does ONLY:
//   1. Auth guard at the edge — the security boundary.
//   2. Parse the raw input.
//   3. Build deps (repo, clock, transaction) and call the use-case.
//   4. Map UseCaseResult<T> onto { error } / value.
//   5. Flush notifications post-tx, best-effort (catch + log, never throw).
//   6. revalidatePath. Never redirect() — return the destination instead.
//
// NO business logic. Reference shape: src/modules/caretakers/actions.ts.
//
// AUTH-SCOPE CONTRACT — the asymmetry that defines this module:
//   - request is a TITULAR action: `requireTitularAccess` PLUS an explicit
//     `holderRole === "owner"` check. The titular gate denies a caretaker; it
//     lets a foster and a co-owner through (by design, for the other titular
//     actions), and NEITHER may consent to hand the animal's listing to an org
//     (spec REQ-1, REQ-14). The use-case re-asserts the live owner row.
//   - accept / decline are ORG actions reached from /org/{orgToken}/…:
//     `requireCapabilityForOrgToken` pins the capability to the URL org, and
//     the use-case re-checks `receiverOrganizationId === organization.id`
//     under the case lock (defense in depth, the transfers-accept shape).

import { db } from "@/db";
import { createNotificationsBulk } from "@/lib/infra/notification-service";
import { requireTitularAccess } from "@/lib/infra/pet-access";
import { requireCapabilityForOrgToken } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { revalidatePath } from "next/cache";

import {
  NOT_TITULAR_ERROR,
  requestRehomeSponsorship,
} from "./application/request-rehome-sponsorship";
import {
  type RehomeDecision,
  respondToRehomeRequest,
} from "./application/respond-to-rehome-request";
import { RehomeRepository } from "./infrastructure/rehome-repository";

import type { NewNotification } from "./application/types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Flush notifications post-tx, best-effort. Never throws.
 *
 * Routed through the canonical write path (lib/infra/notification-service.ts):
 * idempotent on `dedupeKey`, dead-lettered on failure. This module is NOT in
 * scripts/notifications-service-baseline.json and must never be added to it.
 */
async function flushNotifications(pending: NewNotification[]): Promise<void> {
  if (pending.length === 0) return;
  try {
    await createNotificationsBulk(pending);
  } catch (e) {
    console.error("[rehome/actions] notifications insert failed (action did succeed):", e);
  }
}

function deps() {
  return {
    repo: RehomeRepository,
    now: () => new Date(),
    transaction: db.transaction.bind(db) as <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>,
  };
}

// ---------------------------------------------------------------------------
// requestRehomeSponsorshipAction — the titular asks an org to sponsor
// AUTH: requireTitularAccess + live owner role
// ---------------------------------------------------------------------------

export type RequestRehomeSponsorshipActionInput = {
  petPublicToken: string;
  targetOrgId: string;
};

export type RequestRehomeSponsorshipActionResult = { casePublicCode: string } | { error: string };

export async function requestRehomeSponsorshipAction(
  input: RequestRehomeSponsorshipActionInput,
): Promise<RequestRehomeSponsorshipActionResult> {
  const access = await requireTitularAccess(input.petPublicToken);
  if (!access.ok) return { error: access.error };
  // The live OWNER row only (REQ-1): the org path and every non-owner
  // person-path role are refused here, before the use-case re-asserts it.
  if (access.accessPath !== "owner" || access.holderRole !== "owner") {
    return { error: NOT_TITULAR_ERROR };
  }

  const result = await requestRehomeSponsorship(
    {
      petPublicToken: input.petPublicToken,
      titularUserId: access.user.id,
      targetOrgId: input.targetOrgId,
    },
    deps(),
  );
  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  revalidatePath(`/mis-mascotas/${input.petPublicToken}`);
  revalidatePath("/mis-mascotas");
  return { casePublicCode: result.value.casePublicCode };
}

// ---------------------------------------------------------------------------
// respondToRehomeRequestAction — the sponsoring org accepts or declines
// AUTH: requireCapabilityForOrgToken("adoption.listing.manage", orgToken) —
// accepting IS publishing the listing, so it is gated by the same capability.
// ---------------------------------------------------------------------------

export type RespondToRehomeRequestActionInput = {
  orgToken: string;
  casePublicCode: string;
  decision: RehomeDecision;
};

export type RespondToRehomeRequestActionResult =
  | { ok: true; decision: RehomeDecision; petPublicToken: string }
  | { error: string };

export async function respondToRehomeRequestAction(
  input: RespondToRehomeRequestActionInput,
): Promise<RespondToRehomeRequestActionResult> {
  // Resolve the acting org FROM the URL token, not the session-default
  // membership. The use-case re-checks `receiverOrganizationId` against
  // organization.id under the case lock (defense in depth).
  const auth = await requireCapabilityForOrgToken("adoption.listing.manage", input.orgToken);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const decision: RehomeDecision = input.decision === "accept" ? "accept" : "decline";
  const result = await respondToRehomeRequest(
    { casePublicCode: input.casePublicCode, decision },
    {
      ...deps(),
      actor: {
        user: { id: user.id },
        organization: {
          id: organization.id,
          displayName: organization.displayName,
          verified: organization.verified,
        },
      },
    },
  );
  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);
  revalidatePath(`/org/${input.orgToken}/casos`);
  revalidatePath(`/casos/${input.casePublicCode}`);
  revalidatePath(`/mis-mascotas/${result.value.petPublicToken}`);
  if (decision === "accept") revalidatePath("/adoptar");
  return { ok: true, decision, petPublicToken: result.value.petPublicToken };
}
