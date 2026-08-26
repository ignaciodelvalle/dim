// `CaretakerGrantScreen` — where somebody takes responsibility for an animal
// that is not theirs.
//
// WHAT THESE HAVE TO PROVE, beyond "it renders"
// ---------------------------------------------------------------------------
//   1. EVERY CONTROL COMES FROM `capabilities`, and the two are INDEPENDENT. The
//      combination that matters is a LAPSED invitation: `canAccept` false,
//      `canReject` still true. A screen that reasoned from `status` or from
//      `expired` would take away the only control that can clear the row.
//   2. THE SCOPE IS THE SERVER'S SENTENCE, both halves, and it is on the screen
//      that agrees to it. A version that listed only the permissions would be
//      recruiting caretakers on a half-truth.
//   3. CONSENT STARTS OFF AND ONLY TRAVELS WHEN GIVEN. It publishes a person's
//      contact on an unauthenticated page; silence is never consent.
//   4. ACCEPTING TAKES TWO TAPS.
//   5. A FAILED COMMAND RE-READS. Without an idempotency key, a refusal after a
//      timeout may mean the first attempt landed.
//   6. AN ACCEPTED ARRANGEMENT OFFERS NO WAY OUT, AND SAYS WHO CAN END IT. A
//      caretaker cannot step down from the web either; a button here would be a
//      native-only power over somebody else's arrangement.
//   7. A TOKEN THIS CALLER IS NOT A PARTY TO IS NOT CALLED "NON-EXISTENT" — and
//      here that matters twice over, because the hub carries OPEN grants only, so
//      a genuine invitation of theirs that was already answered is absent too.

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
import { CaretakerGrantScreen } from "./CaretakerGrantScreen";

const TOKEN = "CG-0123456789abcdef0123456789abcdef";
const SCOPE =
  "Podés cargar eventos médicos, notas y marcar perdido/encontrado. No podés transferir, publicar en adopción ni cambiar datos de identidad.";

function aGrant(over: Partial<MyCaretakerGrantV1> = {}): MyCaretakerGrantV1 {
  return {
    grantToken: TOKEN,
    status: "pending",
    direction: "incoming",
    pet: { publicToken: "DIM-PAMP-0001", name: "Pampa", species: "dog" },
    counterpartyName: "Vecina",
    caretakerEmail: "yo@example.com",
    startsAt: "2026-09-01T03:00:00.000Z",
    endsAt: "2026-09-16T02:59:59.999Z",
    note: null,
    expired: false,
    scopeSentence: SCOPE,
    capabilities: { canAccept: true, canReject: true, canCancel: false, canRevoke: false },
    ...over,
  };
}

function hubWith(grant: MyCaretakerGrantV1): MyCaretakerGrantsV1 {
  const incoming = grant.direction === "incoming";
  return {
    payloadVersion: 1,
    issuedAt: "2026-08-26T00:00:00.000Z",
    staleAfter: "2026-08-26T00:01:00.000Z",
    incoming: incoming ? [grant] : [],
    outgoing: incoming ? [] : [grant],
  };
}

function loads(grant: MyCaretakerGrantV1) {
  mockFetch.mockResolvedValue({ outcome: "ok", payload: hubWith(grant) });
}

const noop = () => {};

beforeEach(() => {
  mockFetch.mockReset();
  mockSend.mockReset();
});

describe("finding the invitation", () => {
  it("does not call a token it cannot find 'non-existent'", async () => {
    // TWO different things put a caller here — an invitation that is not theirs,
    // and a real one of theirs that was already answered, withdrawn or swept,
    // because the hub carries OPEN grants only. The copy has to cover both.
    loads(aGrant({ grantToken: "CG-otro" }));
    render(<CaretakerGrantScreen grantToken={TOKEN} onAccepted={noop} />);

    await waitFor(() => expect(screen.getByText(/no sea para vos/)).toBeTruthy());
    expect(screen.queryByText(/no existe/i)).toBeNull();
  });

  it("shows the failure, not an absence, when the read itself failed", async () => {
    mockFetch.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    render(<CaretakerGrantScreen grantToken={TOKEN} onAccepted={noop} />);
    await waitFor(() => expect(screen.getByText(/No pudimos conectarnos/)).toBeTruthy());
  });
});

describe("the scope is on the screen that agrees to it", () => {
  it("renders BOTH halves, from the server's own sentence", async () => {
    loads(aGrant());
    render(<CaretakerGrantScreen grantToken={TOKEN} onAccepted={noop} />);

    await waitFor(() => expect(screen.getByText(SCOPE)).toBeTruthy());
    // The refusal half is the one a half-truth would drop.
    expect(SCOPE).toContain("No podés transferir");
  });
});

describe("the controls come from capabilities", () => {
  it("offers both answers on an open invitation", async () => {
    loads(aGrant());
    render(<CaretakerGrantScreen grantToken={TOKEN} onAccepted={noop} />);

    await waitFor(() => expect(screen.getByText("Aceptar el cuidado")).toBeTruthy());
    expect(screen.getByText("Rechazar la invitación")).toBeTruthy();
  });

  it("KEEPS reject and drops accept on a lapsed period", async () => {
    // The writers' own asymmetry: `acceptCaretakerGrant` refuses `endsAt <= now`,
    // `rejectCaretakerGrant` has no expiry term at all. Taking the control away
    // would leave a row sitting in somebody's list with no way to clear it.
    loads(
      aGrant({
        expired: true,
        capabilities: { canAccept: false, canReject: true, canCancel: false, canRevoke: false },
      }),
    );
    render(<CaretakerGrantScreen grantToken={TOKEN} onAccepted={noop} />);

    await waitFor(() => expect(screen.getByText("Rechazar la invitación")).toBeTruthy());
    expect(screen.queryByText("Aceptar el cuidado")).toBeNull();
  });

  it("offers NO way out of an accepted arrangement, and says who can end it", async () => {
    // A caretaker cannot step down from the web either — `withdrawCaretakerGrantAction`
    // exists and nothing calls it. A button here would be a native-only power.
    loads(
      aGrant({
        status: "accepted",
        capabilities: { canAccept: false, canReject: false, canCancel: false, canRevoke: false },
      }),
    );
    render(<CaretakerGrantScreen grantToken={TOKEN} onAccepted={noop} />);

    await waitFor(() =>
      expect(screen.getByText(/la finalización la hace el titular/)).toBeTruthy(),
    );
    expect(screen.queryByText(/Rechazar/)).toBeNull();
    expect(screen.queryByText(/Aceptar/)).toBeNull();
  });
});

describe("accepting", () => {
  it("takes two taps", async () => {
    loads(aGrant());
    mockSend.mockResolvedValue({
      outcome: "ok",
      payload: {
        command: "accept",
        changed: true,
        grantToken: TOKEN,
        petPublicToken: "DIM-PAMP-0001",
        inviteeNeedsAccount: null,
      },
    });
    render(<CaretakerGrantScreen grantToken={TOKEN} onAccepted={noop} />);

    await waitFor(() => expect(screen.getByText("Aceptar el cuidado")).toBeTruthy());
    fireEvent.press(screen.getByText("Aceptar el cuidado"));
    expect(mockSend).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByText("Confirmar el cuidado")).toBeTruthy());
    fireEvent.press(screen.getByText("Confirmar el cuidado"));
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  });

  it("sends NO consent flag unless the person said yes", async () => {
    // KEY 2 of the two-key model. It publishes a name and a phone on an
    // unauthenticated credential page, so the default is off and absence is what
    // the contract reads as "not consented".
    loads(aGrant());
    mockSend.mockResolvedValue({
      outcome: "ok",
      payload: {
        command: "accept",
        changed: true,
        grantToken: TOKEN,
        petPublicToken: null,
        inviteeNeedsAccount: null,
      },
    });
    render(<CaretakerGrantScreen grantToken={TOKEN} onAccepted={noop} />);

    await waitFor(() => expect(screen.getByText("Aceptar el cuidado")).toBeTruthy());
    fireEvent.press(screen.getByText("Aceptar el cuidado"));
    await waitFor(() => expect(screen.getByText("Confirmar el cuidado")).toBeTruthy());
    fireEvent.press(screen.getByText("Confirmar el cuidado"));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend.mock.calls[0]?.[1]).toEqual({ command: "accept", grantToken: TOKEN });
  });

  it("sends it when the person answers Sí", async () => {
    loads(aGrant());
    mockSend.mockResolvedValue({
      outcome: "ok",
      payload: {
        command: "accept",
        changed: true,
        grantToken: TOKEN,
        petPublicToken: null,
        inviteeNeedsAccount: null,
      },
    });
    render(<CaretakerGrantScreen grantToken={TOKEN} onAccepted={noop} />);

    await waitFor(() => expect(screen.getByText("Aceptar el cuidado")).toBeTruthy());
    fireEvent.press(screen.getByText("Aceptar el cuidado"));
    await waitFor(() => expect(screen.getByText("Sí")).toBeTruthy());
    fireEvent.press(screen.getByText("Sí"));
    fireEvent.press(screen.getByText("Confirmar el cuidado"));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend.mock.calls[0]?.[1]).toEqual({
      command: "accept",
      grantToken: TOKEN,
      publicContactConsent: true,
    });
  });

  it("carries no idempotency key, because the endpoint does not read one", async () => {
    loads(aGrant());
    mockSend.mockResolvedValue({
      outcome: "ok",
      payload: {
        command: "accept",
        changed: true,
        grantToken: TOKEN,
        petPublicToken: null,
        inviteeNeedsAccount: null,
      },
    });
    render(<CaretakerGrantScreen grantToken={TOKEN} onAccepted={noop} />);

    await waitFor(() => expect(screen.getByText("Aceptar el cuidado")).toBeTruthy());
    fireEvent.press(screen.getByText("Aceptar el cuidado"));
    await waitFor(() => expect(screen.getByText("Confirmar el cuidado")).toBeTruthy());
    fireEvent.press(screen.getByText("Confirmar el cuidado"));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    // Two arguments and no third: the session port and the command body. Sending a
    // key would claim a guarantee the server has not made.
    expect(mockSend.mock.calls[0]).toHaveLength(2);
  });
});

describe("a failed command", () => {
  it("shows the server's sentence and RE-READS", async () => {
    // Without an idempotency key, a refusal after a timeout may mean the first
    // attempt landed. The list is the only thing that can say which.
    loads(aGrant());
    mockSend.mockResolvedValue({
      outcome: "api-error",
      code: "caretaker_already_resolved",
      retryAfterSeconds: null,
    });
    render(<CaretakerGrantScreen grantToken={TOKEN} onAccepted={noop} />);

    await waitFor(() => expect(screen.getByText("Rechazar la invitación")).toBeTruthy());
    fireEvent.press(screen.getByText("Rechazar la invitación"));
    await waitFor(() => expect(screen.getByText("Confirmar el rechazo")).toBeTruthy());
    fireEvent.press(screen.getByText("Confirmar el rechazo"));

    await waitFor(() => expect(screen.getByText(/Actualizá la pantalla/)).toBeTruthy());
    // One read on mount, one after the refusal.
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("says who to ask when the granter is no longer the titular", async () => {
    // The one refusal on this surface where re-reading is a dead end: the
    // invitation still reads pending and the person who sent it cannot re-send it.
    loads(aGrant());
    mockSend.mockResolvedValue({
      outcome: "api-error",
      code: "caretaker_granter_not_titular",
      retryAfterSeconds: null,
    });
    render(<CaretakerGrantScreen grantToken={TOKEN} onAccepted={noop} />);

    await waitFor(() => expect(screen.getByText("Aceptar el cuidado")).toBeTruthy());
    fireEvent.press(screen.getByText("Aceptar el cuidado"));
    await waitFor(() => expect(screen.getByText("Confirmar el cuidado")).toBeTruthy());
    fireEvent.press(screen.getByText("Confirmar el cuidado"));

    await waitFor(() => expect(screen.getByText(/titular actual/)).toBeTruthy());
  });
});
