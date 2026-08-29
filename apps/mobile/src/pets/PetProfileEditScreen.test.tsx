// `PetProfileEditScreen` — the render tests for the first native screen that
// CORRECTS something the app already recorded.
//
// WHAT THESE HAVE TO PROVE, beyond "it renders"
// ---------------------------------------------------------------------------
//   1. THE TWO HALVES ARE GATED SEPARATELY, from `capabilities` and never from
//      "this pet is mine". The case that matters is the FOSTER: allowed to
//      correct the animal's name, not allowed anywhere near the titular's own
//      vet and phone. A screen that reasoned from one flag gets exactly this
//      person wrong.
//   2. NO CONTROL IS OFFERED THAT CAN ONLY BE REFUSED. Where a flag is false the
//      screen renders the REASON, not a disabled form and not a form whose save
//      answers 403.
//   3. THE FORM IS RE-SEEDED FROM THE SERVER AFTER A SAVE, so a value the server
//      normalised (a breed folded to its canonical label) is what the field ends
//      up showing — not what the person typed.
//   4. "NOTHING CHANGED" IS SAID OUT LOUD rather than dressed as success.
//   5. THE STORED BREED IS REACHABLE even when the catalog has lost it (QA A5).

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../api/endpoints", () => ({
  fetchPetProfileEdit: (...args: unknown[]) => mockFetch(...args),
  sendPetProfileCommand: (...args: unknown[]) => mockSend(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

import type { PetProfileEditV1 } from "@dim/contract/api";

import { PetProfileEditScreen } from "./PetProfileEditScreen";

const TOKEN = "DIM-PAMP-0001";

function payload(over: Partial<PetProfileEditV1> = {}): PetProfileEditV1 {
  return {
    payloadVersion: 1,
    issuedAt: "2026-08-29T10:00:00.000Z",
    staleAfter: "2026-08-29T10:01:00.000Z",
    publicToken: TOKEN,
    species: "dog",
    identity: { name: "Pampa", breed: "Mestizo", color: "Atigrada" },
    emergencyContacts: {
      preferredVetName: "Vet Norte",
      preferredVetPhone: "1122334455",
      emergencyContactName: "",
      emergencyContactPhone: "",
    },
    emergencyAccountDefault: {
      preferredVetName: null,
      preferredVetPhone: null,
      emergencyContactName: "Mamá",
      emergencyContactPhone: "1199887766",
    },
    capabilities: { canEditIdentity: true, canEditEmergencyContacts: true },
    ...over,
  } as PetProfileEditV1;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockSend.mockReset();
  mockFetch.mockResolvedValue({ outcome: "ok", payload: payload() });
  mockSend.mockResolvedValue({
    outcome: "ok",
    payload: { command: "edit_identity", changed: true },
  });
});

describe("PetProfileEditScreen — the two halves are gated separately", () => {
  it("pre-fills both forms from the server's own values", async () => {
    render(<PetProfileEditScreen publicToken={TOKEN} />);
    expect(await screen.findByDisplayValue("Pampa")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("Atigrada")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("Vet Norte")).toBeOnTheScreen();
  });

  it("gives a FOSTER the identity form and refuses the contacts, with the reason", async () => {
    // THE CASE A SINGLE FLAG GETS WRONG. A foster is a Path-1 holder: they may
    // correct the animal's name (requireTitularAccess admits them) and must not
    // see the legal owner's vet and phone (the writer's join says role='owner').
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        capabilities: { canEditIdentity: true, canEditEmergencyContacts: false },
        emergencyContacts: null,
        emergencyAccountDefault: null,
      }),
    });
    render(<PetProfileEditScreen publicToken={TOKEN} />);
    expect(await screen.findByDisplayValue("Pampa")).toBeOnTheScreen();
    // The form that IS theirs is live…
    expect(screen.getByText("Guardar datos")).toBeOnTheScreen();
    // …and the one that is not shows a sentence instead of a control.
    expect(screen.queryByText("Guardar contactos")).toBeNull();
    expect(screen.getByText(/Solo esa persona puede cambiarlos/)).toBeOnTheScreen();
  });

  it("refuses the identity form on its own flag, with a different sentence", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        capabilities: { canEditIdentity: false, canEditEmergencyContacts: true },
      }),
    });
    render(<PetProfileEditScreen publicToken={TOKEN} />);
    expect(await screen.findByText(/solo del titular/)).toBeOnTheScreen();
    expect(screen.queryByText("Guardar datos")).toBeNull();
    // The other half is untouched by that refusal.
    expect(screen.getByText("Guardar contactos")).toBeOnTheScreen();
  });
});

describe("PetProfileEditScreen — saving", () => {
  it("posts the identity command with the fields as typed", async () => {
    render(<PetProfileEditScreen publicToken={TOKEN} />);
    const name = await screen.findByDisplayValue("Pampa");
    fireEvent.changeText(name, "Pampita");
    fireEvent.press(screen.getByText("Guardar datos"));
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(mockSend).toHaveBeenCalledWith({}, TOKEN, {
      command: "edit_identity",
      name: "Pampita",
      breed: "Mestizo",
      color: "Atigrada",
    });
  });

  it("re-reads after a save instead of trusting the ack", async () => {
    // The server folds "pitbull" to "Pit Bull Terrier"; a screen that kept its
    // own draft would go on showing the lowercase string it sent.
    render(<PetProfileEditScreen publicToken={TOKEN} />);
    await screen.findByDisplayValue("Pampa");
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ identity: { name: "Pampita", breed: "Mestizo", color: "Atigrada" } }),
    });
    fireEvent.press(screen.getByText("Guardar datos"));
    expect(await screen.findByDisplayValue("Pampita")).toBeOnTheScreen();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("says nothing needed saving when the server reports no change", async () => {
    mockSend.mockResolvedValue({
      outcome: "ok",
      payload: { command: "edit_identity", changed: false },
    });
    render(<PetProfileEditScreen publicToken={TOKEN} />);
    await screen.findByDisplayValue("Pampa");
    fireEvent.press(screen.getByText("Guardar datos"));
    expect(await screen.findByText(/nada que cambiar/)).toBeOnTheScreen();
  });

  it("refuses an empty name locally, and does not post it", async () => {
    render(<PetProfileEditScreen publicToken={TOKEN} />);
    const name = await screen.findByDisplayValue("Pampa");
    fireEvent.changeText(name, "   ");
    fireEvent.press(screen.getByText("Guardar datos"));
    expect(await screen.findByText(/El nombre no puede quedar vacío/)).toBeOnTheScreen();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("posts all four contact fields, so an emptied one clears the override", async () => {
    mockSend.mockResolvedValue({
      outcome: "ok",
      payload: { command: "set_emergency_contacts", changed: true },
    });
    render(<PetProfileEditScreen publicToken={TOKEN} />);
    const vetName = await screen.findByDisplayValue("Vet Norte");
    fireEvent.changeText(vetName, "");
    fireEvent.press(screen.getByText("Guardar contactos"));
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(mockSend).toHaveBeenCalledWith({}, TOKEN, {
      command: "set_emergency_contacts",
      preferredVetName: "",
      preferredVetPhone: "1122334455",
      emergencyContactName: "",
      emergencyContactPhone: "",
    });
  });

  it("tells the person what the account will show behind a cleared pair", async () => {
    render(<PetProfileEditScreen publicToken={TOKEN} />);
    await screen.findByDisplayValue("Pampa");
    expect(screen.getByText(/Mamá/)).toBeOnTheScreen();
    // And is honest when there is nothing behind it.
    expect(screen.getByText(/tu cuenta tampoco tiene uno cargado/)).toBeOnTheScreen();
  });
});

describe("PetProfileEditScreen — the breed the catalog forgot", () => {
  it("offers a stored off-catalog breed so a name edit cannot wipe it", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        identity: { name: "Pampa", breed: "Ovejero Inventado", color: null },
      }),
    });
    render(<PetProfileEditScreen publicToken={TOKEN} />);
    // TWICE, and both are load bearing: once as the current selection (the
    // chip with "Quitar"), and once in the option list, so a person who clears
    // it by accident can put it back. A picker that only offered the catalog
    // would make that second one impossible.
    const shown = await screen.findAllByText("Ovejero Inventado");
    expect(shown.length).toBe(2);
    expect(screen.getByText("Quitar")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Guardar datos"));
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(mockSend).toHaveBeenCalledWith({}, TOKEN, {
      command: "edit_identity",
      name: "Pampa",
      breed: "Ovejero Inventado",
      color: null,
    });
  });
});

describe("PetProfileEditScreen — the read failing", () => {
  it("says so and offers a retry rather than an empty form", async () => {
    // An empty form over a failed read is the worst outcome available: a person
    // would "correct" a blank name onto a real animal.
    mockFetch.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    render(<PetProfileEditScreen publicToken={TOKEN} />);
    expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen();
    expect(screen.queryByText("Guardar datos")).toBeNull();
    expect(screen.getByText("Reintentar")).toBeOnTheScreen();
  });
});
