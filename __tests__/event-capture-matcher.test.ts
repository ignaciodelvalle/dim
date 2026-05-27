import { describe, expect, it } from "vitest";

import {
  CAPTURE_INPUT_MAX_LENGTH,
  extractDateFromText,
  matchCaptureIntent,
} from "@/lib/event-capture-matcher";

// Use a fixed reference date so the date tests are stable.
const NOW = new Date("2026-05-19T12:00:00Z");

describe("matchCaptureIntent — triggers (14 event types)", () => {
  it.each([
    ["le di la antirrábica hoy", "vaccination_administered"],
    ["le aplicaron la triple", "vaccination_administered"],
    ["recordar darle pulgas el sábado", "deworming_administered"],
    ["le di antiparasitario interno", "deworming_administered"],
    ["pesa 12.5 kg", "weight_recorded"],
    ["lo pesé hoy", "weight_recorded"],
    ["le pusieron el chip ayer", "microchip_implanted"],
    ["lo castraron la semana pasada", "sterilization_performed"],
    ["esterilizada", "sterilization_performed"],
    ["lo mordió un perro", "incident_reported"],
    ["tiene vómitos hace 2 días", "symptom_observed"],
    ["no come desde el lunes", "symptom_observed"],
    ["visita al veterinario", "vet_visit_logged"],
    ["control con la clínica", "vet_visit_logged"],
    ["empecé el tratamiento", "medication_started"],
    ["empecé pastillas", "medication_started"],
    ["antibiotico", "medication_started"],
    ["terminé la medicación", "medication_stopped"],
    ["dejé las pastillas", "medication_stopped"],
    ["se murió esta mañana", "death_recorded"],
    ["falleció en la clínica", "death_recorded"],
    ["estudio de sangre", "clinical_info_logged"],
    ["ecografía abdominal", "clinical_info_logged"],
    ["check-in post adopción", "post_adoption_checkin"],
    ["anotar: tomó poca agua", "note_added"],
  ])("'%s' → %s", (text, expected) => {
    const result = matchCaptureIntent(text);
    expect(result, `no match for "${text}"`).toBeTruthy();
    expect(result?.eventType).toBe(expected);
  });

  it("returns null for completely unrelated input", () => {
    expect(matchCaptureIntent("hola")).toBeNull();
    expect(matchCaptureIntent("")).toBeNull();
    expect(matchCaptureIntent("   ")).toBeNull();
  });
});

describe("matchCaptureIntent — slot extraction", () => {
  it("extracts kg from weight phrasing (dot)", () => {
    const r = matchCaptureIntent("pesa 12.5 kg");
    expect(r?.slots.kg).toBe("12.5");
  });

  it("normalizes comma decimals to dot", () => {
    const r = matchCaptureIntent("pesa 12,5 kg");
    expect(r?.slots.kg).toBe("12.5");
  });

  it("extracts vaccine name", () => {
    const r = matchCaptureIntent("le di la antirrábica");
    expect(r?.slots.vaccineName?.toLowerCase()).toBe("antirrábica");
  });

  it("extracts chipNumber when 15 digits are present", () => {
    const r = matchCaptureIntent("le pusieron el chip 985141004321456");
    expect(r?.slots.chipNumber).toBe("985141004321456");
  });

  it("note_added captures the full text as `text` slot", () => {
    const r = matchCaptureIntent("anotar: comió pollo y le cayó bien");
    expect(r?.eventType).toBe("note_added");
    expect(r?.slots.text).toContain("comió pollo");
  });

  it("complex forms (mordedura, sintoma, medicación) match but expose no slots", () => {
    expect(matchCaptureIntent("lo mordió un perro")?.slots).toEqual({});
    expect(matchCaptureIntent("tiene vómitos")?.slots).toEqual({});
    expect(matchCaptureIntent("antibiotico")?.slots).toEqual({});
  });
});

describe("extractDateFromText", () => {
  it("hoy → today", () => {
    expect(extractDateFromText("le di antirrábica hoy", NOW)).toBe("2026-05-19");
  });
  it("ayer → today - 1", () => {
    expect(extractDateFromText("ayer le di la vacuna", NOW)).toBe("2026-05-18");
  });
  it("anteayer → today - 2", () => {
    expect(extractDateFromText("anteayer", NOW)).toBe("2026-05-17");
  });
  it("hace 3 días", () => {
    expect(extractDateFromText("le di la antirrábica hace 3 días", NOW)).toBe("2026-05-16");
  });
  it("DD/MM/YYYY parses correctly", () => {
    expect(extractDateFromText("el 12/05/2026 lo pesé", NOW)).toBe("2026-05-12");
  });
  it("DD/MM (no year) assumes current year", () => {
    expect(extractDateFromText("le di la triple el 10/03", NOW)).toBe("2026-03-10");
  });
  it("'el DD de {mes}' parses correctly", () => {
    expect(extractDateFromText("le di la antirrábica el 15 de marzo", NOW)).toBe("2026-03-15");
  });
  it("returns null when no date phrase fired", () => {
    expect(extractDateFromText("pesa 12 kg", NOW)).toBeNull();
  });
  it("rejects invalid dates (Feb 30)", () => {
    expect(extractDateFromText("el 30/02/2026", NOW)).toBeNull();
  });
});

describe("matchCaptureIntent — adversarial inputs", () => {
  it("truncates input above CAPTURE_INPUT_MAX_LENGTH before matching", () => {
    // Place the trigger word past the cap. After truncation it disappears, so
    // the matcher returns null — which is exactly the desired anti-abuse
    // behavior (no pathological string ever reaches the RegExp engine).
    const padding = "x".repeat(CAPTURE_INPUT_MAX_LENGTH + 10);
    const input = `${padding} vacuna`;
    expect(matchCaptureIntent(input)).toBeNull();
  });

  it("matches normally when the trigger word fits under the cap", () => {
    const padding = "x".repeat(CAPTURE_INPUT_MAX_LENGTH - 20);
    const input = `vacuna ${padding}`;
    const result = matchCaptureIntent(input);
    expect(result?.eventType).toBe("vaccination_administered");
  });

  it("handles emoji and unicode without crashing", () => {
    // Emojis don't trigger any pattern but the matcher must return null
    // cleanly, not throw on grapheme weirdness.
    expect(matchCaptureIntent("🐕 🩺 ❤️")).toBeNull();
    expect(matchCaptureIntent("vacuna 💉 antirrábica")?.eventType).toBe("vaccination_administered");
  });

  it("treats regex metacharacters in input as literal text", () => {
    // The user typing "vacuna|peso" must match SOLO vacuna — the `|` is just
    // a character to the matcher because triggers are hardcoded patterns,
    // not built from input.
    const result = matchCaptureIntent("vacuna|peso");
    expect(result?.eventType).toBe("vaccination_administered");
  });

  it("handles a multi-kb input without crashing (cap protects regex)", () => {
    // 10kb of `a` characters. After truncation the matcher runs on 500
    // chars max and returns null in under a few ms. The point is no crash.
    const input = "a".repeat(10_000);
    expect(matchCaptureIntent(input)).toBeNull();
  });
});
