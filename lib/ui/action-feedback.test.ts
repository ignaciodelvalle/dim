// Tests for lib/ui/action-feedback.ts — the mutation-feedback convention
// helper (audit-3-feedback §C1, 2026-07-21). Thin wrappers around sonner;
// the test just pins that notifySaved/notifyActionError call the right
// sonner method with the right tone, since that contract is the whole
// point of having a single shared helper instead of ad hoc `toast.*` calls.

import { describe, expect, it, vi } from "vitest";

const success = vi.fn();
const error = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => success(...args),
    error: (...args: unknown[]) => error(...args),
  },
}));

import { notifyActionError, notifySaved } from "./action-feedback";

describe("notifySaved", () => {
  it("fires toast.success with the given message", () => {
    notifySaved("Transferencia aceptada");
    expect(success).toHaveBeenCalledWith("Transferencia aceptada");
  });

  it("defaults to 'Listo' when no message is passed", () => {
    notifySaved();
    expect(success).toHaveBeenCalledWith("Listo");
  });
});

describe("notifyActionError", () => {
  it("fires toast.error with the given message", () => {
    notifyActionError("No se pudo guardar.");
    expect(error).toHaveBeenCalledWith("No se pudo guardar.");
  });
});
