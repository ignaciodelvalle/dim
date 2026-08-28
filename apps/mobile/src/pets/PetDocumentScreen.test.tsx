// `PetDocumentScreen` — the two-faced document, rendered.
//
// WHAT A RENDER TEST ADDS that the view-model tests cannot: the view-model
// proves an unavailable section keeps its refusal copy, and proves nothing
// about whether the SCREEN prints it. These are the per-section honesty tests
// the recomposition had to keep alive, plus the fences the two-face rewrite
// added: both face labels exist, the turn button carries its toggle state,
// org/caretaker viewers keep their viewer line, the QR block actually
// navigates (it was inert before), and a control with no native destination
// is drawn disabled — never as a working-looking button, never omitted.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import type { OwnerPetDetailV1 } from "@dim/contract/api";

const mockPush = jest.fn();
const mockFetchOwnerPetDetail = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchPetLibreta = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  // The real one runs its callback when the screen gains focus. Under test
  // there is no navigator, so the honest stand-in is "run it on mount".
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("../api/endpoints", () => ({
  fetchOwnerPetDetail: (...args: unknown[]) => mockFetchOwnerPetDetail(...args),
  fetchPetLibreta: (...args: unknown[]) => mockFetchPetLibreta(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

import { PetDocumentScreen } from "./PetDocumentScreen";

const TOKEN = "DIM-PAMP-0001";

const OK = <T,>(data: T) => ({ status: "ok", data }) as const;
const UNAVAILABLE = { status: "unavailable" } as const;

function payload(overrides: Partial<Record<string, unknown>> = {}): OwnerPetDetailV1 {
  return {
    payloadVersion: 1,
    publicToken: TOKEN,
    viewer: { role: "owner", isTitular: true },
    identity: OK({
      name: "Pampa",
      species: "Perro",
      sex: "female",
      breed: "Mestiza",
      breedLine: "Mestiza · Hembra · 2 años · Perro",
      photoUrl: null,
      jurisdictionProvince: "CABA",
      jurisdictionLocality: "Palermo",
      tags: [{ key: "loc", label: "Palermo, CABA" }],
    }),
    status: OK({
      petStatus: "active",
      ringStatus: "ok",
      situation: null,
      memorial: null,
      pregnancyStatus: null,
    }),
    alerts: OK({ items: [] }),
    compliance: OK({
      cards: [{ key: "rabies", label: "Vacuna antirrábica", state: "Vigente" }],
      summary: { total: 1, ok: 1, label: "1 de 1 al día" },
      worstTone: "ok",
      worstIsUnknown: false,
    }),
    reminders: OK({ items: [], total: 0 }),
    banners: OK({ caretaker: null, rehome: null, transit: null }),
    cases: OK({ openCount: 0, truncated: false }),
    pregnancy: OK(null),
    carousel: OK({ items: [], total: 0 }),
    ...overrides,
  } as unknown as OwnerPetDetailV1;
}

beforeEach(() => {
  mockPush.mockReset();
  mockFetchOwnerPetDetail.mockReset();
  mockFetchPetLibreta.mockReset();
  mockFetchOwnerPetDetail.mockResolvedValue({ outcome: "ok", payload: payload() });
  mockFetchPetLibreta.mockResolvedValue({ outcome: "unreachable", detail: "not under test" });
});

describe("PetDocumentScreen — two faces of one document", () => {
  it("opens on Credencial · frente, with the animal on it", async () => {
    render(<PetDocumentScreen publicToken={TOKEN} />);
    expect(await screen.findByText("Pampa")).toBeOnTheScreen();
    expect(
      screen.getByText("Credencial · frente", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.getByText("Cumplimiento")).toBeOnTheScreen();
    expect(screen.getByText("AL DÍA")).toBeOnTheScreen();
    // The registration badge, beside the name, gender-agreed.
    expect(screen.getByText("Registrada")).toBeOnTheScreen();
  });

  it("turns to Libreta · dorso and back, and the button carries the toggle state", async () => {
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");

    const turn = screen.getByLabelText("Girar a Libreta");
    expect(turn.props.accessibilityState.selected).toBe(false);

    fireEvent.press(turn);
    expect(screen.getByText("Libreta · dorso", { includeHiddenElements: true })).toBeOnTheScreen();
    const turnBack = screen.getByLabelText("Girar a Credencial");
    expect(turnBack.props.accessibilityState.selected).toBe(true);

    fireEvent.press(turnBack);
    expect(
      screen.getByText("Credencial · frente", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it("navigates to the public credential route from the QR block", async () => {
    // The QR was INERT before the two-face rewrite — a control-shaped
    // decoration. Now it is the tap the web's QR block is.
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    fireEvent.press(screen.getByLabelText("Ver credencial pública"));
    expect(mockPush).toHaveBeenCalledWith(`/mascotas/${TOKEN}/credencial`);
  });

  it("reaches the public credential from Más too", async () => {
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    fireEvent.press(screen.getByText("Más"));
    // "Credencial pública" appears twice — the QR block's caption above, and
    // the Más row that just expanded below it. The row is the last match.
    const matches = screen.getAllByText("Credencial pública");
    const moreRow = matches.at(-1);
    if (moreRow === undefined) throw new Error("Más row not rendered");
    fireEvent.press(moreRow);
    expect(mockPush).toHaveBeenCalledWith(`/mascotas/${TOKEN}/credencial`);
  });

  it("paints the server-decided situation on the band chip, on BOTH faces", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        status: OK({
          petStatus: "lost",
          ringStatus: "alerta",
          situation: { key: "perdida", tone: "alerta", icon: "perdida", label: "Perdida" },
          memorial: null,
          pregnancyStatus: null,
        }),
      }),
    });
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    expect(screen.getByText("Perdida")).toBeOnTheScreen();
    // The chip must survive the flip — on the back face it is the only
    // textual carrier of the state.
    fireEvent.press(screen.getByLabelText("Girar a Libreta"));
    expect(screen.getByText("Perdida")).toBeOnTheScreen();
  });
});

describe("PetDocumentScreen — a failure is never drawn as an absence", () => {
  it("renders every unavailable section as its refusal, not as an empty view", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        identity: UNAVAILABLE,
        status: UNAVAILABLE,
        alerts: UNAVAILABLE,
        compliance: UNAVAILABLE,
        reminders: UNAVAILABLE,
        banners: UNAVAILABLE,
        cases: UNAVAILABLE,
        pregnancy: UNAVAILABLE,
        carousel: UNAVAILABLE,
      }),
    });
    render(<PetDocumentScreen publicToken={TOKEN} />);
    // One refusal per section — nine sections, nine refusals, none collapsed
    // into a blank. (identity, status, compliance, alerts on the face;
    // reminders, arreglos, trámites, preñez, carousel below it.)
    const refusals = await screen.findAllByText("No se pudo leer esta sección.");
    expect(refusals).toHaveLength(9);
    // The document is still a document: band, title, turn button.
    expect(
      screen.getByText("Credencial · frente", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Girar a Libreta")).toBeOnTheScreen();
    // And the QR block still stands — it renders from the token alone, and
    // the public document exists whether or not this read worked.
    expect(screen.getByLabelText("Ver credencial pública")).toBeOnTheScreen();
  });

  it("says the whole read failed inside the card, and keeps the turn usable", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue({
      outcome: "api-error",
      code: "temporarily_unavailable",
    });
    render(<PetDocumentScreen publicToken={TOKEN} />);
    expect(await screen.findByText(/El servidor no pudo responder/)).toBeOnTheScreen();
    // The libreta face has its own read; a failed front face must not
    // imprison the reader on it.
    fireEvent.press(screen.getByLabelText("Girar a Libreta"));
    expect(screen.getByText("Libreta · dorso", { includeHiddenElements: true })).toBeOnTheScreen();
  });
});

describe("PetDocumentScreen — controls with no native destination are drawn honest", () => {
  it("draws Editar datos as itself, visibly unavailable, with the reason", async () => {
    // Omitting it would make the card look like a different product — the
    // thing the PO ordered against. Drawing it live would be a lie in the
    // shape of a control. So: same row, announced disabled, honest caption.
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    const label = screen.getByText("Editar datos");
    expect(screen.getByText("Desde la web")).toBeOnTheScreen();
    fireEvent.press(label);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("marks the web-only Más rows with where they ARE available", async () => {
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    fireEvent.press(screen.getByText("Más"));
    expect(screen.getByText("Chapa física")).toBeOnTheScreen();
    expect(screen.getByText("Contactos de emergencia")).toBeOnTheScreen();
    expect(screen.getAllByText("Disponible en la web").length).toBeGreaterThanOrEqual(3);
    // Viaje is disabled on the WEB too, with the web's own badge.
    expect(screen.getByText("Viaje y movilidad")).toBeOnTheScreen();
    expect(screen.getByText("Próximamente")).toBeOnTheScreen();
    // None of them navigates.
    fireEvent.press(screen.getByText("Chapa física"));
    fireEvent.press(screen.getByText("Contactos de emergencia"));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("PetDocumentScreen — the viewer line survives, per role", () => {
  it("tells an org member how they hold the animal, and narrows their footer", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue({
      outcome: "ok",
      payload: payload({ viewer: { role: "org_member", isTitular: false } }),
    });
    render(<PetDocumentScreen publicToken={TOKEN} />);
    expect(await screen.findByText("La ves como miembro de la organización")).toBeOnTheScreen();
    // The web's org action row: Compartir, and nothing owner-only.
    expect(screen.getByText("Compartir")).toBeOnTheScreen();
    expect(screen.queryByText("Anotar")).toBeNull();
    expect(screen.queryByText("Editar datos")).toBeNull();
    expect(screen.queryByText("Más")).toBeNull();
  });

  it("tells a caretaker how they hold the animal, and hides the dead rows the web hides", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue({
      outcome: "ok",
      payload: payload({ viewer: { role: "caretaker", isTitular: false } }),
    });
    render(<PetDocumentScreen publicToken={TOKEN} />);
    expect(await screen.findByText("Sos su cuidador")).toBeOnTheScreen();
    // A dead control has no server to refuse it, so the client mirrors the
    // web's own caretaker deny-list for the DISABLED rows only.
    expect(screen.queryByText("Editar datos")).toBeNull();
    fireEvent.press(screen.getByText("Más"));
    expect(screen.queryByText("Contactos de emergencia")).toBeNull();
    // The server-refused entries stay offered, as they always were.
    expect(screen.getByText("Transferir la titularidad")).toBeOnTheScreen();
  });
});
