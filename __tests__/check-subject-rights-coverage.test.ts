// Unit tests for the subject-rights coverage fence (pnpm lint:subject-rights).
//
// The fence's whole value is that it fails. A classification file that only
// ever prints a green line is indistinguishable from one whose checks are
// vacuous — this repo has been bitten by exactly that (the content-report
// exemption list said "four" while the code had twelve), so the four checks are
// each shown FIRING here, against lists derived from the fence itself rather
// than retyped. If these lists are ever copied into this file instead of
// imported, the test stops testing the fence and starts testing a snapshot.

import { describe, expect, it } from "vitest";

import {
  EXEMPT,
  IN_ERASE,
  IN_EXPORT,
  KNOWN_GAP,
  bodyMentions,
  evaluate,
} from "@/scripts/check-subject-rights-coverage";

/** Every table the fence declares, derived — never a second copy of the set. */
const ALL_DECLARED: string[] = [
  ...new Set([...IN_EXPORT, ...IN_ERASE, ...Object.keys(EXEMPT), ...Object.keys(KNOWN_GAP)]),
];

/** A synthetic function body naming exactly the tables it is handed. */
function bodyNaming(tables: readonly string[]): string {
  return tables.map((t) => `SELECT 1 FROM public.${t} WHERE x = 1;`).join("\n");
}

const FULL_EXPORT_BODY = bodyNaming(IN_EXPORT);
const FULL_ERASE_BODY = bodyNaming(IN_ERASE);

describe("bodyMentions", () => {
  it("matches a schema-qualified reference and not a bare or partial one", () => {
    expect(bodyMentions("FROM public.pet_events ev", "pet_events")).toBe(true);
    // Unqualified: both RPCs schema-qualify, and a bare word would collide with
    // a column, an alias or a comment.
    expect(bodyMentions("FROM pet_events ev", "pet_events")).toBe(false);
    // A longer table name must not satisfy a shorter one's check.
    expect(bodyMentions("FROM public.pet_events_archive a", "pet_events")).toBe(false);
    expect(bodyMentions("FROM public.pet_caretaker_grants g", "pet_tags")).toBe(false);
  });
});

describe("evaluate — the declared lists agree with themselves", () => {
  it("passes when every declared table is live and both bodies name what they claim", () => {
    const { violations } = evaluate(ALL_DECLARED, FULL_EXPORT_BODY, FULL_ERASE_BODY);
    expect(violations).toEqual([]);
  });

  it("no table is in both a covered list and an uncovered one", () => {
    const uncovered = new Set([...Object.keys(EXEMPT), ...Object.keys(KNOWN_GAP)]);
    for (const t of [...IN_EXPORT, ...IN_ERASE]) {
      expect(uncovered.has(t)).toBe(false);
    }
  });

  it("no table is both EXEMPT and KNOWN_GAP", () => {
    for (const t of Object.keys(EXEMPT)) {
      expect(Object.hasOwn(KNOWN_GAP, t)).toBe(false);
    }
  });

  it("every EXEMPT and KNOWN_GAP entry carries a written reason", () => {
    for (const [table, reason] of [...Object.entries(EXEMPT), ...Object.entries(KNOWN_GAP)]) {
      expect(reason.trim().length, `${table} has an empty reason`).toBeGreaterThan(20);
    }
  });
});

describe("evaluate — each check actually fires", () => {
  it("CHECK 1: a new public table in no list is a violation", () => {
    const { violations } = evaluate(
      [...ALL_DECLARED, "some_new_pii_table"],
      FULL_EXPORT_BODY,
      FULL_ERASE_BODY,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe("unclassified");
    expect(violations[0].message).toContain("some_new_pii_table");
  });

  it("CHECK 2: a declared table that no longer exists is a violation", () => {
    const withoutOne = ALL_DECLARED.filter((t) => t !== "foster_volunteers");
    const { violations } = evaluate(withoutOne, FULL_EXPORT_BODY, FULL_ERASE_BODY);
    // Listed in both IN_EXPORT and IN_ERASE, so it is stale in both.
    expect(violations.every((v) => v.kind === "stale")).toBe(true);
    expect(violations).toHaveLength(2);
  });

  it("CHECK 3 (forward): a declared table missing from the LIVE body is a violation", () => {
    // The regression this exists for: a future CREATE OR REPLACE that drops a
    // section. The declaration still says the table is covered; the database
    // says otherwise, and the database wins.
    const bodyWithoutGrants = bodyNaming(IN_EXPORT.filter((t) => t !== "pet_caretaker_grants"));
    const { violations } = evaluate(ALL_DECLARED, bodyWithoutGrants, FULL_ERASE_BODY);
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe("missing_from_function");
    expect(violations[0].message).toContain("pet_caretaker_grants");
    expect(violations[0].message).toContain("export_subject_data");
  });

  it("CHECK 4 (reverse): a KNOWN_GAP table the body DOES name is a violation", () => {
    // Closing a gap is a one-way door: you cannot add a table to a function and
    // leave it sitting in the debt register, where it would still be counted as
    // outstanding work and reported as such on every run.
    const gapTable = Object.keys(KNOWN_GAP)[0];
    const { violations } = evaluate(
      ALL_DECLARED,
      `${FULL_EXPORT_BODY}\nSELECT 1 FROM public.${gapTable};`,
      FULL_ERASE_BODY,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe("covered_but_listed_uncovered");
    expect(violations[0].message).toContain(gapTable);
  });

  it("CHECK 4 (reverse) fires for EXEMPT too, and names that list", () => {
    const { violations } = evaluate(
      ALL_DECLARED,
      FULL_EXPORT_BODY,
      `${FULL_ERASE_BODY}\nUPDATE public.attachments SET caption = NULL;`,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("EXEMPT");
    expect(violations[0].message).toContain("erase_subject_data");
  });
});

describe("the debt register is not empty, says so, and may not grow quietly", () => {
  it("reports the KNOWN_GAP count, so shrinking it is measurable", () => {
    const { gapCount } = evaluate(ALL_DECLARED, FULL_EXPORT_BODY, FULL_ERASE_BODY);
    expect(gapCount).toBe(Object.keys(KNOWN_GAP).length);
    // Not an assertion about the NUMBER — that should fall over time. It is an
    // assertion that the channel carries a real value: a gapCount hard-wired to
    // zero would read as "no debt" on a run that never looked.
    expect(gapCount).toBeGreaterThan(0);
  });

  // THE RATCHET. Without it, "we know about these 21" degrades into 40 one
  // reviewed diff at a time: KNOWN_GAP is the one escape hatch in the fence, and
  // an escape hatch with no ceiling is just a slower way of not having a fence.
  // A new PII table must be added to a subject-rights RPC, or land here with the
  // ceiling raised BY HAND in the same commit — which is the moment somebody has
  // to justify it in a diff instead of appending a line.
  // 0207 moved libreta_share_tokens out of the register (erase now revokes
  // the subject's outstanding shares), so the ceiling ratchets 21 -> 20.
  // 0208 moved out operator_feed_watermarks (deleted), physical_tag_interest
  // (deleted) and organization_invitations (email sentinelled + outstanding
  // invitations revoked; the actor FKs and accepted rows kept as the access
  // trail), so it ratchets 20 -> 17.
  const KNOWN_GAP_CEILING = 17;

  it("does not grow past the declared ceiling without someone raising it on purpose", () => {
    expect(
      Object.keys(KNOWN_GAP).length,
      `KNOWN_GAP grew past ${KNOWN_GAP_CEILING}. Reach the table from export_subject_data / erase_subject_data instead — or raise KNOWN_GAP_CEILING in this test, in the same commit, with the reason in the commit body.`,
    ).toBeLessThanOrEqual(KNOWN_GAP_CEILING);
  });

  it("ratchets DOWN: closing a gap must lower the ceiling, so it cannot be re-spent", () => {
    // The other half, and the one that makes this a ratchet rather than a cap.
    // Without it, closing five gaps would leave five free slots for the next
    // five tables to occupy silently.
    expect(
      Object.keys(KNOWN_GAP).length,
      `KNOWN_GAP shrank below ${KNOWN_GAP_CEILING} — good. Lower KNOWN_GAP_CEILING to match, so the slots you just freed cannot be silently refilled.`,
    ).toBeGreaterThanOrEqual(KNOWN_GAP_CEILING);
  });
});

// The sin the fence's own header names, turned into a check instead of a
// paragraph: "`push_subscriptions` was DELETED by art. 16 while art. 14 never
// returned it, so the subject could not see what was about to be destroyed."
// Nothing enforced that. A table can still be added to erase_subject_data alone
// and the four catalogue checks all pass — the fence asks whether each table is
// CLASSIFIED, never whether the two rights agree with each other.
describe("art. 16 may not reach further than art. 14", () => {
  // The two tables where erase reaches and export does not, TODAY. Frozen by
  // hand for the same reason KNOWN_GAP_CEILING is: an exception list with no
  // ceiling is not an exception list.
  //
  //  · case_events — erase redacts the subject's own reporter_comment notes
  //    (0130); the export has never returned a case_events section.
  //  · libreta_share_tokens — 0207 revokes the subject's outstanding shares and
  //    says so in the fence itself: "The art. 14 side is still a gap —
  //    export_subject_data does not return the `label` the user typed."
  const ERASE_ONLY_KNOWN: readonly string[] = ["case_events", "libreta_share_tokens"];

  it("every table erase_subject_data reaches is also returned by export_subject_data", () => {
    const inExport = new Set(IN_EXPORT);
    const allowed = new Set(ERASE_ONLY_KNOWN);
    const undisclosed = IN_ERASE.filter((t) => !inExport.has(t) && !allowed.has(t));
    expect(
      undisclosed,
      `${undisclosed.join(", ")} — erase_subject_data destroys or rewrites these and export_subject_data never shows them, so the subject cannot see what art. 16 is about to do. Add a section to the export, or declare it in ERASE_ONLY_KNOWN with the reason.`,
    ).toEqual([]);
  });

  it("the exception list has no stale entry, so closing one of them frees nothing", () => {
    // The down-ratchet for this list. Without it, giving case_events an export
    // section would leave a free slot another table could quietly occupy.
    const inExport = new Set(IN_EXPORT);
    const inErase = new Set(IN_ERASE);
    for (const t of ERASE_ONLY_KNOWN) {
      expect(inErase.has(t), `${t} is in ERASE_ONLY_KNOWN but not in IN_ERASE`).toBe(true);
      expect(
        inExport.has(t),
        `${t} is now in IN_EXPORT — the art. 14 side was closed. Remove it from ERASE_ONLY_KNOWN in the same commit.`,
      ).toBe(false);
    }
  });
});

// Migration 0208. These three left KNOWN_GAP together; this is the regression
// guard that they left it in BOTH directions rather than only the cheap one.
describe("the three gaps migration 0208 closed", () => {
  const CLOSED_BY_0208 = [
    "operator_feed_watermarks",
    "physical_tag_interest",
    "organization_invitations",
  ] as const;

  it.each(CLOSED_BY_0208)(
    "%s is reached by BOTH rights, and is no longer declared as debt",
    (t) => {
      expect(IN_EXPORT, `${t} must be returned by export_subject_data (art. 14)`).toContain(t);
      expect(IN_ERASE, `${t} must be reached by erase_subject_data (art. 16)`).toContain(t);
      expect(Object.hasOwn(KNOWN_GAP, t), `${t} is still in the debt register`).toBe(false);
      expect(Object.hasOwn(EXEMPT, t), `${t} holds subject data — it is not EXEMPT`).toBe(false);
    },
  );
});
