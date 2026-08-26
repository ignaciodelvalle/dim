// `CaretakerPetScreen` — the titular's side of cuidador temporal.
//
// WHAT THESE HAVE TO PROVE, beyond "it renders"
// ---------------------------------------------------------------------------
//   1. THE FORM AND THE CONTROLS ARE NEVER BOTH OFFERED. Two partial unique
//      indexes allow at most one open arrangement per pet, so a screen showing
//      "invitar" beside "finalizar" would be offering something the database
//      refuses.
//   2. RETIRAR AND FINALIZAR ARE DIFFERENT FACTS AND THE COPY KEEPS THEM APART.
//      One withdraws an invitation nobody answered; the other ends a live
//      arrangement and appends `caretaker_ended` to the spine.
//   3. THE FINALIZAR CONFIRMATION SAYS WHAT IT DOES NOT DO. Ending the grant ends
//      ACCESS. The animal may still be at the caretaker's house, and a titular who
//      reads "finalizar" as "get my pet back" has been misled by their own app.
//   4. AN IMPOSSIBLE DAY NEVER LEAVES THE DEVICE. `2026-02-31` would reach a
//      server whose boundary parser rolls it over to the 3rd of March.
//   5. A DESIGNATION TO AN ADDRESS WITH NO ACCOUNT SAYS SO. No invitation mail is
//      sent from this endpoint and no in-app notice is written either, so
//      `inviteeNeedsAccount: true` means NOBODY has been told.
//   6. A FAILED READ IS NOT AN EMPTY COCKPIT. Saying "no hay ningún cuidado" over
//      an outage would invite a titular to designate a second caretaker while one
//      is already running.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../api/endpoints", () => ({
  fetchMyCaretakerGrants: (...args: unknown[]) => mockFetch(...args),
  sendCaretakerCommand: (...args: unknown[]) => mockSend(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

import type { MyCaretakerGrantV1, MyCaretakerGrantsV1 } from "@dim/contract/api";
import { CaretakerPetScreen } from "./CaretakerPetScreen";

const PET = "DIM-PAMP-0001";
const TOKEN = "CG-0123456789abcdef0123456789abcdef";

function aGrant(over: Partial<MyCaretakerGrantV1> = {}): MyCaretakerGrantV1 {
  return {
    grantToken: TOKEN,
    status: "pending",
    direction: "outgoing",
    pet: { publicToken: PET, name: "Pampa", species: "dog" },
    counterpartyName: null,
    caretakerEmail: "ana@example.com",
    startsAt: "2026-09-01T03:00:00.000Z",
    endsAt: "2026-09-16T02:59:59.999Z",
    note: null,
    expired: false,
    scopeSentence: "Podés cargar eventos médicos, notas y marcar perdido/encontrado.",
    capabilities: { canAccept: false, canReject: false, canCancel: true, canRevoke: false },
    ...over,
  };
}

function hub(outgoing: MyCaretakerGrantV1[]): MyCaretakerGrantsV1 {
  return {
    payloadVersion: 1,
    issuedAt: "2026-08-26T00:00:00.000Z",
    staleAfter: "2026-08-26T00:01:00.000Z",
    incoming: [],
    outgoing,
  };
}

function loads(outgoing: MyCaretakerGrantV1[]) {
  mockFetch.mockResolvedValue({ outcome: "ok", payload: hub(outgoing) });
}

function designateAck(inviteeNeedsAccount: boolean) {
  return {
    outcome: "ok",
    payload: {
      command: "designate",
      changed: true,
      grantToken: TOKEN,
      petPublicToken: null,
      inviteeNeedsAccount,
    },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockSend.mockReset();
});

describe("the two states are never both offered", () => {
  it("shows the form when nothing is running", async () => {
    loads([]);
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);

    await waitFor(() => expect(screen.getByText("Invitar como cuidador/a")).toBeTruthy());
    expect(screen.queryByText(/Finalizar el cuidado/)).toBeNull();
    expect(screen.queryByText(/Retirar la invitación/)).toBeNull();
  });

  it("shows the withdraw control on a pending invitation, and no form", async () => {
    loads([aGrant()]);
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);

    await waitFor(() => expect(screen.getByText("Retirar la invitación")).toBeTruthy());
    expect(screen.queryByText("Invitar como cuidador/a")).toBeNull();
    expect(screen.getByText("Pendiente")).toBeTruthy();
  });

  it("shows the end control on a live arrangement, and no form", async () => {
    loads([
      aGrant({
        status: "accepted",
        counterpartyName: "Ana",
        capabilities: { canAccept: false, canReject: false, canCancel: false, canRevoke: true },
      }),
    ]);
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);

    await waitFor(() => expect(screen.getByText("Finalizar el cuidado ahora")).toBeTruthy());
    expect(screen.queryByText("Invitar como cuidador/a")).toBeNull();
    expect(screen.getByText("Activo")).toBeTruthy();
    expect(screen.getByText("Para: Ana")).toBeTruthy();
  });

  it("ignores a grant on ANOTHER pet", async () => {
    loads([aGrant({ pet: { publicToken: "DIM-OTRO-0002", name: "Otro", species: "cat" } })]);
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);
    await waitFor(() => expect(screen.getByText("Invitar como cuidador/a")).toBeTruthy());
  });
});

describe("retirar and finalizar are different facts", () => {
  it("says nobody loses anything when withdrawing an invitation", async () => {
    loads([aGrant()]);
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);

    await waitFor(() => expect(screen.getByText("Retirar la invitación")).toBeTruthy());
    fireEvent.press(screen.getByText("Retirar la invitación"));

    await waitFor(() => expect(screen.getByText(/Nunca tuvo acceso/)).toBeTruthy());
    expect(screen.getByText("Confirmar el retiro")).toBeTruthy();
  });

  it("says ending the grant does NOT bring the animal home", async () => {
    // The load-bearing sentence of this whole screen. `caretaker_ended` removes
    // ACCESS; where the animal physically is remains an open question the titular
    // has to act on.
    loads([
      aGrant({
        status: "accepted",
        capabilities: { canAccept: false, canReject: false, canCancel: false, canRevoke: true },
      }),
    ]);
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);

    await waitFor(() => expect(screen.getByText("Finalizar el cuidado ahora")).toBeTruthy());
    fireEvent.press(screen.getByText("Finalizar el cuidado ahora"));

    await waitFor(() => expect(screen.getByText(/esto no la trae de vuelta/)).toBeTruthy());
    expect(screen.getByText("Confirmar la finalización")).toBeTruthy();
  });

  it("sends revoke with BOTH tokens, because the guard runs against the pet", async () => {
    loads([
      aGrant({
        status: "accepted",
        capabilities: { canAccept: false, canReject: false, canCancel: false, canRevoke: true },
      }),
    ]);
    mockSend.mockResolvedValue({
      outcome: "ok",
      payload: {
        command: "revoke",
        changed: true,
        grantToken: TOKEN,
        petPublicToken: null,
        inviteeNeedsAccount: null,
      },
    });
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);

    await waitFor(() => expect(screen.getByText("Finalizar el cuidado ahora")).toBeTruthy());
    fireEvent.press(screen.getByText("Finalizar el cuidado ahora"));
    await waitFor(() => expect(screen.getByText("Confirmar la finalización")).toBeTruthy());
    fireEvent.press(screen.getByText("Confirmar la finalización"));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend.mock.calls[0]?.[1]).toEqual({
      command: "revoke",
      petPublicToken: PET,
      grantToken: TOKEN,
    });
  });
});

describe("the designation form", () => {
  function fill(values: { email: string; endsAt: string }) {
    fireEvent.changeText(screen.getByLabelText("Correo de la persona"), values.email);
    fireEvent.changeText(screen.getByLabelText("Hasta"), values.endsAt);
  }

  it("refuses an impossible day BEFORE the network", async () => {
    // `2026-02-31` looks fine and the server's own boundary parser rolls it over
    // to the 3rd of March — three days of somebody else's access nobody asked for.
    loads([]);
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);

    await waitFor(() => expect(screen.getByText("Invitar como cuidador/a")).toBeTruthy());
    fill({ email: "ana@example.com", endsAt: "2026-02-31" });
    fireEvent.press(screen.getByText("Invitar como cuidador/a"));

    await waitFor(() => expect(screen.getByText(/días reales/)).toBeTruthy());
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("refuses a malformed address BEFORE the network", async () => {
    loads([]);
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);

    await waitFor(() => expect(screen.getByText("Invitar como cuidador/a")).toBeTruthy());
    fill({ email: "ana", endsAt: "2026-09-15" });
    fireEvent.press(screen.getByText("Invitar como cuidador/a"));

    await waitFor(() => expect(screen.getByText(/correo válido/)).toBeTruthy());
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("says NOBODY was told when the address has no account", async () => {
    // No invitation mail is sent from this endpoint (the web's `redirectTo` is a
    // browser link), and `designateCaretaker` writes an in-app notice only when
    // the address resolved. So `true` means the titular has to reach them.
    loads([]);
    mockSend.mockResolvedValue(designateAck(true));
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);

    await waitFor(() => expect(screen.getByText("Invitar como cuidador/a")).toBeTruthy());
    fill({ email: "ana@example.com", endsAt: "2026-09-15" });
    fireEvent.press(screen.getByText("Invitar como cuidador/a"));

    await waitFor(() => expect(screen.getByText(/avisale vos/)).toBeTruthy());
  });

  it("says the other thing when the address DOES have an account", async () => {
    loads([]);
    mockSend.mockResolvedValue(designateAck(false));
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);

    await waitFor(() => expect(screen.getByText("Invitar como cuidador/a")).toBeTruthy());
    fill({ email: "ana@example.com", endsAt: "2026-09-15" });
    fireEvent.press(screen.getByText("Invitar como cuidador/a"));

    await waitFor(() => expect(screen.getByText(/Le avisamos a esa persona/)).toBeTruthy());
  });

  it("renders the server's refusal when the caller may not designate", async () => {
    // A person-path holder whose role is `caretaker` — deny-list row
    // `caretaker-sub-designation`. The screen does not pre-judge; it asks.
    loads([]);
    mockSend.mockResolvedValue({
      outcome: "api-error",
      code: "caretaker_forbidden",
      retryAfterSeconds: null,
    });
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);

    await waitFor(() => expect(screen.getByText("Invitar como cuidador/a")).toBeTruthy());
    fill({ email: "ana@example.com", endsAt: "2026-09-15" });
    fireEvent.press(screen.getByText("Invitar como cuidador/a"));

    await waitFor(() => expect(screen.getByText(/no es tuya para hacer/)).toBeTruthy());
  });
});

describe("a failed read", () => {
  it("is not an empty cockpit", async () => {
    // Saying "no hay ningún cuidado" over an outage would invite a titular to
    // designate a SECOND caretaker while one is already running — which the
    // database would then refuse, after they filled in a form.
    mockFetch.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    render(<CaretakerPetScreen publicToken={PET} petName="Pampa" />);

    await waitFor(() => expect(screen.getByText(/No pudimos conectarnos/)).toBeTruthy());
    expect(screen.queryByText("Invitar como cuidador/a")).toBeNull();
    expect(screen.getByText("Reintentar")).toBeTruthy();
  });
});
