// `buildOwnerPetDetailV1` — the owner face's wire projection.
//
// WHAT THIS FILE EXISTS FOR
// ---------------------------------------------------------------------------
// The carousel section is documented, in the contract, as "the owner's OTHER
// live pets" — and it was shipping the pet being read. The web does not notice,
// because the same list is its swipe SWITCHER and needs the current animal in
// it. A client does: the native face filtered `items` for rendering and then
// branched and counted on the unfiltered array, so a one-pet owner got a "Tus
// otras mascotas" card containing nothing at all, and a nine-pet owner read
// "Mostrando 8 de 9" above seven rows.
//
// Both halves are pinned here, and the second is the one a reviewer should look
// at hardest: excluding the animal from `items` while leaving it inside `total`
// swaps one wrong number for another.
//
// The `OwnerPetDetail` fixture names exactly the fields this projection reads
// and is cast at the boundary. That is honest for a PURE projection — the
// domain read has its own 22 tests over injected deps
// (`load-owner-pet-detail.test.ts`) — and it would not be honest for anything
// that branched on a field the fixture omits.

import { describe, expect, it } from "vitest";

import { buildOwnerPetDetailV1 } from "@/app/api/v1/pets/[publicToken]/payload";
import type { OwnerPetDetail } from "@/src/modules/pets/application/read/load-owner-pet-detail";

const NOW = new Date("2026-08-25T12:00:00Z");
const SELF = "DIM-PAMP-0001";

function carouselItem(token: string) {
  return { token, name: `pet-${token}`, photoUrl: null, status: "active" };
}

function detailStub(carousel: {
  items: Array<{ token: string; name: string; photoUrl: string | null; status: string }>;
  total: number;
  truncated: boolean;
}): OwnerPetDetail {
  return {
    ownershipRole: "owner",
    isTransit: false,
    isDeceased: false,
    identity: {
      name: "Pampa",
      species: "dog",
      sex: "female",
      breed: null,
      breedLine: "Perra",
      photoUrl: null,
      jurisdictionProvince: null,
      jurisdictionLocality: null,
      tags: [],
    },
    memorial: null,
    ringStatus: "al-dia",
    situation: null,
    chromeSituation: null,
    compliance: { cards: [], summary: "", worstTone: "ok", worstIsUnknown: false },
    alerts: [],
    reminders: [],
    pregnancy: null,
    cases: { openCount: 0, truncated: false },
    carousel,
    caretakerState: null,
    caretakerConsentName: null,
    rehomeState: null,
    observationOpenedByOrgName: null,
  } as unknown as OwnerPetDetail;
}

function build(input: {
  petStatus?: string;
  accessPath?: "owner" | "org";
  carousel: Parameters<typeof detailStub>[0];
}) {
  return buildOwnerPetDetailV1({
    publicToken: SELF,
    petStatus: input.petStatus ?? "active",
    pregnancyStatus: null,
    accessPath: input.accessPath ?? "owner",
    detail: detailStub(input.carousel),
    now: NOW,
  });
}

describe("buildOwnerPetDetailV1 — the carousel is the owner's OTHER pets", () => {
  it("drops the animal being read from the list", () => {
    const payload = build({
      carousel: {
        items: [carouselItem(SELF), carouselItem("DIM-FIRU-0002")],
        total: 2,
        truncated: false,
      },
    });
    const section = payload.carousel;
    if (section.status !== "ok") throw new Error("carousel section must be ok");
    expect(section.data.items.map((p) => p.publicToken)).toEqual(["DIM-FIRU-0002"]);
  });

  it("drops it from the COUNT too, so the truncation note cannot lie", () => {
    // Nine live pets, eight returned by the cap, one of the eight is this
    // animal. Seven render; the honest sentence is "mostrando 7 de 8", NOT
    // "7 de 9" (self still counted) and not "8 de 9" (the old bug's numbers).
    const tokens = ["DIM-A", "DIM-B", "DIM-C", "DIM-D", "DIM-E", "DIM-F", "DIM-G"];
    const payload = build({
      carousel: {
        items: [carouselItem(SELF), ...tokens.map(carouselItem)],
        total: 9,
        truncated: true,
      },
    });
    const section = payload.carousel;
    if (section.status !== "ok") throw new Error("carousel section must be ok");
    expect(section.data.items).toHaveLength(7);
    expect(section.data.total).toBe(8);
  });

  it("subtracts even when the cap pushed this animal out of the returned items", () => {
    // THE CASE A `items.includes(self)` TEST WOULD GET WRONG. The ranking caps
    // at 8 over EVERY live pet, so an animal that ranks ninth is absent from
    // `items` and still counted in `total`. Deriving the subtraction from the
    // returned page would leave the total one too high on exactly the
    // households big enough to notice.
    const payload = build({
      carousel: { items: [carouselItem("DIM-A")], total: 9, truncated: true },
    });
    const section = payload.carousel;
    if (section.status !== "ok") throw new Error("carousel section must be ok");
    expect(section.data.total).toBe(8);
  });

  it("does NOT subtract for a deceased animal, which was never in the count", () => {
    // `fetchLivePetsForCarouselRanking` excludes `status = 'deceased'`, so a
    // deceased pet's own libreta must not report one fewer sibling than the
    // owner has.
    const payload = build({
      petStatus: "deceased",
      carousel: { items: [carouselItem("DIM-A")], total: 1, truncated: false },
    });
    const section = payload.carousel;
    if (section.status !== "ok") throw new Error("carousel section must be ok");
    expect(section.data.total).toBe(1);
  });

  it("does NOT subtract on the ORG path, which gets no carousel at all", () => {
    const payload = build({
      accessPath: "org",
      carousel: { items: [], total: 0, truncated: false },
    });
    const section = payload.carousel;
    if (section.status !== "ok") throw new Error("carousel section must be ok");
    expect(section.data.total).toBe(0);
  });
});
