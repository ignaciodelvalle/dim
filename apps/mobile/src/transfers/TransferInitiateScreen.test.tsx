// `TransferInitiateScreen` — the form that offers an animal to somebody.
//
// WHAT THESE HAVE TO PROVE, beyond "it renders"
// ---------------------------------------------------------------------------
//   1. NOTHING IS PRESELECTED. The web's `<select>` opens on "Regalo", so its
//      commonest submission carries a reason nobody chose. On a form that hands
//      over an animal that is worth one extra tap.
//   2. THE ADDRESS IS VALIDATED LOCALLY FIRST, against the contract's own
//      schema, so a typo gets a field sentence instead of a round trip that
//      answers `invalid_request` with no field detail.
//   3. NO IDEMPOTENCY KEY, like the other three commands.
//   4. THE SERVER'S REFUSAL IS RENDERED AS-IS. There is no local "am I the
//      owner?" guess — the rule (the active `role='owner'` ownership row) lives
//      in one place and a co-owner has to be told by it.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../api/endpoints", () => ({
  sendTransferCommand: (...args: unknown[]) => mockSend(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

import { TransferInitiateScreen } from "./TransferInitiateScreen";

const TOKEN = "DIM-PAMP-0001";
const noop = () => {};

function renderScreen(onSent: (t: string) => void = noop) {
  return render(<TransferInitiateScreen publicToken={TOKEN} petName="Pampa" onSent={onSent} />);
}

function ok(transferToken: string) {
  return {
    outcome: "ok" as const,
    payload: {
      command: "initiate" as const,
      changed: true,
      transferToken,
      petPublicToken: null,
      recipientNeedsInvite: false,
    },
  };
}

beforeEach(() => {
  mockSend.mockReset();
});

describe("the form", () => {
  it("names the animal and the window the contract carries", () => {
    renderScreen();
    expect(screen.getByText("Transferir Pampa")).toBeTruthy();
    expect(screen.getByText(/7 días/)).toBeTruthy();
  });

  it("falls back honestly when the name is not known", () => {
    render(<TransferInitiateScreen publicToken={TOKEN} petName={null} onSent={noop} />);
    expect(screen.getByText("Transferir esta mascota")).toBeTruthy();
  });

  it("offers the four reasons as a radio group, with none checked", () => {
    renderScreen();
    for (const label of ["Venta", "Regalo", "Herencia", "Otro"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // A DEFAULT WOULD BE A CHOICE SOMEBODY DID NOT MAKE. The submit stays
    // disabled until one is picked, which is how that is enforced rather than
    // merely stated.
    fireEvent.changeText(screen.getByLabelText("Email del receptor"), "vecina@example.com");
    fireEvent.press(screen.getByText("Enviar la propuesta"));
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("validation before the network", () => {
  it("refuses a malformed address with a FIELD sentence and never calls the API", async () => {
    renderScreen();
    fireEvent.changeText(screen.getByLabelText("Email del receptor"), "vecina");
    fireEvent.press(screen.getByText("Regalo"));
    fireEvent.press(screen.getByText("Enviar la propuesta"));

    await waitFor(() =>
      expect(screen.getByText("Escribí un email válido para el receptor.")).toBeTruthy(),
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("sending", () => {
  it("sends the command with NO idempotency key and hands back the new token", async () => {
    const onSent = jest.fn();
    mockSend.mockResolvedValue(ok("PTR-NEW0-0001"));
    renderScreen(onSent);

    fireEvent.changeText(screen.getByLabelText("Email del receptor"), "  Vecina@Example.COM ");
    fireEvent.press(screen.getByText("Herencia"));
    fireEvent.changeText(screen.getByLabelText("Comentario para el receptor"), " se muda ");
    fireEvent.press(screen.getByText("Enviar la propuesta"));

    await waitFor(() => expect(onSent).toHaveBeenCalledWith("PTR-NEW0-0001"));
    // TWO arguments — the session port and the command.
    expect(mockSend.mock.calls[0]).toHaveLength(2);
    expect(mockSend.mock.calls[0]?.[1]).toEqual({
      command: "initiate",
      petPublicToken: TOKEN,
      // Lowercased and trimmed by the contract's own schema, because the accept
      // side matches on this string.
      toEmail: "vecina@example.com",
      reason: "inheritance",
      note: "se muda",
    });
  });

  it("renders the server's refusal rather than guessing the rule locally", async () => {
    // A co-owner passes every other pet guard in this app and is refused here,
    // because `initiate` needs the ACTIVE `role='owner'` row. The screen has no
    // flag for that and must not invent one.
    mockSend.mockResolvedValue({ outcome: "api-error", code: "transfer_forbidden" });
    renderScreen();

    fireEvent.changeText(screen.getByLabelText("Email del receptor"), "vecina@example.com");
    fireEvent.press(screen.getByText("Regalo"));
    fireEvent.press(screen.getByText("Enviar la propuesta"));

    await waitFor(() =>
      expect(screen.getByText(/Esta propuesta no es tuya para responder/)).toBeTruthy(),
    );
  });

  it("names the one-in-flight rule when the server reports it", async () => {
    mockSend.mockResolvedValue({ outcome: "api-error", code: "transfer_pending_exists" });
    renderScreen();

    fireEvent.changeText(screen.getByLabelText("Email del receptor"), "vecina@example.com");
    fireEvent.press(screen.getByText("Regalo"));
    fireEvent.press(screen.getByText("Enviar la propuesta"));

    await waitFor(() => expect(screen.getByText(/Cancelala antes de enviar otra/)).toBeTruthy());
  });
});
