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
      alertsOriginShelter={false}
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

it("shows the concrete public preview on the name row when disclosure is on (QA 2026-08-03)", () => {
  render(
    <LostDisclosureCard
      prefs={prefs}
      toggleAction={vi.fn()}
      publicHref="/p/DIM-TEST-0001"
      ownerFirstName="Nacho"
      alertsOriginShelter={false}
    />,
  );

  expect(screen.getByText('El público ve "Lo busca Nacho".')).toBeInTheDocument();
  // The old standalone footer preview line is gone.
  expect(screen.queryByText(/Hoy verán/)).not.toBeInTheDocument();
});

it("keeps the generic name-row description when disclosure is off", () => {
  render(
    <LostDisclosureCard
      prefs={{ ...prefs, discloseFirstNameWhenLost: false }}
      toggleAction={vi.fn()}
      publicHref="/p/DIM-TEST-0001"
      ownerFirstName="Nacho"
      alertsOriginShelter={false}
    />,
  );

  expect(screen.getByText("El público ve quién busca a la mascota.")).toBeInTheDocument();
  expect(screen.queryByText(/Lo busca Nacho/)).not.toBeInTheDocument();
});

it("fires the error toast when the bound action rejects", async () => {
  const toggleAction = vi.fn().mockRejectedValue(new Error("boom"));
  render(
    <LostDisclosureCard
      prefs={prefs}
      toggleAction={toggleAction}
      publicHref="/p/DIM-TEST-0001"
      ownerFirstName="Nacho"
      alertsOriginShelter={false}
    />,
  );

  fireEvent.click(screen.getByRole("switch", { name: "Tu email" }));

  await waitFor(() => {
    expect(toastError).toHaveBeenCalledWith("No se pudo guardar. Probá de nuevo.");
  });
  expect(toastSuccess).not.toHaveBeenCalled();
});

// A5 (PO decision 2026-08-04) — the origin shelter is notified when someone
// reports finding the pet. The PO chose "always", so the mitigation is
// DISCLOSURE: the titular must read it on their own pet's privacy surface, and
// must also read the LIMIT (the finder's contact is not shared).
it("discloses the origin-shelter alert when the pet came out of a shelter", () => {
  render(
    <LostDisclosureCard
      prefs={prefs}
      toggleAction={vi.fn()}
      publicHref="/p/DIM-TEST-0001"
      ownerFirstName="Nacho"
      alertsOriginShelter={true}
    />,
  );
  expect(screen.getByText(/salió de un refugio/i)).toBeInTheDocument();
  expect(screen.getByText(/ese refugio\s+también recibe el aviso/i)).toBeInTheDocument();
  // The limit is not optional copy — it is the reason the disclosure is enough.
  expect(screen.getByText(/no se le comparte el contacto/i)).toBeInTheDocument();
});

it("says nothing about shelters for a pet with no origin shelter", () => {
  render(
    <LostDisclosureCard
      prefs={prefs}
      toggleAction={vi.fn()}
      publicHref="/p/DIM-TEST-0001"
      ownerFirstName="Nacho"
      alertsOriginShelter={false}
    />,
  );
  expect(screen.queryByText(/refugio/i)).toBeNull();
});
