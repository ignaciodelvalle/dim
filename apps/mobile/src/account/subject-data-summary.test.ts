// The one place in this app that looks inside a Ley 25.326 art. 14 response.
//
// Why it is worth a test of its own: if this is wrong, the failure is a LIE
// ABOUT A LEGAL DELIVERABLE, delivered in a friendly card — "3 registros" over a
// section that holds none, or a section quietly dropped from the list because
// its shape was not anticipated. Nothing else in the app would notice.

import { describe, expect, it } from "@jest/globals";

import { exportSections, exportShareText } from "./subject-data-summary";

describe("exportSections", () => {
  it("keeps the RPC's own key order rather than sorting", () => {
    // The mutation this catches: adding `.sort()`. A reader holding the shared
    // JSON next to the screen finds the rows where the file put them; an
    // alphabetical list is this module inventing a presentation the file has not
    // got.
    const sections = exportSections({ zeta: [], alpha: [], mascotas: [] });

    expect(sections.map((s) => s.key)).toEqual(["zeta", "alpha", "mascotas"]);
  });

  it("counts an array's rows, in words and in the singular when there is one", () => {
    const sections = exportSections({ pets: [{}, {}, {}], events: [{}] });

    expect(sections[0]?.summary).toBe("3 registros");
    expect(sections[1]?.summary).toBe("1 registro");
  });

  it("says `sin datos` for empty and for null, never `0`", () => {
    // "0" next to a section name reads like a failed load. "sin datos" is a
    // statement about the file.
    const sections = exportSections({ pets: [], reports: null, notes: undefined });

    expect(sections.map((s) => s.summary)).toEqual(["sin datos", "sin datos", "sin datos"]);
  });

  it("counts an object's fields rather than calling it one row", () => {
    const sections = exportSections({ profile: { id: "x", displayName: "y" } });

    expect(sections[0]?.summary).toBe("2 campos");
  });

  it("reports a top-level scalar as present WITHOUT printing it", () => {
    // The mutation this catches: summarising a scalar as `String(value)`. This
    // card is a table of contents; a screen that started spilling values would
    // be re-rendering the file it just decided not to render — and the values at
    // this level are the subject's own PII.
    const sections = exportSections({ dni_last4: "4821" });

    expect(sections[0]?.summary).toBe("presente");
    expect(sections[0]?.summary).not.toContain("4821");
  });

  it("drops `schema_version`, which is metadata about the file and not data about the person", () => {
    const sections = exportSections({ schema_version: 5, pets: [{}] });

    expect(sections.map((s) => s.key)).toEqual(["pets"]);
  });

  it("shows a section the RPC adds tomorrow, with no list to update here", () => {
    // The property that makes this module safe to leave alone: it has no
    // allow-list. The mutation this catches: introducing one — which is how a
    // table added to `export_subject_data` becomes invisible on the phone while
    // every test stays green.
    const sections = exportSections({ una_tabla_que_no_existia: [{}, {}] });

    expect(sections).toEqual([
      {
        key: "una_tabla_que_no_existia",
        label: "Una tabla que no existia",
        summary: "2 registros",
      },
    ]);
  });

  it("unshouts a key without renaming it", () => {
    const sections = exportSections({ pet_events: [] });

    expect(sections[0]?.label).toBe("Pet events");
    // The KEY is untouched — it is what a reader matches against the file.
    expect(sections[0]?.key).toBe("pet_events");
  });
});

describe("exportShareText", () => {
  it("is the file itself, pretty-printed, with nothing prepended", () => {
    // The mutation this catches: adding a "Generado por miMAR el …" header. It
    // would stop the payload being valid JSON, turning a document another system
    // can read into a message only a human can — and portability is the point of
    // art. 14.
    const text = exportShareText({ subject: { schema_version: 5, pets: [] } });

    expect(JSON.parse(text)).toEqual({ schema_version: 5, pets: [] });
    expect(text).toBe(JSON.stringify({ schema_version: 5, pets: [] }, null, 2));
  });
});
