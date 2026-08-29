// The native privacidad screen — the two Ley 25.326 rights, from the phone.
//
// WHAT THESE CASES STAND IN FOR
// ---------------------------------------------------------------------------
// Every one of them is a way this screen could be wrong that nothing else in the
// app would notice, and three of them are ways it could be wrong AND still look
// right to whoever built it:
//
//   · the destructive button live before the motivo is usable → somebody taps
//     "Confirmar borrado" with "no" in the box, the server refuses, and the
//     screen has taught them that the red button is a suggestion;
//   · the confirm button on screen with no disclosure step in front of it → the
//     irreversible control sits under a thumb aiming at "Pedir mis datos";
//   · a failed erasure that clears the form or navigates → the person is left
//     unable to tell whether their account still exists;
//   · the export's VALUES painted onto the screen → the summary stops being a
//     table of contents and becomes a second rendering of the PII it decided
//     not to render.
//
// The store is mocked at `session-store`, not at the endpoint: what this screen
// owes the user is that pressing the red button runs the one function that both
// erases AND drops the session. Mocking one layer deeper would let a version
// that called the endpoint directly — and left the keychain holding a token for
// a deleted account — pass every case here.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockFetchExport = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockEraseAccount = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockShare = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../api/endpoints", () => ({
  fetchMySubjectDataExport: (...args: unknown[]) => mockFetchExport(...args),
}));

jest.mock("../auth/session-store", () => ({
  eraseAccount: (...args: unknown[]) => mockEraseAccount(...args),
  sessionPort: { accessToken: async () => "t" },
}));

// SPIED, NOT `jest.mock`ed. `Share` is a namespace object on the `react-native`
// barrel and the module that backs it has moved between RN versions; a path
// mock silently stops intercepting on an upgrade and the case would go green
// against the real share sheet doing nothing under test. Replacing the method on
// the object the screen actually imports cannot miss.
import { Share } from "react-native";

import { PrivacyScreen } from "./PrivacyScreen";

const READY_EXPORT = {
  payloadVersion: 1 as const,
  issuedAt: "2026-08-29T12:00:00.000Z",
  staleAfter: "2026-08-29T12:00:00.000Z",
  subject: { schema_version: 5, pets: [{}, {}], dni_last4: "4821" },
};

beforeEach(() => {
  mockFetchExport.mockReset();
  mockEraseAccount.mockReset();
  mockShare.mockReset();
  mockShare.mockResolvedValue({ action: "sharedAction" });
  (Share as unknown as { share: unknown }).share = mockShare;
});

describe("art. 14 — descargar mis datos", () => {
  it("does not call the endpoint until the person asks", () => {
    // A screen that fetched on mount would mint a full PII export — and spend
    // the tightest budget on this project — for anybody who merely opened
    // ajustes and scrolled.
    render(<PrivacyScreen />);

    expect(mockFetchExport).not.toHaveBeenCalled();
  });

  it("draws the file's SHAPE, and none of its values", () => {
    mockFetchExport.mockResolvedValue({ outcome: "ok", payload: READY_EXPORT });
    render(<PrivacyScreen />);

    fireEvent.press(screen.getByText("Pedir mis datos"));

    return waitFor(() => {
      expect(screen.getByText("Pets")).toBeTruthy();
      expect(screen.getByText("2 registros")).toBeTruthy();
      // The scalar is reported as present and NEVER printed.
      expect(screen.queryByText("4821")).toBeNull();
    });
  });

  it("hands the raw JSON to the OS share sheet, unaltered", async () => {
    mockFetchExport.mockResolvedValue({ outcome: "ok", payload: READY_EXPORT });
    render(<PrivacyScreen />);

    fireEvent.press(screen.getByText("Pedir mis datos"));
    await waitFor(() => expect(screen.getByText("Compartir el archivo")).toBeTruthy());
    fireEvent.press(screen.getByText("Compartir el archivo"));

    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith({
        message: JSON.stringify(READY_EXPORT.subject, null, 2),
      });
    });
  });

  it("says why it failed instead of leaving the button spinning", async () => {
    mockFetchExport.mockResolvedValue({ outcome: "unreachable" });
    render(<PrivacyScreen />);

    fireEvent.press(screen.getByText("Pedir mis datos"));

    await waitFor(() => {
      expect(screen.getByText("No pudimos conectarnos. Revisá tu conexión.")).toBeTruthy();
    });
  });
});

describe("art. 16 — eliminar mi cuenta", () => {
  it("keeps the destructive control behind a disclosure step", () => {
    // The mutation this catches: rendering the motivo field and "Confirmar
    // borrado" straight away. The irreversible control would then sit on the
    // first paint of a screen people open to download a file.
    render(<PrivacyScreen />);

    expect(screen.getByText("Quiero eliminar mi cuenta")).toBeTruthy();
    expect(screen.queryByText("Confirmar borrado")).toBeNull();
  });

  it("says the supresión is definitive, in those words", () => {
    render(<PrivacyScreen />);

    expect(screen.getByText(/No hay forma de deshacerlo/)).toBeTruthy();
  });

  it("names what SURVIVES it, rather than implying everything goes", () => {
    render(<PrivacyScreen />);

    expect(screen.getByText(/se conservan como historial de salud del animal/)).toBeTruthy();
  });

  it("refuses to run with a motivo under the contract's minimum", () => {
    // The mutation this catches: dropping the `reasonUsable` guard on the
    // button. The server would refuse anyway — with `erasure_reason_required` —
    // but a live red button that answers with an error is how a person learns
    // that the destructive control is negotiable.
    render(<PrivacyScreen />);
    fireEvent.press(screen.getByText("Quiero eliminar mi cuenta"));
    fireEvent.changeText(screen.getByLabelText("Motivo, obligatorio"), "no");

    fireEvent.press(screen.getByText("Confirmar borrado"));

    expect(mockEraseAccount).not.toHaveBeenCalled();
  });

  it("runs the store's erase — the one call that also drops the session", async () => {
    mockEraseAccount.mockResolvedValue({ ok: true });
    render(<PrivacyScreen />);
    fireEvent.press(screen.getByText("Quiero eliminar mi cuenta"));
    fireEvent.changeText(screen.getByLabelText("Motivo, obligatorio"), "ya no uso miMAR");

    fireEvent.press(screen.getByText("Confirmar borrado"));

    await waitFor(() => expect(mockEraseAccount).toHaveBeenCalledWith("ya no uso miMAR"));
  });

  it("keeps the person on the form when the erasure is refused, and says why", async () => {
    mockEraseAccount.mockResolvedValue({ ok: false, message: "No pudimos completar la baja." });
    render(<PrivacyScreen />);
    fireEvent.press(screen.getByText("Quiero eliminar mi cuenta"));
    fireEvent.changeText(screen.getByLabelText("Motivo, obligatorio"), "ya no uso miMAR");

    fireEvent.press(screen.getByText("Confirmar borrado"));

    await waitFor(() => {
      expect(screen.getByText("No pudimos completar la baja.")).toBeTruthy();
      // The motivo survives the refusal — retyping it is not part of the price.
      expect(screen.getByLabelText("Motivo, obligatorio").props.value).toBe("ya no uso miMAR");
    });
  });

  it("cancelling clears the motivo and puts the disclosure step back", () => {
    render(<PrivacyScreen />);
    fireEvent.press(screen.getByText("Quiero eliminar mi cuenta"));
    fireEvent.changeText(screen.getByLabelText("Motivo, obligatorio"), "ya no uso miMAR");

    fireEvent.press(screen.getByText("Cancelar"));

    expect(screen.getByText("Quiero eliminar mi cuenta")).toBeTruthy();
    expect(screen.queryByText("Confirmar borrado")).toBeNull();
  });
});
