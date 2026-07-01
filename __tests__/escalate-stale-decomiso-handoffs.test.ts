// Unit tests for the escalate-stale-decomiso-handoffs use-case.
//
// These tests target the use-case at
// src/modules/cases/application/escalate-stale-decomiso-handoffs.ts directly,
// verifying the module can be imported and re-exported independently of the
// lib shim. Behavior invariants are covered by the integration suite in
// __tests__/cron-escalate-stale-decomiso-handoffs.test.ts (which exercises
// the full DB path via the lib shim).
//
// TDD: this file was written BEFORE the use-case file existed (RED phase).
//
// Invariants verified here:
//  1. The use-case module exports findStaleDecomisoCandidates and
//     escalateStaleDecomiso (API contract is stable after migration).
//  2. findStaleDecomisoCandidates respects the staleAfterDays option — a
//     candidate with a proposal older than the threshold is included; one
//     with a fresh proposal is excluded (clock-on-latest-proposal invariant).
//
// These are unit-level DB-backed tests (same pattern as
// escalate-stale-disputes.test.ts). The DB is a local Supabase instance.

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cases, db, notifications, organizations, petEvents, pets } from "@/db";
import { openCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/events/event-schemas";
import {
  escalateStaleDecomiso,
  findStaleDecomisoCandidates,
} from "@/src/modules/cases/application/escalate-stale-decomiso-handoffs";
import { withMutationOverride } from "./_helpers/db-overrides";

// ---------------------------------------------------------------------------
// Unique tokens for this file (different from the integration test tokens)
// ---------------------------------------------------------------------------
const UC_SANITARY_ORG_TOKEN = "DIM-UCT-GOVT1";
const UC_SHELTER_ORG_TOKEN = "DIM-UCT-SHE1";
const UC_PET_STALE_TOKEN = "DIM-UCT-P01";
const UC_PET_FRESH_TOKEN = "DIM-UCT-P02";

let ucSanitaryOrgId: string;
let ucShelterOrgId: string;
let ucPetStaleId: string;
let ucPetFreshId: string;

beforeAll(async () => {
  // Clean up any leftovers from interrupted previous runs.
  const petTokens = [UC_PET_STALE_TOKEN, UC_PET_FRESH_TOKEN];
  const orgTokens = [UC_SANITARY_ORG_TOKEN, UC_SHELTER_ORG_TOKEN];

  await withMutationOverride(async (tx) => {
    for (const token of petTokens) {
      await tx.execute(sql`DELETE FROM pet_events WHERE pet_id IN (
        SELECT id FROM pets WHERE public_token = ${token}
      )`);
      await tx.execute(sql`DELETE FROM cases WHERE primary_pet_id IN (
        SELECT id FROM pets WHERE public_token = ${token}
      )`);
      await tx.execute(sql`DELETE FROM pets WHERE public_token = ${token}`);
    }
    for (const token of orgTokens) {
      await tx.execute(sql`DELETE FROM organizations WHERE public_token = ${token}`);
    }
  });

  const [sanitaryOrg] = await db
    .insert(organizations)
    .values({
      publicToken: UC_SANITARY_ORG_TOKEN,
      legalName: "Autoridad Sanitaria UCT",
      displayName: "Autoridad Sanitaria UCT",
      orgType: "sanitary_authority",
      email: "sanitary-uct@dim-test.local",
      verified: true,
    })
    .returning();
  ucSanitaryOrgId = sanitaryOrg.id;

  const [shelter] = await db
    .insert(organizations)
    .values({
      publicToken: UC_SHELTER_ORG_TOKEN,
      legalName: "Refugio UCT",
      displayName: "Refugio UCT",
      orgType: "shelter",
      email: "shelter-uct@dim-test.local",
      verified: true,
    })
    .returning();
  ucShelterOrgId = shelter.id;

  const [petStale] = await db
    .insert(pets)
    .values({
      publicToken: UC_PET_STALE_TOKEN,
      name: "UCTPetStale",
      species: "dog",
      sex: "unknown",
      potentiallyDangerousBreed: false,
    })
    .returning();
  ucPetStaleId = petStale.id;

  const [petFresh] = await db
    .insert(pets)
    .values({
      publicToken: UC_PET_FRESH_TOKEN,
      name: "UCTPetFresh",
      species: "dog",
      sex: "unknown",
      potentiallyDangerousBreed: false,
    })
    .returning();
  ucPetFreshId = petFresh.id;
});

afterAll(async () => {
  const allPetIds = [ucPetStaleId, ucPetFreshId].filter(Boolean);
  await withMutationOverride(async (tx) => {
    for (const pid of allPetIds) {
      await tx.execute(sql`DELETE FROM notifications WHERE related_case_id IN (
        SELECT id FROM cases WHERE primary_pet_id = ${pid}
      )`);
      await tx.execute(sql`DELETE FROM pet_events WHERE pet_id = ${pid}`);
      await tx.execute(sql`DELETE FROM cases WHERE primary_pet_id = ${pid}`);
      await tx.execute(sql`DELETE FROM pets WHERE id = ${pid}`);
    }
    await tx.execute(
      sql`DELETE FROM organizations WHERE id IN (${ucSanitaryOrgId}::uuid, ${ucShelterOrgId}::uuid)`,
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function insertProposalEventUCT(petId: string, caseId: string, occurredAt: Date) {
  const payload = validateEventPayload("custody_transfer_proposed", {
    from_user_id: null,
    from_organization_id: ucSanitaryOrgId,
    to_user_id: null,
    to_organization_id: ucShelterOrgId,
    reason: "org_to_org_handoff",
    notes: null,
    matched_against_pet_id: null,
    proposed_at: occurredAt.toISOString(),
  });
  await db.insert(petEvents).values({
    petId,
    eventType: "custody_transfer_proposed",
    occurredAt,
    recordedAt: occurredAt,
    authorRole: "govt",
    authorOrganizationId: ucSanitaryOrgId,
    payload,
    caseId,
  });
}

// ---------------------------------------------------------------------------
// Invariant 1: API contract — exports are stable after migration
// ---------------------------------------------------------------------------
describe("escalate-stale-decomiso-handoffs use-case — API contract", () => {
  it("exports findStaleDecomisoCandidates and escalateStaleDecomiso as functions", () => {
    expect(typeof findStaleDecomisoCandidates).toBe("function");
    expect(typeof escalateStaleDecomiso).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Invariant 2: clock is on latest proposal, not opened_at
// ---------------------------------------------------------------------------
describe("escalate-stale-decomiso-handoffs use-case — scan clock invariant", () => {
  let staleCaseId: string;
  let freshCaseId: string;

  beforeAll(async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    // Stale case: opened 10d ago, latest proposal 10d ago.
    const stale = await openCase({
      kind: "custody_episode",
      primarySubjectKind: "registered_pet",
      primaryPetId: ucPetStaleId,
      openedByOrganizationId: ucSanitaryOrgId,
      receiverOrganizationId: ucShelterOrgId,
      openedReason: "auto: decomiso UCT stale unit test",
    });
    staleCaseId = stale.id;
    await db.execute(
      sql`UPDATE cases SET opened_at = ${tenDaysAgo.toISOString()}::timestamptz WHERE id = ${staleCaseId}`,
    );
    await insertProposalEventUCT(ucPetStaleId, staleCaseId, tenDaysAgo);

    // Fresh case: opened 10d ago but latest proposal is only 2d ago → excluded.
    const fresh = await openCase({
      kind: "custody_episode",
      primarySubjectKind: "registered_pet",
      primaryPetId: ucPetFreshId,
      openedByOrganizationId: ucSanitaryOrgId,
      receiverOrganizationId: ucShelterOrgId,
      openedReason: "auto: decomiso UCT fresh unit test",
    });
    freshCaseId = fresh.id;
    await db.execute(
      sql`UPDATE cases SET opened_at = ${tenDaysAgo.toISOString()}::timestamptz WHERE id = ${freshCaseId}`,
    );
    // Old proposal then a fresh reassign — clock must key on the latest one.
    await insertProposalEventUCT(ucPetFreshId, freshCaseId, tenDaysAgo);
    await insertProposalEventUCT(ucPetFreshId, freshCaseId, twoDaysAgo);
  });

  it("stale case (latest proposal >7d) IS included in scan results", async () => {
    const candidates = await findStaleDecomisoCandidates({ staleAfterDays: 7 });
    expect(candidates.some((c) => c.id === staleCaseId)).toBe(true);
  });

  it("fresh case (latest proposal <7d) is NOT included even though opened_at >7d", async () => {
    const candidates = await findStaleDecomisoCandidates({ staleAfterDays: 7 });
    expect(candidates.some((c) => c.id === freshCaseId)).toBe(false);
  });

  it("escalateStaleDecomiso inserts notifications for the stale case", async () => {
    const candidates = await findStaleDecomisoCandidates({ staleAfterDays: 7 });
    const candidate = candidates.find((c) => c.id === staleCaseId);
    expect(candidate).toBeDefined();
    if (!candidate) return;

    await escalateStaleDecomiso(candidate);

    const notifs = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.notificationType, "decomiso_handoff_stale"),
          eq(notifications.relatedCaseId, staleCaseId),
        ),
      );
    expect(notifs.length).toBeGreaterThan(0);
  });
});
