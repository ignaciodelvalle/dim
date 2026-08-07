// Unit tests for the SHARED rabies numerator predicates (lib/metrics/rabies.ts).
//
// These assert on the GENERATED SQL shape (no DB) — the same PgDialect().sqlToQuery
// pattern scope.test.ts uses — so they are fast and pure. The point they pin:
// the "solo firmado por matrícula" narrowing (task #78 Part 3) is defined in ONE
// place (rabiesSignedByMatriculaCondition) and the EXISTS numerator only carries
// the vet-signed clause when signedOnly is set — so a self-reported dose is
// counted by default but NOT under the toggle.

import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { pets } from "@/db";
import { rabiesSignedByMatriculaCondition, rabiesVaccinatedExists } from "@/lib/metrics/rabies";

function render(clause: ReturnType<typeof sql>) {
  return new PgDialect().sqlToQuery(clause);
}

const WINDOW = {
  since: new Date("2025-07-08T00:00:00.000Z"),
  until: new Date("2026-07-08T00:00:00.000Z"),
};

describe("rabiesSignedByMatriculaCondition — the single vet-signed definition", () => {
  it("emits author_role = 'vet' AND author_verified = true over the given refs", () => {
    const { sql: text } = render(
      rabiesSignedByMatriculaCondition(
        sql`${pets.jurisdictionProvince}`, // stand-in refs — we only inspect the operator shape
        sql`${pets.jurisdictionLocality}`,
      ),
    );
    expect(text).toContain("= 'vet'");
    expect(text).toContain("= true");
    expect(text.toLowerCase()).toContain(" and ");
  });
});

describe("rabiesVaccinatedExists — optional vet-signed narrowing", () => {
  it("does NOT constrain author role/verification by default (every recorded dose counts)", () => {
    const { sql: text } = render(rabiesVaccinatedExists(sql`${pets.id}`, WINDOW));
    expect(text).toContain("event_type = 'vaccination_administered'");
    expect(text).not.toContain("author_role");
    expect(text).not.toContain("author_verified");
  });

  it("adds the shared vet-signed clause (aliased to pe_rabies) under signedOnly", () => {
    const { sql: text } = render(
      rabiesVaccinatedExists(sql`${pets.id}`, WINDOW, { signedOnly: true }),
    );
    // The numerator still requires a rabies vaccination event...
    expect(text).toContain("event_type = 'vaccination_administered'");
    // ...AND now the vet-signed clause, aliased to the EXISTS subquery table.
    expect(text).toContain("pe_rabies.author_role = 'vet'");
    expect(text).toContain("pe_rabies.author_verified = true");
  });
});
