// Coverage guardrail for the libreta-sanitaria projection.
//
// Whenever EVENT_TYPES gains a new entry, the contributor MUST classify it as
// either part of the libreta (medical) or deliberately excluded (admin /
// custody / system). This test fails the build if a value falls through.

import { describe, expect, it } from "vitest";

import { EVENT_TYPES, type EventType } from "@/db/schema";
import {
  LIBRETA_FILTER_CHIPS,
  LIBRETA_SANITARIA_EVENT_TYPES,
  NON_LIBRETA_EVENT_TYPES,
  isLibretaSanitariaEvent,
} from "@/lib/libreta-sanitaria";

describe("LIBRETA_SANITARIA_EVENT_TYPES coverage", () => {
  it("every EVENT_TYPES entry is classified exactly once", () => {
    const libretaSet = new Set<string>(LIBRETA_SANITARIA_EVENT_TYPES);
    const nonLibretaSet = new Set<string>(NON_LIBRETA_EVENT_TYPES);
    const unclassified: string[] = [];
    const doubleClassified: string[] = [];

    for (const t of EVENT_TYPES) {
      const inLibreta = libretaSet.has(t);
      const inNonLibreta = nonLibretaSet.has(t);
      if (!inLibreta && !inNonLibreta) unclassified.push(t);
      if (inLibreta && inNonLibreta) doubleClassified.push(t);
    }

    expect(
      unclassified,
      "Unclassified event types — add to LIBRETA_SANITARIA_EVENT_TYPES or NON_LIBRETA_EVENT_TYPES",
    ).toEqual([]);
    expect(doubleClassified, "Event types appear in both lists").toEqual([]);
  });

  it("LIBRETA_FILTER_CHIPS only references libreta event types", () => {
    for (const chip of LIBRETA_FILTER_CHIPS) {
      expect(
        isLibretaSanitariaEvent(chip.type),
        `Chip ${chip.type} (${chip.label}) is not in LIBRETA_SANITARIA_EVENT_TYPES`,
      ).toBe(true);
    }
  });

  it("isLibretaSanitariaEvent returns the right answer for known types", () => {
    expect(isLibretaSanitariaEvent("vaccination_administered" satisfies EventType)).toBe(true);
    expect(isLibretaSanitariaEvent("pet_registered" satisfies EventType)).toBe(false);
    expect(isLibretaSanitariaEvent("credential_scanned" satisfies EventType)).toBe(false);
    expect(isLibretaSanitariaEvent("weight_recorded" satisfies EventType)).toBe(true);
  });
});
