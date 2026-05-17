// Integration tests for Lost & Found Fase 5 — return-to-owner two-phase
// handshake + lazy auto-cancel.
//
// Structure:
//   1. proposeReturnToOwnerAction — refugio + vecino happy paths + rejections
//   2. ownerAcceptReturnAction — happy path + auto-cancel scenarios
//   3. ownerRejectReturnAction — note event + notification
//   4. actorCancelProposalAction — cancellation event + notification to owner
//
// Database setup mirrors chip-match.test.ts (ephemeral users + transaction tests).
// All rows created here are deleted in afterAll.

import { createClient } from "@supabase/supabase-js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  actorCancelProposalWriter,
  ownerAcceptReturnWriter,
  ownerRejectReturnWriter,
  proposeReturnAsRefugioWriter,
  proposeReturnAsVecinoWriter,
} from "@/app/actions/return-to-owner";
import {
  db,
  notifications,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
} from "@/db";
import { generatePublicToken } from "@/lib/publicToken";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Test fixtures — emails
// ---------------------------------------------------------------------------

const OWNER_EMAIL = "return-owner@dim-test.local";
const REFUGIO_MEMBER_EMAIL = "return-refugio-member@dim-test.local";
const VECINO_EMAIL = "return-vecino@dim-test.local";
const PASS = "ReturnTest_2026!";

let ownerUserId: string;
let refugioMemberUserId: string;
let vecinoUserId: string;
let orgId: string;
let orgToken: string;

// Pet IDs tracked for cleanup.
const insertedPetIds: string[] = [];

// ---------------------------------------------------------------------------
// Cleanup helper
// ---------------------------------------------------------------------------

async function purgeUserByEmail(email: string) {
  const { data } = await supabase.auth.admin.listUsers();
  const found = data?.users.find((u) => u.email === email);
  const displayName = email.split("@")[0];
  const orphans = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.displayName, displayName));
  const ids = [
    ...(found ? [found.id] : []),
    ...orphans.map((o) => o.id).filter((id) => id !== found?.id),
  ];
  for (const uid of ids) {
    await db.delete(notifications).where(eq(notifications.userId, uid));
    await db.delete(organizationMemberships).where(eq(organizationMemberships.userId, uid));
    await db.delete(profiles).where(eq(profiles.id, uid));
  }
  if (found) await supabase.auth.admin.deleteUser(found.id);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await purgeUserByEmail(OWNER_EMAIL);
  await purgeUserByEmail(REFUGIO_MEMBER_EMAIL);
  await purgeUserByEmail(VECINO_EMAIL);

  const o = await supabase.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (o.error || !o.data.user) throw new Error(`createUser owner: ${o.error?.message}`);
  ownerUserId = o.data.user.id;

  const m = await supabase.auth.admin.createUser({
    email: REFUGIO_MEMBER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (m.error || !m.data.user) throw new Error(`createUser refugio member: ${m.error?.message}`);
  refugioMemberUserId = m.data.user.id;

  const v = await supabase.auth.admin.createUser({
    email: VECINO_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (v.error || !v.data.user) throw new Error(`createUser vecino: ${v.error?.message}`);
  vecinoUserId = v.data.user.id;

  // Create a test organization for refugio tests.
  orgToken = generatePublicToken();
  const [org] = await db
    .insert(organizations)
    .values({
      publicToken: orgToken,
      legalName: "Return Test Refugio SRL",
      displayName: "Return Test Refugio",
      orgType: "shelter",
      email: "return-refugio@dim-test.local",
      verified: true,
    })
    .returning();
  orgId = org.id;

  // Add refugioMember as admin of the org.
  await db.insert(organizationMemberships).values({
    organizationId: orgId,
    userId: refugioMemberUserId,
    role: "admin",
    canWritePetEvents: true,
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(async () => {
  for (const petId of insertedPetIds) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local app.allow_event_mutation = 'true'`);
      await tx.delete(pets).where(eq(pets.id, petId));
    });
  }

  for (const uid of [ownerUserId, refugioMemberUserId, vecinoUserId].filter(Boolean)) {
    await db.delete(notifications).where(eq(notifications.userId, uid));
  }

  if (orgId) {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }

  await purgeUserByEmail(OWNER_EMAIL);
  await purgeUserByEmail(REFUGIO_MEMBER_EMAIL);
  await purgeUserByEmail(VECINO_EMAIL);
});

// ---------------------------------------------------------------------------
// Helper: insert a lost pet with an owner + optional shelter_custody
// ---------------------------------------------------------------------------

async function insertLostPet(opts: {
  ownerUserId: string;
  status?: "active" | "lost" | "deceased";
  shelterCustodyOrgId?: string;
  shelterCustodyUserId?: string;
  tokenSuffix?: string;
}): Promise<{ petId: string; publicToken: string }> {
  const suffix = opts.tokenSuffix ?? Date.now().toString(36).toUpperCase().slice(-6);
  const token = `RTN-${suffix}`;
  const now = new Date();

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name: `ReturnPet-${suffix}`,
      species: "dog",
      sex: "unknown",
      status: opts.status ?? "lost",
      potentiallyDangerousBreed: false,
    })
    .returning();

  insertedPetIds.push(pet.id);

  // Insert owner ownership.
  await db.insert(ownerships).values({
    petId: pet.id,
    ownerUserId: opts.ownerUserId,
    role: "owner",
    startedAt: now,
  });

  // Insert shelter_custody if requested.
  if (opts.shelterCustodyOrgId) {
    await db.insert(ownerships).values({
      petId: pet.id,
      ownerOrganizationId: opts.shelterCustodyOrgId,
      role: "shelter_custody",
      startedAt: now,
    });
  }
  if (opts.shelterCustodyUserId) {
    await db.insert(ownerships).values({
      petId: pet.id,
      ownerUserId: opts.shelterCustodyUserId,
      role: "shelter_custody",
      startedAt: now,
    });
  }

  return { petId: pet.id, publicToken: token };
}

// ---------------------------------------------------------------------------
// 1. proposeReturnToOwnerAction — refugio
// ---------------------------------------------------------------------------

describe("proposeReturnAsRefugioWriter", () => {
  it("happy path: emits custody_transfer_proposed and notifies owner", async () => {
    const { petId, publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyOrgId: orgId,
    });

    const result = await proposeReturnAsRefugioWriter({
      userId: refugioMemberUserId,
      organization: { id: orgId, displayName: "Return Test Refugio" },
      petPublicToken: publicToken,
      notes: "Listo para la entrega.",
    });

    expect("ok" in result && result.ok).toBe(true);
    if (!("ok" in result)) throw new Error("Expected ok");
    expect(result.eventId).toBeTruthy();

    // Verify event was created.
    const events = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_transfer_proposed")));
    expect(events.length).toBe(1);

    // Verify the event payload shape.
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.reason).toBe("return_to_original_owner");
    expect(payload.from_organization_id).toBe(orgId);
    expect(payload.to_user_id).toBe(ownerUserId);
    expect(payload.notes).toBe("Listo para la entrega.");

    // Verify owner notification.
    const notifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "custody_transfer_proposal_owner"),
          eq(notifications.relatedPetId, petId),
        ),
      );
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].severity).toBe("urgent");
  });

  it("rejects when pet is not lost", async () => {
    const { publicToken } = await insertLostPet({
      ownerUserId,
      status: "active",
      shelterCustodyOrgId: orgId,
    });

    const result = await proposeReturnAsRefugioWriter({
      userId: refugioMemberUserId,
      organization: { id: orgId, displayName: "Return Test Refugio" },
      petPublicToken: publicToken,
      notes: null,
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toMatch(/perdida/i);
  });

  it("rejects when org has no active shelter_custody", async () => {
    const { publicToken } = await insertLostPet({
      ownerUserId,
      // No shelter custody inserted
    });

    const result = await proposeReturnAsRefugioWriter({
      userId: refugioMemberUserId,
      organization: { id: orgId, displayName: "Return Test Refugio" },
      petPublicToken: publicToken,
      notes: null,
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toMatch(/custodia/i);
  });

  it("rejects when a pending proposal already exists (anti-double-proposal)", async () => {
    const { publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyOrgId: orgId,
    });

    // First proposal — should succeed.
    const first = await proposeReturnAsRefugioWriter({
      userId: refugioMemberUserId,
      organization: { id: orgId, displayName: "Return Test Refugio" },
      petPublicToken: publicToken,
      notes: null,
    });
    expect("ok" in first && first.ok).toBe(true);

    // Second proposal from same actor — should be blocked.
    const second = await proposeReturnAsRefugioWriter({
      userId: refugioMemberUserId,
      organization: { id: orgId, displayName: "Return Test Refugio" },
      petPublicToken: publicToken,
      notes: null,
    });

    expect("error" in second).toBe(true);
    if (!("error" in second)) throw new Error("Expected error");
    expect(second.error).toMatch(/pendiente/i);
  });
});

// ---------------------------------------------------------------------------
// 2. proposeReturnAsVecinoWriter
// ---------------------------------------------------------------------------

describe("proposeReturnAsVecinoWriter", () => {
  it("happy path: emits proposal and notifies owner", async () => {
    const { petId, publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyUserId: vecinoUserId,
    });

    const result = await proposeReturnAsVecinoWriter({
      userId: vecinoUserId,
      petPublicToken: publicToken,
      notes: "Vecino quiere devolver.",
    });

    expect("ok" in result && result.ok).toBe(true);

    const events = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_transfer_proposed")));
    expect(events.length).toBe(1);

    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.from_user_id).toBe(vecinoUserId);
    expect(payload.to_user_id).toBe(ownerUserId);

    const notifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "custody_transfer_proposal_owner"),
          eq(notifications.relatedPetId, petId),
        ),
      );
    expect(notifs.length).toBeGreaterThan(0);
  });

  it("rejects when vecino has no shelter_custody", async () => {
    const { publicToken } = await insertLostPet({ ownerUserId });

    const result = await proposeReturnAsVecinoWriter({
      userId: vecinoUserId,
      petPublicToken: publicToken,
      notes: null,
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toMatch(/custodia/i);
  });
});

// ---------------------------------------------------------------------------
// 3. ownerAcceptReturnWriter — happy path
// ---------------------------------------------------------------------------

describe("ownerAcceptReturnWriter — happy path", () => {
  it("executes transfer, ends shelter_custody, flips pet to active", async () => {
    const { petId, publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyOrgId: orgId,
    });

    // Propose first.
    const propose = await proposeReturnAsRefugioWriter({
      userId: refugioMemberUserId,
      organization: { id: orgId, displayName: "Return Test Refugio" },
      petPublicToken: publicToken,
      notes: null,
    });
    expect("ok" in propose && propose.ok).toBe(true);

    // Owner accepts.
    const result = await ownerAcceptReturnWriter({
      userId: ownerUserId,
      petPublicToken: publicToken,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(`Unexpected error: ${result.error}`);
    expect(result.ok).toBe(true);
    if ("autoCancelled" in result && result.autoCancelled) {
      throw new Error(`Unexpected autoCancelled: ${result.reason}`);
    }

    // Verify custody_transferred event.
    const transferEvents = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_transferred")));
    expect(transferEvents.length).toBe(1);

    const tPayload = transferEvents[0].payload as Record<string, unknown>;
    expect(tPayload.reason).toBe("return_to_original_owner");
    expect(tPayload.to_user_id).toBe(ownerUserId);

    // Verify shelter_custody was ended.
    const activeCustody = await db
      .select()
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.ownerOrganizationId, orgId),
          eq(ownerships.role, "shelter_custody"),
          isNull(ownerships.endedAt),
        ),
      );
    expect(activeCustody.length).toBe(0);

    // Verify pet status flipped to active.
    const [updatedPet] = await db
      .select({ status: pets.status })
      .from(pets)
      .where(eq(pets.id, petId));
    expect(updatedPet.status).toBe("active");

    // Verify status_changed event was emitted.
    const statusEvents = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "status_changed")));
    expect(statusEvents.length).toBeGreaterThan(0);
    const lastStatus = statusEvents[statusEvents.length - 1].payload as Record<string, unknown>;
    expect(lastStatus.from_status).toBe("lost");
    expect(lastStatus.to_status).toBe("active");

    // Verify actor notification.
    const actorNotifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, refugioMemberUserId),
          eq(notifications.notificationType, "custody_transfer_accepted_owner_side"),
          eq(notifications.relatedPetId, petId),
        ),
      );
    expect(actorNotifs.length).toBeGreaterThan(0);
  });

  it("vecino happy path: transfer completes, shelter_custody ended, pet active", async () => {
    const { petId, publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyUserId: vecinoUserId,
    });

    const propose = await proposeReturnAsVecinoWriter({
      userId: vecinoUserId,
      petPublicToken: publicToken,
      notes: null,
    });
    expect("ok" in propose && propose.ok).toBe(true);

    const result = await ownerAcceptReturnWriter({
      userId: ownerUserId,
      petPublicToken: publicToken,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(`Unexpected error: ${result.error}`);

    // shelter_custody of vecino ended.
    const activeCustody = await db
      .select()
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.ownerUserId, vecinoUserId),
          eq(ownerships.role, "shelter_custody"),
          isNull(ownerships.endedAt),
        ),
      );
    expect(activeCustody.length).toBe(0);

    const [updatedPet] = await db
      .select({ status: pets.status })
      .from(pets)
      .where(eq(pets.id, petId));
    expect(updatedPet.status).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// 4. ownerAcceptReturnWriter — auto-cancel scenarios
// ---------------------------------------------------------------------------

describe("ownerAcceptReturnWriter — auto-cancel", () => {
  it("auto-cancels when pet is already active (found by owner independently)", async () => {
    const { petId, publicToken } = await insertLostPet({
      ownerUserId,
      status: "active", // already found — simulate post-hoc
      shelterCustodyOrgId: orgId,
    });

    // Insert proposal event directly (bypassing the lost-status check in propose).
    const now = new Date();
    await db.transaction(async (tx) => {
      const { validateEventPayload } = await import("@/lib/event-schemas");
      const payload = validateEventPayload("custody_transfer_proposed", {
        from_user_id: null,
        from_organization_id: orgId,
        to_user_id: ownerUserId,
        to_organization_id: null,
        reason: "return_to_original_owner",
        notes: null,
        matched_against_pet_id: petId,
        proposed_at: now.toISOString(),
      });
      await tx.execute(sql`set local app.allow_event_mutation = 'true'`);
      await tx.insert(petEvents).values({
        petId,
        eventType: "custody_transfer_proposed",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: refugioMemberUserId,
        authorRole: "shelter",
        authorOrganizationId: orgId,
        payload,
      });
    });

    // Owner tries to accept — but pet is no longer lost.
    const result = await ownerAcceptReturnWriter({
      userId: ownerUserId,
      petPublicToken: publicToken,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(result.error);
    expect("autoCancelled" in result && result.autoCancelled).toBe(true);

    // Verify auto-cancel note_added event was emitted.
    const cancelNotes = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "note_added")));
    expect(cancelNotes.length).toBeGreaterThan(0);
    const lastNote = cancelNotes[cancelNotes.length - 1].payload as Record<string, unknown>;
    expect(String(lastNote.text)).toMatch(/Auto-cancelled/i);
  });

  it("auto-cancels when shelter_custody was revoked between propose and accept", async () => {
    const { petId, publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyOrgId: orgId,
    });

    // Propose.
    await proposeReturnAsRefugioWriter({
      userId: refugioMemberUserId,
      organization: { id: orgId, displayName: "Return Test Refugio" },
      petPublicToken: publicToken,
      notes: null,
    });

    // Revoke the org's shelter_custody BEFORE the owner accepts.
    await db
      .update(ownerships)
      .set({ endedAt: new Date() })
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.ownerOrganizationId, orgId),
          eq(ownerships.role, "shelter_custody"),
          isNull(ownerships.endedAt),
        ),
      );

    // Owner accepts — but custody is gone.
    const result = await ownerAcceptReturnWriter({
      userId: ownerUserId,
      petPublicToken: publicToken,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error(result.error);
    expect("autoCancelled" in result && result.autoCancelled).toBe(true);
    if (!("autoCancelled" in result)) throw new Error("Expected autoCancelled");
    expect(result.reason).toMatch(/custodia/i);
  });

  it("returns error when no pending proposal exists", async () => {
    const { publicToken } = await insertLostPet({ ownerUserId });

    const result = await ownerAcceptReturnWriter({
      userId: ownerUserId,
      petPublicToken: publicToken,
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toMatch(/propuesta/i);
  });

  it("returns error when caller is not the owner", async () => {
    const { publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyOrgId: orgId,
    });

    // Propose as refugio.
    await proposeReturnAsRefugioWriter({
      userId: refugioMemberUserId,
      organization: { id: orgId, displayName: "Return Test Refugio" },
      petPublicToken: publicToken,
      notes: null,
    });

    // Try to accept as vecino (not the owner).
    const result = await ownerAcceptReturnWriter({
      userId: vecinoUserId,
      petPublicToken: publicToken,
    });

    expect("error" in result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. ownerRejectReturnWriter
// ---------------------------------------------------------------------------

describe("ownerRejectReturnWriter", () => {
  it("emits note_added event, does not change pet status, notifies actor", async () => {
    const { petId, publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyUserId: vecinoUserId,
    });

    // Propose as vecino.
    await proposeReturnAsVecinoWriter({
      userId: vecinoUserId,
      petPublicToken: publicToken,
      notes: null,
    });

    // Owner rejects.
    const result = await ownerRejectReturnWriter({
      userId: ownerUserId,
      petPublicToken: publicToken,
      reason: "Coordinamos por otro medio.",
    });

    expect("ok" in result && result.ok).toBe(true);

    // Verify note_added event.
    const notes = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "note_added")));
    expect(notes.length).toBeGreaterThan(0);
    const notePayload = notes[notes.length - 1].payload as Record<string, unknown>;
    expect(String(notePayload.text)).toMatch(/rechazó/i);
    expect(String(notePayload.text)).toMatch(/Coordinamos por otro medio/);

    // Verify pet status unchanged (still lost).
    const [currentPet] = await db
      .select({ status: pets.status })
      .from(pets)
      .where(eq(pets.id, petId));
    expect(currentPet.status).toBe("lost");

    // Verify actor (vecino) was notified.
    const actorNotifs = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, vecinoUserId), eq(notifications.relatedPetId, petId)));
    // Should have at least the proposal notification + rejection notification.
    expect(actorNotifs.length).toBeGreaterThan(0);
  });

  it("returns error when caller is not the owner", async () => {
    const { publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyOrgId: orgId,
    });

    await proposeReturnAsRefugioWriter({
      userId: refugioMemberUserId,
      organization: { id: orgId, displayName: "Return Test Refugio" },
      petPublicToken: publicToken,
      notes: null,
    });

    // Vecino tries to reject.
    const result = await ownerRejectReturnWriter({
      userId: vecinoUserId,
      petPublicToken: publicToken,
      reason: "No es el dueño",
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toMatch(/dueño/i);
  });
});

// ---------------------------------------------------------------------------
// 6. actorCancelProposalWriter
// ---------------------------------------------------------------------------

describe("actorCancelProposalWriter", () => {
  it("vecino cancels own proposal: emits note_added, notifies owner", async () => {
    const { petId, publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyUserId: vecinoUserId,
    });

    await proposeReturnAsVecinoWriter({
      userId: vecinoUserId,
      petPublicToken: publicToken,
      notes: null,
    });

    const result = await actorCancelProposalWriter({
      userId: vecinoUserId,
      petPublicToken: publicToken,
      reason: "Ya no puedo entregarlo hoy.",
    });

    expect("ok" in result && result.ok).toBe(true);

    // Verify note_added event.
    const notes = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "note_added")));
    expect(notes.length).toBeGreaterThan(0);
    const notePayload = notes[notes.length - 1].payload as Record<string, unknown>;
    expect(String(notePayload.text)).toMatch(/canceló/i);
    expect(String(notePayload.text)).toMatch(/Ya no puedo entregarlo/);

    // Verify owner was notified.
    const ownerCancelNotifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "custody_transfer_auto_cancelled"),
          eq(notifications.relatedPetId, petId),
        ),
      );
    expect(ownerCancelNotifs.length).toBeGreaterThan(0);
  });

  it("refugio org actor cancels own proposal: note emitted, owner notified", async () => {
    const { petId, publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyOrgId: orgId,
    });

    await proposeReturnAsRefugioWriter({
      userId: refugioMemberUserId,
      organization: { id: orgId, displayName: "Return Test Refugio" },
      petPublicToken: publicToken,
      notes: null,
    });

    const result = await actorCancelProposalWriter({
      userId: refugioMemberUserId,
      petPublicToken: publicToken,
      reason: "El dueño ya coordinó por teléfono.",
      actorOrgId: orgId,
    });

    expect("ok" in result && result.ok).toBe(true);

    const notes = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "note_added")));
    expect(notes.length).toBeGreaterThan(0);

    // Owner notified.
    const ownerNotifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "custody_transfer_auto_cancelled"),
          eq(notifications.relatedPetId, petId),
        ),
      );
    expect(ownerNotifs.length).toBeGreaterThan(0);
  });

  it("returns error when caller is not the actor who proposed", async () => {
    const { publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyOrgId: orgId,
    });

    await proposeReturnAsRefugioWriter({
      userId: refugioMemberUserId,
      organization: { id: orgId, displayName: "Return Test Refugio" },
      petPublicToken: publicToken,
      notes: null,
    });

    // Vecino tries to cancel a refugio's proposal.
    const result = await actorCancelProposalWriter({
      userId: vecinoUserId,
      petPublicToken: publicToken,
      reason: "Trying to steal the cancel.",
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toMatch(/propuso/i);
  });

  it("returns error when no pending proposal exists", async () => {
    const { publicToken } = await insertLostPet({
      ownerUserId,
      shelterCustodyUserId: vecinoUserId,
    });

    const result = await actorCancelProposalWriter({
      userId: vecinoUserId,
      petPublicToken: publicToken,
      reason: "No proposal exists.",
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toMatch(/propuesta/i);
  });
});
