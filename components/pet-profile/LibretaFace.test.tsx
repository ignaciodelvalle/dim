// Tests for <LibretaFace> — pet profile two-face redesign (Face 2, 2026-07-01).
//
// Covers the H3 negative case end-to-end through the real component tree
// (LibretaFace → EventTimelineList → eventPayloadDetails): raw/blacklisted
// payload keys (hashes, internal ids, matched_chip_number) must never reach
// the DOM, even when present on the event payload. The whitelist function
// itself is exhaustively unit-tested in __tests__/event-payload-details.test.ts;
// this closes the remaining gap of asserting the guarantee holds once wired
// into the Libreta face lens/row rendering (task 5.5). Render via
// react-dom/server (same pattern as PetAlertStrip.test.tsx / CredentialFace.test.tsx).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  HistorialEventRow,
  LibretaFaceData,
} from "@/src/modules/pets/application/tab-data/types";
import { LibretaFace } from "./LibretaFace";

const SECRET_HASH = "SECRET_FIRMA_HASH_9f2c";
const SECRET_CHIP = "SECRET_MATCHED_CHIP_777";
const SECRET_INTERNAL_ID = "SECRET_INTERNAL_ROW_ID";

function pastEvent(overrides: Partial<HistorialEventRow> = {}): HistorialEventRow {
  return {
    id: "evt-1",
    petId: "pet-1",
    eventType: "sterilization_performed",
    // Payload mixes whitelisted fields (procedure/performed_by/clinic) with
    // fields that must NEVER be surfaced (hash, internal id, matched chip).
    payload: {
      procedure: "castration",
      performed_by: "Dr. Perez",
      clinic: "Vet Palermo",
      firma_hash: SECRET_HASH,
      matched_chip_number: SECRET_CHIP,
      internal_ref_id: SECRET_INTERNAL_ID,
    },
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    notes: null,
    authorRole: "vet",
    authorVerified: true,
    authorOrganizationId: null,
    attachmentUrl: null,
    amendedAt: null,
    ...overrides,
  };
}

function faceData(overrides: Partial<LibretaFaceData> = {}): LibretaFaceData {
  return {
    identity: {
      name: "Firulais",
      species: "dog",
      breed: "Mestizo",
      sex: "male",
      microchipId: null,
      tattooCode: null,
      tattooLocation: null,
      publicToken: "abc",
    },
    future: [],
    past: [pastEvent()],
    summary: { active: 0, dueSoon: 0, expired: 0, missing: 0, otherCount: 0, perVaccine: [] },
    weightSamples: [],
    activeShares: [],
    accessPath: "owner",
    ...overrides,
  };
}

describe("LibretaFace — H3 curated detail (negative case, end-to-end)", () => {
  it("never renders raw/blacklisted payload keys under the todo lens", () => {
    const html = renderToStaticMarkup(
      <LibretaFace data={faceData()} petPublicToken="abc" initialLens="todo" isOwner />,
    );

    // Whitelisted fields DO render — proves the row isn't just empty.
    expect(html).toContain("Dr. Perez");
    expect(html).toContain("Vet Palermo");

    // Blacklisted fields must never reach the DOM.
    expect(html).not.toContain(SECRET_HASH);
    expect(html).not.toContain(SECRET_CHIP);
    expect(html).not.toContain(SECRET_INTERNAL_ID);
    expect(html).not.toContain("firma_hash");
    expect(html).not.toContain("matched_chip_number");
    expect(html).not.toContain("internal_ref_id");
  });
});
