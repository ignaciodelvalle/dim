// `TransfersScreen` — the hub's render tests.
//
// WHAT THESE HAVE TO PROVE, beyond "it renders"
// ---------------------------------------------------------------------------
//   1. A FAILED READ IS NOT AN EMPTY HUB. What is being missed here is a
//      seven-day window that closes by itself, so "no tenés transferencias
//      pendientes" over a server outage is the worst sentence this screen can
//      say. It must show the failure and a way to retry.
//   2. THE THREE SECTIONS ARE THE SERVER'S. Nothing here re-derives which list a
//      row belongs to; a row's section is decided by the addressee rule, which a
//      phone cannot evaluate.
//   3. THE SENDER'S E-MAIL IS NEVER ON SCREEN, on any row, in any state.
//   4. THE EMPTY STATES ARE DIFFERENT SENTENCES, because "nobody offered me
//      anything" and "I have not sent anything" are different facts.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../api/endpoints", () => ({
  fetchMyTransfers: (...args: unknown[]) => mockFetch(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

import type { MyTransferV1, MyTransfersV1 } from "@dim/contract/api";
import { TransfersScreen } from "./TransfersScreen";

function aTransfer(over: Partial<MyTransferV1> = {}): MyTransferV1 {
  return {
    transferToken: "PTR-ABCD-2345",
    status: "pending",
    direction: "incoming",
    pet: { publicToken: "DIM-PAMP-0001", name: "Pampa", species: "dog" },
    counterpartyName: "Vecina",
    toEmail: "yo@example.com",
    reason: "gift",
    note: null,
    rejectionReason: null,
    initiatedAt: "2026-08-20T10:00:00.000Z",
    respondedAt: null,
    expiresAt: "2026-08-27T10:00:00.000Z",
    expired: false,
    capabilities: { canAccept: true, canReject: true, canCancel: false },
    ...over,
  };
}

function payload(over: Partial<MyTransfersV1> = {}): MyTransfersV1 {
  return {
    payloadVersion: 1,
    issuedAt: "2026-08-26T00:00:00.000Z",
    staleAfter: "2026-08-26T00:01:00.000Z",
    incoming: { pending: [], history: [] },
    outgoing: [],
    ...over,
  };
}

const noop = () => {};

beforeEach(() => {
  mockFetch.mockReset();
});

describe("a failed read", () => {
  it("says so and offers a retry — never an empty list", async () => {
    mockFetch.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    render(<TransfersScreen onOpen={noop} />);

    await waitFor(() => expect(screen.getByText(/No pudimos conectarnos/)).toBeTruthy());
    // The absence that would have been a lie.
    expect(screen.queryByText("No tenés transferencias pendientes.")).toBeNull();
    expect(screen.getByText("Reintentar")).toBeTruthy();
  });

  it("re-reads when the retry is pressed", async () => {
    mockFetch.mockResolvedValueOnce({ outcome: "unreachable", detail: "offline" });
    mockFetch.mockResolvedValueOnce({ outcome: "ok", payload: payload() });
    render(<TransfersScreen onOpen={noop} />);

    await waitFor(() => expect(screen.getByText("Reintentar")).toBeTruthy());
    fireEvent.press(screen.getByText("Reintentar"));
    await waitFor(() =>
      expect(screen.getByText("No tenés transferencias pendientes.")).toBeTruthy(),
    );
  });

  it("names an unsupported payload version as an app problem, not a network one", async () => {
    mockFetch.mockResolvedValue({ outcome: "unsupported-version", received: 2 });
    render(<TransfersScreen onOpen={noop} />);
    await waitFor(() => expect(screen.getByText(/Actualizá la app/)).toBeTruthy());
  });
});

describe("the three sections", () => {
  it("gives the two empties different sentences", async () => {
    mockFetch.mockResolvedValue({ outcome: "ok", payload: payload() });
    render(<TransfersScreen onOpen={noop} />);

    await waitFor(() =>
      expect(screen.getByText("No tenés transferencias pendientes.")).toBeTruthy(),
    );
    expect(screen.getByText("No enviaste ninguna transferencia todavía.")).toBeTruthy();
  });

  it("draws no Historial heading when there is no history", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ incoming: { pending: [aTransfer()], history: [] } }),
    });
    render(<TransfersScreen onOpen={noop} />);

    await waitFor(() => expect(screen.getByText("Pampa")).toBeTruthy());
    expect(screen.queryByText("Recibidas · Historial")).toBeNull();
  });

  it("draws it when there is", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        incoming: {
          pending: [],
          history: [aTransfer({ transferToken: "PTR-OLD0-0001", status: "rejected" })],
        },
      }),
    });
    render(<TransfersScreen onOpen={noop} />);
    await waitFor(() => expect(screen.getByText("Recibidas · Historial")).toBeTruthy());
    expect(screen.getByText("Rechazada")).toBeTruthy();
  });
});

describe("a row", () => {
  it("names the animal, the other party and the deadline", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ incoming: { pending: [aTransfer()], history: [] } }),
    });
    render(<TransfersScreen onOpen={noop} />);

    await waitFor(() => expect(screen.getByText("Pampa")).toBeTruthy());
    expect(screen.getByText("De: Vecina")).toBeTruthy();
    expect(screen.getByText("Vence el 27/08/2026")).toBeTruthy();
  });

  it("shows NO e-mail on an incoming row", async () => {
    // `toEmail` is the caller's own address on an incoming row. Printing it
    // would read as the sender's, and the sender's is not in the payload at all.
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        incoming: { pending: [aTransfer({ counterpartyName: null })], history: [] },
      }),
    });
    render(<TransfersScreen onOpen={noop} />);

    await waitFor(() => expect(screen.getByText("Pampa")).toBeTruthy());
    expect(screen.queryByText(/yo@example\.com/)).toBeNull();
  });

  it("says venció when the SERVER says so, with the status still pending", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        incoming: { pending: [aTransfer({ expired: true })], history: [] },
      }),
    });
    render(<TransfersScreen onOpen={noop} />);
    await waitFor(() => expect(screen.getByText("Venció el 27/08/2026")).toBeTruthy());
  });

  it("opens the proposal by its token when pressed", async () => {
    const onOpen = jest.fn();
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ incoming: { pending: [aTransfer()], history: [] } }),
    });
    render(<TransfersScreen onOpen={onOpen} />);

    await waitFor(() => expect(screen.getByText("Pampa")).toBeTruthy());
    fireEvent.press(screen.getByText("Pampa"));
    expect(onOpen).toHaveBeenCalledWith("PTR-ABCD-2345");
  });
});
