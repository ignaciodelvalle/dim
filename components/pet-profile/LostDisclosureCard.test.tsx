// @vitest-environment jsdom
//
// LostDisclosureCard — toast-sweep-2026-07-21: these 5 disclosure toggles had
// ZERO feedback of any kind (no optimistic local state, no error surface) —
// the most silent mutation found in the sweep. Pins that a toggle fires
// notifySaved on success and notifyActionError when the bound server action
// rejects (mutation-feedback convention, lib/ui/action-feedback.ts).

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { LostDisclosureCard } from "./LostDisclosureCard";

const prefs = {
  discloseFirstNameWhenLost: true,
  disclosePhoneWhenLost: false,
  discloseEmailWhenLost: false,
  discloseLastLocationWhenLost: false,
  allowFinderFormWhenLost: false,
};

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
});

afterEach(() => {
  cleanup();
});

it("fires the success toast after a toggle resolves", async () => {
  const toggleAction = vi.fn().mockResolvedValue(undefined);
  render(
    <LostDisclosureCard
      prefs={prefs}
      toggleAction={toggleAction}
      publicHref="/p/DIM-TEST-0001"
      ownerFirstName="Nacho"
    />,
  );

  fireEvent.click(screen.getByRole("switch", { name: "Tu teléfono" }));

  await waitFor(() => {
    expect(toggleAction).toHaveBeenCalledWith("disclosePhoneWhenLost", true);
  });
  await waitFor(() => {
    expect(toastSuccess).toHaveBeenCalledWith("Preferencia actualizada");
  });
  expect(toastError).not.toHaveBeenCalled();
});

it("fires the error toast when the bound action rejects", async () => {
  const toggleAction = vi.fn().mockRejectedValue(new Error("boom"));
  render(
    <LostDisclosureCard
      prefs={prefs}
      toggleAction={toggleAction}
      publicHref="/p/DIM-TEST-0001"
      ownerFirstName="Nacho"
    />,
  );

  fireEvent.click(screen.getByRole("switch", { name: "Tu email" }));

  await waitFor(() => {
    expect(toastError).toHaveBeenCalledWith("No se pudo guardar. Probá de nuevo.");
  });
  expect(toastSuccess).not.toHaveBeenCalled();
});
