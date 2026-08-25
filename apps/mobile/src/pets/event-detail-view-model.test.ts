import type { EventAttachmentV1, EventFactV1 } from "@dim/contract/api";
import { describe, expect, it } from "@jest/globals";

import {
  ATTACHMENT_UNAVAILABLE_LABEL,
  amendmentChangeLine,
  amendmentHeadline,
  attachmentExpired,
  attachmentExpiryLabel,
  authorLine,
  buildAmendChanges,
  initialAmendEdits,
} from "./event-detail-view-model";

const NOW = new Date("2026-08-25T15:00:00Z");

function fact(field: string, label: string, value: string): EventFactV1 {
  return { field, label, value };
}

function attachment(overrides: Partial<EventAttachmentV1> = {}): EventAttachmentV1 {
  return {
    attachmentId: "att-1",
    kind: "image",
    mimeType: "image/jpeg",
    url: "https://storage.example/x?sig=Y",
    expiresAt: "2026-08-25T15:15:00Z",
    ...overrides,
  };
}

describe("authorLine — a role, an organization, never a person", () => {
  it("names the organization when the record has one", () => {
    expect(
      authorLine({ roleLabel: "Veterinario/a", verified: true, orgDisplayName: "Vet Palermo" }),
    ).toBe("Veterinario/a · Vet Palermo · firma verificada");
  });

  it("marks verification only when it happened", () => {
    // Naming a vet is a CLAIM; only their signature is verification, and the two
    // must read as unmistakably different.
    expect(authorLine({ roleLabel: "Dueño/a", verified: false, orgDisplayName: null })).toBe(
      "Dueño/a",
    );
  });
});

describe("amendmentChangeLine — replaced, added and cleared are three facts", () => {
  it("reads a replacement as a replacement", () => {
    expect(amendmentChangeLine({ label: "Vacuna", from: "Antirabica", to: "Antirrábica" })).toBe(
      "Vacuna: «Antirabica» → «Antirrábica»",
    );
  });

  it("reads a field that had no value as ADDED, not as replaced by nothing", () => {
    expect(amendmentChangeLine({ label: "Lote", from: null, to: "L-42" })).toBe(
      "Lote: se agregó «L-42»",
    );
  });

  it("reads a cleared field as CLEARED, not as «L-42» → «»", () => {
    // "Lote: «L-42» → «»" reads as a typo. This reads as what happened.
    expect(amendmentChangeLine({ label: "Lote", from: "L-42", to: null })).toBe(
      "Lote: se borró «L-42»",
    );
  });

  it("dates a step in the Argentine calendar and names who made it", () => {
    expect(
      amendmentHeadline({
        amendmentId: "a1",
        occurredAt: "2026-08-23T01:00:00Z",
        reason: null,
        actorRoleLabel: "Dueño/a",
        changes: [],
      }),
    ).toBe("22/08/2026 · Dueño/a");
  });
});

describe("attachment expiry — the link genuinely stops working, so the screen says when", () => {
  it("prints the clock time the link dies", () => {
    // 15:15 UTC is 12:15 in Buenos Aires — pinned, like every other date here.
    expect(attachmentExpiryLabel("2026-08-25T15:15:00Z", NOW)).toBe("El enlace vence a las 12:15");
  });

  it("says the link is gone and points at the fix once it is past", () => {
    expect(attachmentExpiryLabel("2026-08-25T14:59:00Z", NOW)).toBe(
      "El enlace venció. Actualizá para volver a verlo.",
    );
  });

  it("treats an absent expiry as an absent link, not as a link without a deadline", () => {
    expect(attachmentExpiryLabel(null, NOW)).toBe(ATTACHMENT_UNAVAILABLE_LABEL);
  });

  it("counts a link expired at the exact instant it expires", () => {
    // The boundary belongs to the dead side: offering a URL at the moment the
    // signature stops being valid is a guaranteed broken image.
    expect(attachmentExpired(attachment({ expiresAt: NOW.toISOString() }), NOW)).toBe(true);
    expect(attachmentExpired(attachment(), NOW)).toBe(false);
  });

  it("treats a file the server could not sign as expired, so nothing is offered", () => {
    expect(attachmentExpired(attachment({ url: null, expiresAt: null }), NOW)).toBe(true);
  });
});

describe("buildAmendChanges — a correction names what CHANGED", () => {
  const facts = [
    fact("vaccine_name", "Vacuna", "Antirrábica"),
    fact("brand", "Marca", "Nobivac"),
    fact("batch", "Lote", "L-42"),
  ];

  it("starts from the record's own values", () => {
    expect(initialAmendEdits(facts)).toEqual({
      vaccine_name: "Antirrábica",
      brand: "Nobivac",
      batch: "L-42",
    });
  });

  it("sends nothing when nothing moved", () => {
    expect(buildAmendChanges(facts, initialAmendEdits(facts))).toEqual([]);
  });

  it("sends ONLY the fields that moved", () => {
    // Submitting every field would write "Lote: «L-42» → «L-42»" into a history
    // somebody reads and make the real change impossible to find.
    const edits = { ...initialAmendEdits(facts), batch: "L-99" };
    expect(buildAmendChanges(facts, edits)).toEqual([{ field: "batch", value: "L-99" }]);
  });

  it("ignores whitespace a keyboard added", () => {
    const edits = { ...initialAmendEdits(facts), brand: "  Nobivac  " };
    expect(buildAmendChanges(facts, edits)).toEqual([]);
  });

  it("sends NULL for an emptied field, never an empty string", () => {
    // `null` clears the field; "" would store a blank value that later reads as
    // something somebody typed.
    const edits = { ...initialAmendEdits(facts), batch: "   " };
    expect(buildAmendChanges(facts, edits)).toEqual([{ field: "batch", value: null }]);
  });

  it("can only name fields the curated projection already renders", () => {
    // The form is built from `facts`, so a key the whitelist never emitted —
    // a hash, an internal id — has no input and cannot become a change.
    const edits = { ...initialAmendEdits(facts), firma_hash: "tampered" };
    expect(buildAmendChanges(facts, edits).map((c) => c.field)).toEqual([]);
  });
});
