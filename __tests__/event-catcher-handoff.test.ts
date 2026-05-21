import { describe, expect, it } from "vitest";

import {
  buildKindDeeplink,
  getNoteSlotKey,
} from "@/app/(app)/mis-mascotas/[publicToken]/anotar/handoff";
import { buildAnotarUrl } from "@/app/(app)/mis-mascotas/[publicToken]/anotar/handoff";

const TOKEN = "DIM-TEST-TOKEN";

describe("buildAnotarUrl", () => {
  it("kind only produces kind param", () => {
    const url = buildAnotarUrl(TOKEN, { kind: "vaccination_administered" });
    expect(url).toBe(`/mis-mascotas/${TOKEN}/anotar?kind=vaccination_administered`);
  });

  it("kind + text produces both params", () => {
    const url = buildAnotarUrl(TOKEN, { kind: "vaccination_administered", text: "vacuna" });
    expect(url).toContain("kind=vaccination_administered");
    expect(url).toContain("text=vacuna");
  });

  it("text only produces text param without kind", () => {
    const url = buildAnotarUrl(TOKEN, { text: "vacuna" });
    expect(url).toContain("text=vacuna");
    expect(url).not.toContain("kind=");
  });
});

describe("getNoteSlotKey", () => {
  it("returns notes for vaccination_administered", () => {
    expect(getNoteSlotKey("vaccination_administered")).toBe("notes");
  });

  it("returns text for note_added", () => {
    expect(getNoteSlotKey("note_added")).toBe("text");
  });

  it("returns notes for medication_started after registry expansion", () => {
    expect(getNoteSlotKey("medication_started")).toBe("notes");
  });
});

describe("buildKindDeeplink", () => {
  it("vaccination_administered places text into notes slot and adds occurredAt", () => {
    const url = buildKindDeeplink("vaccination_administered", TOKEN, "Roma tos seca");
    expect(url).toBeTruthy();
    const parsed = new URL(url!, "http://x");
    expect(parsed.searchParams.get("notes")).toBe("Roma tos seca");
    expect(parsed.searchParams.get("occurredAt")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("note_added places text into text slot", () => {
    const url = buildKindDeeplink("note_added", TOKEN, "lo de hoy");
    expect(url).toBeTruthy();
    const parsed = new URL(url!, "http://x");
    expect(parsed.searchParams.get("text")).toBe("lo de hoy");
  });

  it("medication_started places text into notes slot after registry expansion", () => {
    const url = buildKindDeeplink("medication_started", TOKEN, "amoxi cada 8h");
    expect(url).toBeTruthy();
    const parsed = new URL(url!, "http://x");
    expect(parsed.searchParams.get("notes")).toBe("amoxi cada 8h");
  });
});
