// @vitest-environment jsdom
//
// Tests for lib/ui/denuncia-autosave.ts — the localStorage draft persistence
// behind the anonymous denuncia wizard.
//
// Regression focus (citizen validation 2026-07-06): reopening the wizard with a
// saved draft must never surface the literal string "undefined" on step 3. The
// wizard maps restored fields defensively (`draft.step3.description ?? ""`), and
// these tests lock the restore CONTRACT that guard relies on: a malformed or
// partial draft is either rejected (returns null) or exposes `undefined` for the
// missing field (never the string "undefined"), so the component guard resolves
// it to an empty string. If someone weakens restoreDraft's shape validation,
// these fail.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type DraftData,
  clearDraft,
  hasDraft,
  restoreDraft,
  saveDraft,
} from "@/lib/ui/denuncia-autosave";

const STORAGE_KEY = "denuncia_draft_v1";

const FULL_DRAFT: Omit<DraftData, "savedAt"> = {
  step: 3,
  step1: { kind: "abandonment" },
  step2: { severity: "critical" },
  step3: { description: "Perro atado sin agua bajo el sol.", when: "now" },
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("denuncia-autosave — restore contract", () => {
  it("round-trips a full draft", () => {
    saveDraft(FULL_DRAFT);
    const restored = restoreDraft();
    expect(restored).not.toBeNull();
    expect(restored?.step).toBe(3);
    expect(restored?.step1.kind).toBe("abandonment");
    expect(restored?.step2.severity).toBe("critical");
    expect(restored?.step3.description).toBe("Perro atado sin agua bajo el sol.");
    expect(restored?.step3.when).toBe("now");
  });

  it("returns null when there is no draft", () => {
    expect(restoreDraft()).toBeNull();
    expect(hasDraft()).toBe(false);
  });

  it("rejects a malformed draft missing a required step section", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ step: 3, step1: { kind: "abandonment" }, savedAt: Date.now() }),
    );
    expect(restoreDraft()).toBeNull();
    // Corrupt payload is purged so it can't resurface on the next open.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rejects an expired draft (older than the 24h TTL)", () => {
    const stale: DraftData = {
      ...FULL_DRAFT,
      savedAt: Date.now() - 25 * 60 * 60 * 1000,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stale));
    expect(restoreDraft()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rejects corrupt JSON without throwing", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(() => restoreDraft()).not.toThrow();
    expect(restoreDraft()).toBeNull();
  });

  // The exact shape behind the "undefined" symptom: a legacy/partial draft whose
  // step3 exists but carries no `description` key (JSON.stringify drops undefined
  // values, so this is what an older save produces). Restore must SUCCEED and the
  // missing field must read as `undefined` — never the STRING "undefined" — so the
  // wizard's `?? ""` guard renders an empty field instead of the literal text.
  it("a partial step3 (no description) exposes undefined, never the string 'undefined'", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        step: 3,
        step1: { kind: "abandonment" },
        step2: { severity: "critical" },
        step3: { when: "now" },
        savedAt: Date.now(),
      }),
    );
    const restored = restoreDraft();
    expect(restored).not.toBeNull();
    expect(restored?.step3.description).toBeUndefined();
    expect(restored?.step3.description).not.toBe("undefined");
    // The guard the wizard applies on restore.
    expect(restored?.step3.description ?? "").toBe("");
  });

  it("clearDraft removes the persisted draft", () => {
    saveDraft(FULL_DRAFT);
    expect(hasDraft()).toBe(true);
    clearDraft();
    expect(hasDraft()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
