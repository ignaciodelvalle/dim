import { describe, expect, it } from "vitest";

import { replayPetMicrochip } from "@/lib/projections/pet-microchip";
import type { ProjectionEvent } from "@/lib/projections/types";

// NOTE (WS-D provenance flag): replayPetMicrochip binds the microchip on the
// mere PRESENCE of a microchip_implanted event with a chip_number — it cannot
// check who authored it, because ProjectionEvent deliberately omits author_role.
// This is the H1-class "clears on presence" pattern; whether the chip fact
// should require professional/institutional provenance is a product decision
// (flagged for follow-up, not changed here).

function ev(
  eventType: string,
  payload: unknown,
  occurredAt = "2026-01-01T00:00:00Z",
): ProjectionEvent {
  return { id: `e-${occurredAt}`, eventType, occurredAt, recordedAt: occurredAt, payload };
}

const chip = (n: string, extra: Record<string, unknown> = {}, occurredAt?: string) =>
  ev("microchip_implanted", { chip_number: n, ...extra }, occurredAt);

describe("replayPetMicrochip", () => {
  it("returns EMPTY when there are no events", () => {
    expect(replayPetMicrochip([])).toEqual({
      microchipId: null,
      microchipCountryCode: null,
      microchipImplantedAt: null,
      microchipImplantedBy: null,
      microchipLocation: null,
    });
  });

  it("ignores non-microchip events", () => {
    expect(replayPetMicrochip([ev("weight_recorded", { kg: "10" })]).microchipId).toBeNull();
  });

  it("EARLIEST chip wins (a chip is a permanent implant)", () => {
    const events = [
      chip("111111111111111", {}, "2026-01-01T00:00:00Z"),
      chip("222222222222222", {}, "2026-02-01T00:00:00Z"),
    ];
    expect(replayPetMicrochip(events).microchipId).toBe("111111111111111");
  });

  it("skips a malformed chip event with no chip_number and uses the next", () => {
    const events = [
      ev("microchip_implanted", { chip_number: "" }, "2026-01-01T00:00:00Z"),
      chip("333333333333333", {}, "2026-02-01T00:00:00Z"),
    ];
    expect(replayPetMicrochip(events).microchipId).toBe("333333333333333");
  });

  it("surfaces implantedAt only when implant_date_known is true", () => {
    const known = chip("444444444444444", { implant_date_known: true }, "2026-03-04T00:00:00Z");
    expect(replayPetMicrochip([known]).microchipImplantedAt).toBe("2026-03-04");

    const unknown = chip("555555555555555", { implant_date_known: false });
    expect(replayPetMicrochip([unknown]).microchipImplantedAt).toBeNull();
  });

  it("maps country_code / implanted_by / location_on_body", () => {
    const e = chip("858000000000001", {
      country_code: "858",
      implanted_by: "Dr. Gómez",
      location_on_body: "cuello",
    });
    const p = replayPetMicrochip([e]);
    expect(p.microchipCountryCode).toBe("858");
    expect(p.microchipImplantedBy).toBe("Dr. Gómez");
    expect(p.microchipLocation).toBe("cuello");
  });
});
