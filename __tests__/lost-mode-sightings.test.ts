// P0c integration tests — sightingsCount + unified feed for lost_pet_episode.
//
// Pure Zod unit tests for the noteAdded schema live in
// __tests__/lost-mode-sightings-unit.test.ts.
//
// This file covers DB-dependent tests only:
//   - Create a pet + open episode + insert sighting notes, assert
//     sightingsCount === 3 and that the unified feed contains both scan and
//     sighting kinds.

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cases, db, petEvents, pets } from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";
import { openCase } from "@/lib/case-helpers";
import { fetchLostEpisodeForPet, fetchLostScanEvents } from "@/lib/lost-mode";
import { withMutationOverride } from "./_helpers/db-overrides";

// ---------------------------------------------------------------------------
// Integration tests — real COUNT + feed queries
// ---------------------------------------------------------------------------

const PET_TOKEN = "DIM-P0C-SIGHTING-1";

let petId: string;
let caseId: string;
let episodeOpenedAt: Date;

beforeAll(async () => {
  // Clean up any leftover fixture rows.
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`DELETE FROM pet_events WHERE pet_id IN (
      SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
    )`);
    await tx.execute(sql`DELETE FROM cases WHERE primary_pet_id IN (
      SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
    )`);
    await tx.execute(sql`DELETE FROM pets WHERE public_token = ${PET_TOKEN}`);
  });

  // Create the pet.
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN,
      name: "SightingTestDog",
      species: "dog",
      sex: "unknown",
      status: "lost",
      potentiallyDangerousBreed: false,
    })
    .returning();
  petId = pet.id;

  episodeOpenedAt = new Date();

  // Open a lost_pet_episode case + insert the originating status_changed event.
  await db.transaction(async (tx) => {
    const caseRow = await openCase(
      {
        kind: "lost_pet_episode",
        primarySubjectKind: "registered_pet",
        primaryPetId: petId,
        openedReason: "P0c sighting test fixture",
      },
      tx,
    );
    caseId = caseRow.id;

    const statusPayload = validateEventPayload("status_changed", {
      from_status: "active",
      to_status: "lost",
      location_description: null,
      reason: null,
      disclosure_prefs_snapshot: {
        first_name: true,
        phone: false,
        email: false,
        last_location: true,
        finder_form: true,
      },
    });
    await tx.insert(petEvents).values({
      petId,
      eventType: "status_changed",
      occurredAt: episodeOpenedAt,
      recordedAt: episodeOpenedAt,
      authorRole: "owner",
      payload: statusPayload,
      caseId: caseRow.id,
    });
  });

  // Insert 3 sighting note_added events AFTER episodeOpenedAt.
  const sightingBase = {
    petId,
    eventType: "note_added" as const,
    recordedAt: new Date(),
    authorRole: "scanner" as const,
    authorVerified: false,
    recordedByUserId: null,
  };

  for (let i = 0; i < 3; i++) {
    const sightingPayload = validateEventPayload("note_added", {
      category: "otro" as const,
      text: `Vi al perro cerca del parque. Avistaje ${i + 1}.`,
      kind: "sighting" as const,
    });
    await db.insert(petEvents).values({
      ...sightingBase,
      occurredAt: new Date(episodeOpenedAt.getTime() + (i + 1) * 60_000),
      payload: sightingPayload,
      locationLat: "-34.900" as unknown as null, // numeric column accepts string
      locationLng: "-57.950" as unknown as null,
    });
  }

  // Insert 1 credential_scanned event (non-self) after episode opened.
  const scanPayload = validateEventPayload("credential_scanned", {
    is_self_scan: false,
    viewer_authenticated: false,
  });
  await db.insert(petEvents).values({
    petId,
    eventType: "credential_scanned",
    occurredAt: new Date(episodeOpenedAt.getTime() + 5 * 60_000),
    recordedAt: new Date(),
    authorRole: "scanner",
    payload: scanPayload,
  });
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`DELETE FROM pet_events WHERE pet_id = ${petId}`);
    if (caseId) {
      await tx.execute(sql`DELETE FROM cases WHERE id = ${caseId}`);
    }
    await tx.execute(sql`DELETE FROM pets WHERE id = ${petId}`);
  });
});

describe("fetchLostEpisodeForPet — sightingsCount", () => {
  it("returns sightingsCount === 3 for 3 sighting note_added events after episode open", async () => {
    const episode = await fetchLostEpisodeForPet(petId);
    expect(episode).not.toBeNull();
    expect(episode!.sightingsCount).toBe(3);
  });
});

describe("fetchLostScanEvents — unified feed", () => {
  it("returns items of both 'scan' and 'sighting' kinds when both exist", async () => {
    const items = await fetchLostScanEvents(petId, episodeOpenedAt);
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain("scan");
    expect(kinds).toContain("sighting");
  });

  it("returns exactly 3 sighting items", async () => {
    const items = await fetchLostScanEvents(petId, episodeOpenedAt);
    const sightings = items.filter((i) => i.kind === "sighting");
    expect(sightings).toHaveLength(3);
  });

  it("returns exactly 1 scan item", async () => {
    const items = await fetchLostScanEvents(petId, episodeOpenedAt);
    const scans = items.filter((i) => i.kind === "scan");
    expect(scans).toHaveLength(1);
  });

  it("items are sorted DESC by at", async () => {
    const items = await fetchLostScanEvents(petId, episodeOpenedAt);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].at.getTime()).toBeGreaterThanOrEqual(items[i].at.getTime());
    }
  });
});
