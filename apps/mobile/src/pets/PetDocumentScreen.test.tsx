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
import { TURN_PERSPECTIVE } from "./document-turn";

const TOKEN = "DIM-PAMP-0001";

// THE WIRING, READ OFF THE RENDERED TREE. `useDocumentTurn` and `TurningSheet`
// are two halves of one feature and only the hook leaves a trace in behaviour:
// with the `<TurningSheet turn={turn}>` wrapper deleted from this screen the
// faces still swap on their ~205ms delay, so every other test in this file —
// and every test in DocumentTurn.test.tsx, which mounts the sheet itself —
// stays green while the credential stops turning altogether. The only witness
// is the transform on the tree, so these helpers go and find it.

/** A node of the tree as `toJSON` hands it back. */
type RenderedNode = {
  readonly type: string;
  readonly props: Record<string, unknown>;
  readonly children: readonly unknown[] | null;
};

function isNode(value: unknown): value is RenderedNode {
  return typeof value === "object" && value !== null && "props" in value && "children" in value;
}

/** The node's `transform` array, or null when it has no style with one. */
function transformOf(node: RenderedNode): readonly unknown[] | null {
  const { style } = node.props;
  if (typeof style !== "object" || style === null) return null;
  const { transform } = style as { transform?: unknown };
  return Array.isArray(transform) ? transform : null;
}

/** The stage the credential turns on: the one view carrying the web's
 *  perspective. Found by that value rather than by component type, so it is the
 *  rendered result being asserted and not the shape of the JSX. */
function stagesIn(node: unknown, found: RenderedNode[] = []): RenderedNode[] {
  if (Array.isArray(node)) {
    for (const child of node) stagesIn(child, found);
    return found;
  }
  if (!isNode(node)) return found;
  const isStage = transformOf(node)?.some(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as { perspective?: unknown }).perspective === TURN_PERSPECTIVE,
  );
  if (isStage === true) found.push(node);
  if (node.children !== null) stagesIn(node.children, found);
  return found;
}

/** Every string rendered inside a node — what the reader sees on that sheet. */
function textUnder(node: unknown, found: string[] = []): string[] {
  if (typeof node === "string") {
    found.push(node);
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) textUnder(child, found);
    return found;
  }
  if (isNode(node) && node.children !== null) textUnder(node.children, found);
  return found;
}

/** The single stage, or a failure that says what is missing rather than a
 *  `undefined` two assertions later. */
function theStage(): RenderedNode {
  const stages = stagesIn(screen.toJSON());
  expect(stages).toHaveLength(1);
  const stage = stages[0];
  if (stage === undefined) throw new Error("the document is not mounted on a turning sheet");
  return stage;
}

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
    // The toggle answers the press AT ONCE, off the requested face — while the
    // band, which names the face actually painted, is still on the front for
    // the ~205ms the sheet spends turning. The two disagreeing here is the
    // design (see DocumentChromeNative's header), not a lag.
    expect(screen.getByLabelText("Girar a Libreta").props.accessibilityState.selected).toBe(true);

    // Same 5s room as every other post-turn wait in this file: the turn is
    // ~485ms of real timers, and the default 1000ms is only ~2× that on a box
    // shared with every other agent's suite.
    await screen.findByText("Libreta · dorso", { includeHiddenElements: true }, { timeout: 5000 });
    const turnBack = screen.getByLabelText("Girar a Credencial");
    expect(turnBack.props.accessibilityState.selected).toBe(true);

    fireEvent.press(turnBack);
    expect(
      await screen.findByText(
        "Credencial · frente",
        { includeHiddenElements: true },
        {
          timeout: 5000,
        },
      ),
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
    // textual carrier of the state. It must also survive the TURN itself: the
    // chip lives in the chrome, which rotates with the sheet rather than being
    // rebuilt at the swap.
    fireEvent.press(screen.getByLabelText("Girar a Libreta"));
    expect(screen.getByText("Perdida")).toBeOnTheScreen();
    await screen.findByText("Libreta · dorso", { includeHiddenElements: true }, { timeout: 5000 });
    expect(screen.getByText("Perdida")).toBeOnTheScreen();
  });
});

describe("PetDocumentScreen — the credential is mounted ON the sheet that turns", () => {
  it("puts the whole card on the stage, and leaves the sections below it off", async () => {
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");

    const stage = theStage();
    // Flat and facing the reader at rest, on the web's perspective. The
    // perspective is what makes the turn read as a sheet standing up in space
    // rather than a horizontal squash, and it lives in the same transform
    // array as the rotation because that is where React Native reads it.
    expect(transformOf(stage)).toEqual([{ perspective: TURN_PERSPECTIVE }, { rotateY: "0deg" }]);

    // The band and the face are ON it: this is one document turning over, not a
    // decorated container next to one.
    const onTheSheet = textUnder(stage);
    expect(onTheSheet).toContain("Credencial · frente");
    expect(onTheSheet).toContain("Pampa");
    // And the footer sections are NOT: they belong to the face but are drawn
    // below the card, and a sheet that rotated them too would tip the whole
    // screen over instead of the credential.
    expect(onTheSheet).not.toContain("Recordatorios");
    expect(screen.getByText("Recordatorios")).toBeOnTheScreen();
  });

  it("keeps the libreta on that same stage once the document has turned", async () => {
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");

    fireEvent.press(screen.getByLabelText("Girar a Libreta"));
    await screen.findByText("Libreta · dorso", { includeHiddenElements: true }, { timeout: 5000 });

    // Still exactly one stage, now carrying the other face — the sheet is the
    // thing that persists across the turn, and the libreta is on it rather
    // than beside it.
    //
    // NO ANGLE IS ASSERTED HERE, and the reason is worth writing down: the
    // libreta appears AT THE SWAP, with the sheet edge-on, and the tree reads
    // `-87deg` at this instant because the jump has just landed and phase 2
    // runs on the native driver without re-rendering. That is the choreography
    // working, but it is a fact about when this line runs rather than about
    // what the screen owes the reader, so it stays out of the assertion.
    const stage = theStage();
    expect(textUnder(stage)).toContain("Libreta · dorso");
  });
});

describe("PetDocumentScreen — the sheet and what sits under it turn together", () => {
  it("keeps the front face's footer until the document has actually turned", async () => {
    // "Recordatorios" and its siblings belong to the credencial face but are
    // drawn BELOW the card, outside the rotating sheet. If they keyed off the
    // requested face they would disappear ~205ms before the card showed the
    // libreta — one screen changing in two visible waves. ("Actualizar" cannot
    // be the marker here: BOTH faces offer one, so it never goes away.)
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");

    fireEvent.press(screen.getByLabelText("Girar a Libreta"));
    expect(screen.getByText("Recordatorios")).toBeOnTheScreen();

    await screen.findByText("Libreta · dorso", { includeHiddenElements: true }, { timeout: 5000 });
    expect(screen.queryByText("Recordatorios")).toBeNull();
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
    expect(
      await screen.findByText(
        "Libreta · dorso",
        { includeHiddenElements: true },
        {
          timeout: 5000,
        },
      ),
    ).toBeOnTheScreen();
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
