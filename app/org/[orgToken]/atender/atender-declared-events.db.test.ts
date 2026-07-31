// Integration test: the "already signed" rule, against the REAL event spine.
//
// Why a DB test and not another mock. The rule under test is a statement about
// how APPEND-ONLY ROWS RELATE TO EACH OTHER: a vet's signature cannot mutate
// the owner's declaration, it appends a sibling row. A mock lets you hand the
// query any row set you like — including one the query could never return —
// which is exactly how the original defect shipped green: the sibling test file
// fed an `authorRole = 'owner'` query a vet row, "proving" an exit condition
// that was unreachable in production. Here the rows are written to Postgres and
// read back through the untouched production query.
//
// Fixtures are pet-scoped and torn down in afterAll; pet_events is append-only
// at the DB level, so the cascading delete runs under withMutationOverride.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withMutationOverride } from "@/__tests__/_helpers/db-overrides";
import { db, organizations, petEvents, pets } from "@/db";

import {
  type SignableEventType,
  type SignerAuthorship,
  fetchPendingDeclaredEvents,
  rejectIfAlreadySigned,
} from "./atender-declared-events";

const CHIP_A = "985141004321456";
const CHIP_B = "985141009999999";

const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
const petIds: string[] = [];
let orgId = "";

// The two signer tiers atender-access.ts can produce (RA-2 F2). Only the first
// is a SIGNATURE; the second is an institutional record at `org_registered`.
const VET_SIGNER = (): SignerAuthorship => ({
  authorRole: "vet",
  authorVerified: true,
  authorOrganizationId: orgId,
});
const ORG_SIGNER = (): SignerAuthorship => ({
  authorRole: "shelter",
  authorVerified: false,
  authorOrganizationId: orgId,
});

// The declaration/signature ids each scenario needs to assert on.
const ids: Record<string, string> = {};
const pet: Record<string, string> = {};

async function makePet(label: string): Promise<string> {
  const [row] = await db
    .insert(pets)
    .values({
      publicToken: `SIGNRULE-${suffix}-${label}`,
      name: `Firma ${label}`,
      species: "dog",
      sex: "unknown",
      status: "active",
    })
    .returning({ id: pets.id });
  petIds.push(row.id);
  return row.id;
}

/** Writes a row the way production writes it: owner declarations are
 * self_reported, vet signatures are a SEPARATE professional_verified row. The
 * owner row is never touched. `org` is the third arm the first cut of this file
 * never wrote (RA-2 F2): an org member WITHOUT a validated matricula, stamped
 * shelter/authorVerified:false exactly as atender-access.ts stamps them, which
 * computeConfidence resolves to `org_registered` — below the professional bar. */
async function writeEvent(input: {
  petId: string;
  eventType: SignableEventType;
  occurredAt: string;
  payload: Record<string, unknown>;
  as: "owner" | "vet" | "org";
}): Promise<string> {
  const [row] = await db
    .insert(petEvents)
    .values({
      petId: input.petId,
      eventType: input.eventType,
      occurredAt: new Date(input.occurredAt),
      recordedAt: new Date(),
      recordedByUserId: null,
      authorRole: input.as === "org" ? "shelter" : input.as,
      authorVerified: input.as === "vet",
      authorOrganizationId: input.as === "owner" ? null : orgId,
      payload: { payload_version: 1, ...input.payload },
    })
    .returning({ id: petEvents.id });
  return row.id;
}

const chip = (n: string) => ({
  chip_number: n,
  country_code: null,
  implanted_by: null,
  location_on_body: null,
});
const sterilization = { procedure: "castration", performed_by: null, clinic: null };

beforeAll(async () => {
  // The org every non-owner row is attributed to. `org_registered` requires a
  // non-null authorOrganizationId, so this row is load-bearing, not decoration.
  const [org] = await db
    .insert(organizations)
    .values({
      publicToken: `SIGNRULE-ORG-${suffix}`,
      legalName: `Clinica Firma ${suffix}`,
      displayName: `Clinica Firma ${suffix}`,
      orgType: "clinic",
      email: `firma-${suffix.toLowerCase()}@example.test`,
    })
    .returning({ id: organizations.id });
  orgId = org.id;

  // A — a chip declaration nobody has signed yet.
  pet.pending = await makePet("A");
  ids.pendingChip = await writeEvent({
    petId: pet.pending,
    eventType: "microchip_implanted",
    occurredAt: "2026-06-01T12:00:00Z",
    payload: chip(CHIP_A),
    as: "owner",
  });

  // B — THE DEFECT: the owner declared, then a vet signed. Two rows.
  pet.signed = await makePet("B");
  ids.signedChipDeclaration = await writeEvent({
    petId: pet.signed,
    eventType: "microchip_implanted",
    occurredAt: "2026-06-01T12:00:00Z",
    payload: chip(CHIP_A),
    as: "owner",
  });
  await writeEvent({
    petId: pet.signed,
    eventType: "microchip_implanted",
    occurredAt: "2026-06-01T12:00:00Z",
    payload: chip(CHIP_A),
    as: "vet",
  });

  // C — one-shot act: sterilization signed (on a DIFFERENT date, as a vet
  // correcting the owner's guess would), then re-declared a year later.
  pet.oneShot = await makePet("C");
  await writeEvent({
    petId: pet.oneShot,
    eventType: "sterilization_performed",
    occurredAt: "2025-01-01T12:00:00Z",
    payload: sterilization,
    as: "owner",
  });
  await writeEvent({
    petId: pet.oneShot,
    eventType: "sterilization_performed",
    occurredAt: "2025-01-05T12:00:00Z",
    payload: sterilization,
    as: "vet",
  });
  ids.oneShotRedeclaration = await writeEvent({
    petId: pet.oneShot,
    eventType: "sterilization_performed",
    occurredAt: "2026-01-10T12:00:00Z",
    payload: sterilization,
    as: "owner",
  });

  // D — repeatable act: chip A signed a year ago, chip B declared today.
  pet.recurring = await makePet("D");
  ids.recurringOldDeclaration = await writeEvent({
    petId: pet.recurring,
    eventType: "microchip_implanted",
    occurredAt: "2025-01-01T12:00:00Z",
    payload: chip(CHIP_A),
    as: "owner",
  });
  await writeEvent({
    petId: pet.recurring,
    eventType: "microchip_implanted",
    occurredAt: "2025-01-05T12:00:00Z",
    payload: chip(CHIP_A),
    as: "vet",
  });
  ids.recurringNewDeclaration = await writeEvent({
    petId: pet.recurring,
    eventType: "microchip_implanted",
    occurredAt: "2026-01-10T12:00:00Z",
    payload: chip(CHIP_B),
    as: "owner",
  });

  // E (RA-2 F2) — the owner declared, then an org member WITHOUT a matricula
  // recorded it. That row is `org_registered`: a record, not a signature.
  pet.orgRecorded = await makePet("E");
  ids.orgRecordedDeclaration = await writeEvent({
    petId: pet.orgRecorded,
    eventType: "microchip_implanted",
    occurredAt: "2026-06-01T12:00:00Z",
    payload: chip(CHIP_A),
    as: "owner",
  });
  await writeEvent({
    petId: pet.orgRecorded,
    eventType: "microchip_implanted",
    occurredAt: "2026-06-01T12:00:00Z",
    payload: chip(CHIP_A),
    as: "org",
  });
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    if (petIds.length > 0) await tx.delete(pets).where(inArray(pets.id, petIds));
    if (orgId) await tx.delete(organizations).where(eq(organizations.id, orgId));
  });
});

describe("fetchPendingDeclaredEvents — against the real spine", () => {
  it("fixtures landed as append-only siblings (the vet row did NOT mutate the owner row)", async () => {
    const rows = await db
      .select({ id: petEvents.id, authorRole: petEvents.authorRole })
      .from(petEvents)
      .where(eq(petEvents.petId, pet.signed));
    expect(rows).toHaveLength(2);
    const declaration = rows.find((r) => r.id === ids.signedChipDeclaration);
    expect(declaration?.authorRole).toBe("owner");
    expect(rows.filter((r) => r.authorRole === "vet")).toHaveLength(1);
  });

  it("surfaces an owner declaration nobody has signed", async () => {
    const pending = await fetchPendingDeclaredEvents(pet.pending);
    expect(pending.map((p) => p.id)).toEqual([ids.pendingChip]);
    expect(pending[0].summary).toBe(`Microchip ${CHIP_A}`);
  });

  it("DROPS the declaration once a vet has signed it (the reported defect)", async () => {
    const pending = await fetchPendingDeclaredEvents(pet.signed);
    expect(pending).toEqual([]);
  });

  it("never re-surfaces a ONE-SHOT act, even re-declared a year later", async () => {
    const pending = await fetchPendingDeclaredEvents(pet.oneShot);
    expect(pending).toEqual([]);
  });

  it("DOES surface a RECURRING act's genuinely new declaration a year later", async () => {
    const pending = await fetchPendingDeclaredEvents(pet.recurring);
    expect(pending.map((p) => p.id)).toEqual([ids.recurringNewDeclaration]);
    expect(pending[0].prefill.chipNumber).toBe(CHIP_B);
  });
});

describe("rejectIfAlreadySigned — agrees with the card, row for row", () => {
  it("allows signing a still-pending declaration", async () => {
    const result = await rejectIfAlreadySigned(
      pet.pending,
      "microchip_implanted",
      ids.pendingChip,
      VET_SIGNER(),
    );
    expect(result).toBeNull();
  });

  it("rejects a second signature on a declaration a vet already signed", async () => {
    const result = await rejectIfAlreadySigned(
      pet.signed,
      "microchip_implanted",
      ids.signedChipDeclaration,
      VET_SIGNER(),
    );
    expect(result?.error).toMatch(/ya fue firmado/i);
  });

  it("rejects re-signing a ONE-SHOT act via a later duplicate declaration", async () => {
    const result = await rejectIfAlreadySigned(
      pet.oneShot,
      "sterilization_performed",
      ids.oneShotRedeclaration,
      VET_SIGNER(),
    );
    expect(result?.error).toMatch(/ya fue firmado/i);
  });

  it("allows signing a RECURRING act's new occurrence, and still blocks the old one", async () => {
    await expect(
      rejectIfAlreadySigned(
        pet.recurring,
        "microchip_implanted",
        ids.recurringNewDeclaration,
        VET_SIGNER(),
      ),
    ).resolves.toBeNull();
    const old = await rejectIfAlreadySigned(
      pet.recurring,
      "microchip_implanted",
      ids.recurringOldDeclaration,
      VET_SIGNER(),
    );
    expect(old?.error).toMatch(/ya fue firmado/i);
  });

  it("card and guard never disagree FOR A SIGNER WHO CAN CLEAR THE CARD", async () => {
    // The whole class of bug this fixes is the two answering differently. The
    // equivalence is stated for the matriculated signer on purpose: only a
    // professional signature clears the card, so only for them is "the card
    // still shows it" the same question as "the guard lets me write". See the
    // org_registered block below for the tier where the two legitimately part.
    const cases: Array<[string, SignableEventType, string]> = [
      [pet.pending, "microchip_implanted", ids.pendingChip],
      [pet.signed, "microchip_implanted", ids.signedChipDeclaration],
      [pet.oneShot, "sterilization_performed", ids.oneShotRedeclaration],
      [pet.recurring, "microchip_implanted", ids.recurringNewDeclaration],
      [pet.recurring, "microchip_implanted", ids.recurringOldDeclaration],
      [pet.orgRecorded, "microchip_implanted", ids.orgRecordedDeclaration],
    ];
    for (const [petId, eventType, eventId] of cases) {
      const pending = await fetchPendingDeclaredEvents(petId);
      const onCard = pending.some((p) => p.id === eventId);
      const guardAllows =
        (await rejectIfAlreadySigned(petId, eventType, eventId, VET_SIGNER())) === null;
      expect({ eventId, onCard, guardAllows }).toEqual({
        eventId,
        onCard: guardAllows,
        guardAllows,
      });
    }
  });
});

// RA-2 F2 — the signer tier the DB tests never wrote. A non-matriculated org
// member lands `org_registered`, which is strictly below the professional bar,
// so `isDeclarationSigned` was false FOREVER for them: the page said "Evento
// clinico firmado.", the pending card stayed, and every retry appended another
// permanent row to a legally-weighted health record.
describe("rejectIfAlreadySigned — the non-matriculated signer (org_registered)", () => {
  it("an org record does NOT clear the card — it is a record, not a signature", async () => {
    const pending = await fetchPendingDeclaredEvents(pet.orgRecorded);
    expect(pending.map((p) => p.id)).toEqual([ids.orgRecordedDeclaration]);
  });

  it("blocks the non-matriculated signer from recording the same act twice", async () => {
    const result = await rejectIfAlreadySigned(
      pet.orgRecorded,
      "microchip_implanted",
      ids.orgRecordedDeclaration,
      ORG_SIGNER(),
    );
    expect(result?.error).toMatch(/ya está registrado a nombre de la organización/i);
  });

  it("still lets a MATRICULATED vet sign on top of that org record — their tier adds the signature", async () => {
    await expect(
      rejectIfAlreadySigned(
        pet.orgRecorded,
        "microchip_implanted",
        ids.orgRecordedDeclaration,
        VET_SIGNER(),
      ),
    ).resolves.toBeNull();
  });

  it("lets the non-matriculated signer record an act nobody has recorded yet", async () => {
    await expect(
      rejectIfAlreadySigned(pet.pending, "microchip_implanted", ids.pendingChip, ORG_SIGNER()),
    ).resolves.toBeNull();
  });

  it("tells the non-matriculated signer the act is already SIGNED when a vet signed it", async () => {
    const result = await rejectIfAlreadySigned(
      pet.signed,
      "microchip_implanted",
      ids.signedChipDeclaration,
      ORG_SIGNER(),
    );
    expect(result?.error).toMatch(/ya fue firmado/i);
  });
});
