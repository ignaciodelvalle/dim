// Unit tests for the achievements POC catalog
// (spec 2026-05-19-pet-profile-v2-design §5).
//
// All achievements are pure functions of (pet, events, serviceDog, cases).
// We don't touch the DB — fixtures are plain objects.

import { describe, expect, it } from "vitest";

import type { Case, Pet, PetEvent, PetServiceDog } from "@/db";
import {
  ACHIEVEMENTS_CATALOG,
  getEarnedAchievements,
  getNotYetComputableAchievements,
} from "@/lib/achievements/catalog";

function makePet(overrides: Partial<Pet> = {}): Pet {
  // Minimal pet stub — the catalog only reads a handful of fields. Cast
  // through `as unknown as Pet` to avoid having to fill every nullable
  // column in the type definition.
  return {
    id: "pet-1",
    name: "Test",
    species: "dog",
    sex: "unknown",
    publicToken: "DIM-TEST-1",
    status: "active",
    ...overrides,
  } as unknown as Pet;
}

function makeServiceDog(overrides: Partial<PetServiceDog> = {}): PetServiceDog {
  return {
    id: "sd-1",
    petId: "pet-1",
    credentialStatus: "vigente",
    credentialIssueDate: "2024-06-01",
    inService: true,
    publicVisibility: "private_only",
    createdAt: new Date("2024-06-01"),
    updatedAt: new Date("2024-06-01"),
    ...overrides,
  } as unknown as PetServiceDog;
}

function makeEvent(
  eventType: string,
  payload: Record<string, unknown>,
  occurredAt: string,
): PetEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    petId: "pet-1",
    eventType,
    occurredAt: new Date(occurredAt),
    recordedAt: new Date(occurredAt),
    authorRole: "owner",
    payload,
  } as unknown as PetEvent;
}

const EMPTY_CASES: Case[] = [];

describe("serviceDog achievement (A1)", () => {
  it("not_yet without a service-dog row", () => {
    const earned = getEarnedAchievements({
      pet: makePet(),
      events: [],
      serviceDog: null,
      cases: EMPTY_CASES,
    });
    expect(earned.find((a) => a.id === "service_dog")).toBeUndefined();
  });

  it("not_yet when credentialStatus is pendiente_verificacion", () => {
    const earned = getEarnedAchievements({
      pet: makePet(),
      events: [],
      serviceDog: makeServiceDog({ credentialStatus: "pendiente_verificacion" }),
      cases: EMPTY_CASES,
    });
    expect(earned.find((a) => a.id === "service_dog")).toBeUndefined();
  });

  it("earned when credentialStatus is vigente", () => {
    const earned = getEarnedAchievements({
      pet: makePet(),
      events: [],
      serviceDog: makeServiceDog({ credentialStatus: "vigente" }),
      cases: EMPTY_CASES,
    });
    const a = earned.find((x) => x.id === "service_dog");
    expect(a).toBeDefined();
    expect(a?.earnedAt).toBeInstanceOf(Date);
  });
});

describe("iWasAdopted achievement (A2)", () => {
  it("not_yet without adoption_finalized events", () => {
    const earned = getEarnedAchievements({
      pet: makePet(),
      events: [],
      serviceDog: null,
      cases: EMPTY_CASES,
    });
    expect(earned.find((a) => a.id === "i_was_adopted")).toBeUndefined();
  });

  it("earned with a single adoption_finalized event (no count)", () => {
    const earned = getEarnedAchievements({
      pet: makePet(),
      events: [makeEvent("adoption_finalized", {}, "2025-01-15")],
      serviceDog: null,
      cases: EMPTY_CASES,
    });
    const a = earned.find((x) => x.id === "i_was_adopted");
    expect(a).toBeDefined();
    expect(a?.count).toBeUndefined();
  });

  it("earned with count=2 when two adoption_finalized events exist", () => {
    const earned = getEarnedAchievements({
      pet: makePet(),
      events: [
        makeEvent("adoption_finalized", {}, "2024-01-01"),
        makeEvent("adoption_finalized", {}, "2025-06-01"),
      ],
      serviceDog: null,
      cases: EMPTY_CASES,
    });
    const a = earned.find((x) => x.id === "i_was_adopted");
    expect(a?.count).toBe(2);
  });
});

describe("lostAndFound achievement (A3)", () => {
  it("not_yet without status_changed events", () => {
    const earned = getEarnedAchievements({
      pet: makePet(),
      events: [],
      serviceDog: null,
      cases: EMPTY_CASES,
    });
    expect(earned.find((a) => a.id === "lost_and_found")).toBeUndefined();
  });

  it("not_yet with only lost (no return to active)", () => {
    const earned = getEarnedAchievements({
      pet: makePet(),
      events: [
        makeEvent("status_changed", { from_status: "active", to_status: "lost" }, "2025-01-10"),
      ],
      serviceDog: null,
      cases: EMPTY_CASES,
    });
    expect(earned.find((a) => a.id === "lost_and_found")).toBeUndefined();
  });

  it("earned with one full lost→active pair", () => {
    const earned = getEarnedAchievements({
      pet: makePet(),
      events: [
        makeEvent("status_changed", { from_status: "active", to_status: "lost" }, "2025-01-10"),
        makeEvent("status_changed", { from_status: "lost", to_status: "active" }, "2025-01-12"),
      ],
      serviceDog: null,
      cases: EMPTY_CASES,
    });
    const a = earned.find((x) => x.id === "lost_and_found");
    expect(a).toBeDefined();
    expect(a?.count).toBeUndefined();
  });

  it("earned with count=3 with three pairs", () => {
    const events: PetEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(
        makeEvent(
          "status_changed",
          { from_status: "active", to_status: "lost" },
          `2025-0${i + 1}-10`,
        ),
        makeEvent(
          "status_changed",
          { from_status: "lost", to_status: "active" },
          `2025-0${i + 1}-12`,
        ),
      );
    }
    const earned = getEarnedAchievements({
      pet: makePet(),
      events,
      serviceDog: null,
      cases: EMPTY_CASES,
    });
    const a = earned.find((x) => x.id === "lost_and_found");
    expect(a?.count).toBe(3);
  });
});

describe("globetrotter (A5) — not_yet_computable", () => {
  // A4 (i_had_litter) moved to computable when the pregnancy-tracking
  // feature landed; it now resolves to 'not_yet' with zero events.
  it("globetrotter surfaces in getNotYetComputableAchievements", () => {
    const notYet = getNotYetComputableAchievements({
      pet: makePet(),
      events: [],
      serviceDog: null,
      cases: EMPTY_CASES,
    });
    const ids = notYet.map((n) => n.id).sort();
    expect(ids).toContain("globetrotter");
    expect(ids).not.toContain("i_had_litter");
    for (const a of notYet) {
      expect(typeof a.missing).toBe("string");
      expect(a.missing.length).toBeGreaterThan(0);
    }
  });
});

describe("catalog invariants", () => {
  it("all defs declare unique ids", () => {
    const ids = ACHIEVEMENTS_CATALOG.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all defs declare non-empty label, icon, description", () => {
    for (const def of ACHIEVEMENTS_CATALOG) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.icon.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });
});
