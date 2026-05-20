// Integration tests for cross-org transfer handshake (spec
// 2026-05-19-cross-org-transfer-ux-design).
//
// The full server actions require formData + supabase auth so we
// exercise the contract by emulating the action's tx steps and the
// cron closer directly.

import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cases, db, organizations, ownerships, petEvents, pets } from "@/db";
import {
  expireCrossOrgTransfer,
  findExpiredCrossOrgTransfers,
} from "@/lib/case-closers/expire-cross-org-transfers";
import { closeCase, openCase } from "@/lib/case-helpers";
import { V1_CASE_KINDS } from "@/lib/case-kinds";
import { getLifecycle } from "@/lib/case-lifecycles";
import { validateEventPayload } from "@/lib/event-schemas";
import { withMutationOverride } from "./_helpers/db-overrides";

const SENDER_TOKEN = "DIM-XO-SND1";
const RECEIVER_TOKEN = "DIM-XO-RCV1";
const PET_TOKEN = "DIM-XO-PA1";

let senderId: string;
let receiverId: string;
let petId: string;
let caseId: string;

beforeAll(async () => {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`DELETE FROM pet_events WHERE pet_id IN (
      SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
    )`);
    await tx.execute(sql`DELETE FROM cases WHERE primary_pet_id IN (
      SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
    )`);
    await tx.execute(sql`DELETE FROM ownerships WHERE pet_id IN (
      SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
    )`);
    await tx.execute(sql`DELETE FROM pets WHERE public_token = ${PET_TOKEN}`);
    await tx.execute(
      sql`DELETE FROM organizations WHERE public_token IN (${SENDER_TOKEN}, ${RECEIVER_TOKEN})`,
    );
  });

  const [sender] = await db
    .insert(organizations)
    .values({
      publicToken: SENDER_TOKEN,
      legalName: "Refugio Sender SRL",
      displayName: "Refugio Sender",
      orgType: "shelter",
      email: "xo-sender@dim-test.local",
      verified: true,
    })
    .returning();
  senderId = sender.id;

  const [receiver] = await db
    .insert(organizations)
    .values({
      publicToken: RECEIVER_TOKEN,
      legalName: "Refugio Receiver SRL",
      displayName: "Refugio Receiver",
      orgType: "shelter",
      email: "xo-receiver@dim-test.local",
      verified: true,
    })
    .returning();
  receiverId = receiver.id;

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN,
      name: "CrossOrgTest",
      species: "dog",
      sex: "unknown",
      potentiallyDangerousBreed: false,
    })
    .returning();
  petId = pet.id;

  await db.insert(ownerships).values({
    petId,
    ownerOrganizationId: senderId,
    role: "shelter_custody",
    startedAt: new Date(),
  });
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`DELETE FROM pet_events WHERE pet_id = ${petId}`);
    // Two cases may exist (the happy-path one + the stale-cron one). Wipe
    // everything for this pet so the pets DELETE doesn't trip on
    // cases_primary_pet_id_fkey.
    await tx.execute(sql`DELETE FROM cases WHERE primary_pet_id = ${petId}`);
    await tx.execute(sql`DELETE FROM ownerships WHERE pet_id = ${petId}`);
    await tx.execute(sql`DELETE FROM pets WHERE id = ${petId}`);
    await tx.execute(
      sql`DELETE FROM organizations WHERE id IN (${senderId}::uuid, ${receiverId}::uuid)`,
    );
  });
});

describe("custody_transfer_handshake — V1 catalog", () => {
  it("is included in V1_CASE_KINDS", () => {
    expect(V1_CASE_KINDS).toContain("custody_transfer_handshake");
  });

  it("has a registered lifecycle with cronCloseRoute set", () => {
    const lifecycle = getLifecycle("custody_transfer_handshake");
    expect(lifecycle).not.toBeNull();
    expect(lifecycle?.cronCloseRoute).toBe("/api/cron/expire-cross-org-transfers");
    expect(lifecycle?.reopenAllowed).toBe(false);
  });
});

describe("cross-org transfer — propose + accept happy path", () => {
  it("propose opens a case with the proposal event attached", async () => {
    await db.transaction(async (tx) => {
      const c = await openCase(
        {
          kind: "custody_transfer_handshake",
          primarySubjectKind: "registered_pet",
          primaryPetId: petId,
          openedByOrganizationId: senderId,
          openedReason: "auto: cross-org transfer proposed reason=space_constraint",
        },
        tx,
      );
      caseId = c.id;

      const payload = validateEventPayload("custody_transfer_proposed", {
        from_user_id: null,
        from_organization_id: senderId,
        to_user_id: null,
        to_organization_id: receiverId,
        reason: "space_constraint",
        notes: null,
        matched_against_pet_id: null,
        proposed_at: new Date().toISOString(),
      });
      await tx.insert(petEvents).values({
        petId,
        eventType: "custody_transfer_proposed",
        occurredAt: new Date(),
        recordedAt: new Date(),
        authorRole: "shelter",
        authorOrganizationId: senderId,
        payload,
        caseId: c.id,
      });
    });

    const [row] = await db
      .select({ status: cases.status, caseKind: cases.caseKind })
      .from(cases)
      .where(eq(cases.id, caseId));
    expect(row.status).toBe("open");
    expect(row.caseKind).toBe("custody_transfer_handshake");
  });

  it("accept emits custody_transferred + flips ownerships + closes the case", async () => {
    await db.transaction(async (tx) => {
      const now = new Date();
      const transferPayload = validateEventPayload("custody_transferred", {
        from_user_id: null,
        from_organization_id: senderId,
        to_user_id: null,
        to_organization_id: receiverId,
        from_role: "shelter_custody",
        to_role: "shelter_custody",
        reason: "space_constraint",
        matched_against_pet_id: null,
        foster_ended_event_id: null,
        notes: null,
      });
      await tx.insert(petEvents).values({
        petId,
        eventType: "custody_transferred",
        occurredAt: now,
        recordedAt: now,
        authorRole: "shelter",
        authorOrganizationId: receiverId,
        payload: transferPayload,
        caseId,
      });
      await tx
        .update(ownerships)
        .set({ endedAt: now })
        .where(
          and(
            eq(ownerships.petId, petId),
            eq(ownerships.ownerOrganizationId, senderId),
            eq(ownerships.role, "shelter_custody"),
            isNull(ownerships.endedAt),
          ),
        );
      await tx.insert(ownerships).values({
        petId,
        ownerOrganizationId: receiverId,
        role: "shelter_custody",
        startedAt: now,
      });
      await closeCase({ caseId, reason: "resolved" }, tx);
    });

    const [closed] = await db
      .select({ status: cases.status, closedReason: cases.closedReason })
      .from(cases)
      .where(eq(cases.id, caseId));
    expect(closed.status).toBe("closed");
    expect(closed.closedReason).toBe("resolved");

    // Sender's shelter_custody ended, receiver's active.
    const senderActive = await db
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.ownerOrganizationId, senderId),
          isNull(ownerships.endedAt),
        ),
      );
    const receiverActive = await db
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.ownerOrganizationId, receiverId),
          isNull(ownerships.endedAt),
        ),
      );
    expect(senderActive.length).toBe(0);
    expect(receiverActive.length).toBe(1);
  });
});

describe("cross-org transfer — expire cron", () => {
  let staleCaseId: string;

  beforeAll(async () => {
    // Open a fresh handshake "31 days ago" so the cron picks it up.
    await db.transaction(async (tx) => {
      const c = await openCase(
        {
          kind: "custody_transfer_handshake",
          primarySubjectKind: "registered_pet",
          primaryPetId: petId,
          openedByOrganizationId: senderId,
          openedReason: "auto: cross-org transfer for expiry test",
        },
        tx,
      );
      staleCaseId = c.id;
      // Backdate opened_at directly via SQL — the helper inserts now().
      await tx.execute(
        sql`UPDATE cases SET opened_at = ${new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()}::timestamptz WHERE id = ${staleCaseId}`,
      );

      const payload = validateEventPayload("custody_transfer_proposed", {
        from_user_id: null,
        from_organization_id: senderId,
        to_user_id: null,
        to_organization_id: receiverId,
        reason: "shelter_closing",
        notes: null,
        matched_against_pet_id: null,
        proposed_at: new Date().toISOString(),
      });
      await tx.insert(petEvents).values({
        petId,
        eventType: "custody_transfer_proposed",
        occurredAt: new Date(),
        recordedAt: new Date(),
        authorRole: "shelter",
        authorOrganizationId: senderId,
        payload,
        caseId: c.id,
      });
    });
  });

  it("scan finds the stale handshake", async () => {
    const candidates = await findExpiredCrossOrgTransfers();
    expect(candidates.some((c) => c.id === staleCaseId)).toBe(true);
  });

  it("expire flips status to closed with closed_reason='auto_expired'", async () => {
    const candidates = await findExpiredCrossOrgTransfers();
    const candidate = candidates.find((c) => c.id === staleCaseId);
    expect(candidate).toBeDefined();
    if (!candidate) return;
    await expireCrossOrgTransfer(candidate);

    const [row] = await db
      .select({ status: cases.status, closedReason: cases.closedReason })
      .from(cases)
      .where(eq(cases.id, staleCaseId));
    expect(row.status).toBe("closed");
    expect(row.closedReason).toBe("auto_expired");
  });

  it("is idempotent — already-closed cases drop out of the scan", async () => {
    const candidates = await findExpiredCrossOrgTransfers();
    expect(candidates.some((c) => c.id === staleCaseId)).toBe(false);
  });
});
