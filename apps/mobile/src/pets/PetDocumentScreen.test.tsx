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
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { RefreshControl, StyleSheet } from "react-native";

import type { OwnerPetDetailV1 } from "@dim/contract/api";

import { TOUCH_TARGET } from "../ui/theme";

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

import { IDENTITY_POKE_OUT } from "./DocumentChromeNative";
import { QR_SIZE, ownerFaceStyles } from "./OwnerFace";
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
    // Envelope field, and the issuing foot reads it from HERE rather than from
    // a section — so the foot survives an identity read that failed.
    issuedAt: "2026-09-03T08:00:00.000Z",
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
    // ONE reminder, not zero, and the difference is load-bearing since
    // 2026-09-03. Sections below the document render nothing when they are
    // ok-and-empty, so a fixture with no reminders draws no "Recordatorios"
    // card — and two tests in this file use that card as their marker for
    // "the sections are BELOW the sheet, not on it". They test face scoping,
    // not emptiness; an empty fixture would have them passing for the wrong
    // reason or failing for one. The hide-when-empty rule has its own test.
    reminders: OK({
      items: [
        {
          reminderId: "rem-1",
          title: "Antirrábica anual",
          dueAt: "2026-10-01T12:00:00.000Z",
          daysUntilDue: 28,
          variant: "vacuna",
          isReportable: true,
        },
      ],
      total: 1,
      truncated: false,
    }),
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

  it("opens on Libreta · dorso when the caller asked for that face", async () => {
    // D3 (native QA batch 1). The face is `useState`'s INITIAL value, so no turn
    // runs and the band names the back immediately — which is what makes this
    // assertion safe without the fake timers the turning tests need.
    //
    // The one caller is the writer's "Volver a la libreta": before this, saving
    // an asiento returned the reader to the FRONT of the document they had just
    // written into the back of.
    render(<PetDocumentScreen publicToken={TOKEN} initialFace="libreta" />);
    expect(
      await screen.findByText("Libreta · dorso", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    // And the turn button offers the OTHER face, so the reader is really there
    // rather than looking at a mislabelled front.
    expect(screen.getByLabelText("Girar a Credencial")).toBeOnTheScreen();
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

  it("draws the flip control as a centred square touch target", async () => {
    // It was a PILL built around a label until 2026-09-03. The label went that
    // day and what survived it did not: a `gap` separating one child from
    // nothing, and 13/16 horizontal padding balancing text that is no longer
    // there — a 47-wide box, off centre by 3 points, around a 16-point glyph.
    // Asserted on the RENDERED control rather than on the StyleSheet, so it
    // also proves the style reaches it.
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    const style = StyleSheet.flatten(screen.getByLabelText("Girar a Libreta").props.style);
    expect(style.width).toBe(TOUCH_TARGET);
    expect(style.height).toBe(TOUCH_TARGET);
    expect(style.gap).toBeUndefined();
    expect(style.paddingLeft ?? 0).toBe(style.paddingRight ?? 0);
  });

  it("navigates to the public credential route from the QR block", async () => {
    // The QR was INERT before the two-face rewrite — a control-shaped
    // decoration. Now it is the tap the web's QR block is.
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    // THE POSITIVE HALF OF THE PAIR the standalone-QR test below completes.
    // In the identity ROW the QR mirrors the photo and rises into the band; a
    // fix that removed the rise from both arms would still pass that test and
    // would take the flanking composition apart, so the rise is pinned here.
    expect(screen.getByLabelText("Ver credencial pública")).toHaveStyle({
      marginTop: -IDENTITY_POKE_OUT,
      zIndex: 3,
    });
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
    // One refusal per RENDERED section — eight sections, eight refusals, none
    // collapsed into a blank. (identity, status, compliance, alerts on the
    // face; reminders, arreglos, trámites, preñez below it.)
    //
    // Eight and not nine since 2026-09-03: `carousel` is still set to
    // UNAVAILABLE above ON PURPOSE, and this assertion is what proves the
    // section is GONE rather than merely hidden when empty. A section that
    // only skipped its empty arm would still print a refusal here, and this
    // count would still read nine. "Tus otras mascotas" does not belong on one
    // animal's credential in any state — see the note in OwnerFace.tsx.
    const refusals = await screen.findAllByText("No se pudo leer esta sección.");
    expect(refusals).toHaveLength(8);
    // The document is still a document: band, title, turn button.
    expect(
      screen.getByText("Credencial · frente", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Girar a Libreta")).toBeOnTheScreen();
    // And the QR block still stands — it renders from the token alone, and
    // the public document exists whether or not this read worked.
    expect(screen.getByLabelText("Ver credencial pública")).toBeOnTheScreen();
  });

  it("names its issuer, its jurisdiction and its date at the foot of the face", async () => {
    // The four marks that separate a credential from a card. Three are here
    // (the fourth, a seal, is the situation chip in the band); a funcionario
    // asked to accept an identification looks for exactly these.
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");

    expect(screen.getByText("República Argentina")).toBeOnTheScreen();
    expect(screen.getByText("Libreta Sanitaria Nacional · Palermo, CABA")).toBeOnTheScreen();
    expect(screen.getByText("Emitida el 03/09/2026")).toBeOnTheScreen();
  });

  it("keeps the issuing foot when the identity read failed, minus the jurisdiction", async () => {
    // `issuedAt` rides the payload ENVELOPE, so the document can still say who
    // issued it and when even though it cannot say whose animal it is. The
    // jurisdiction lives in the identity section and correctly disappears with
    // it — the line degrades, it does not invent a place.
    mockFetchOwnerPetDetail.mockResolvedValue({
      outcome: "ok",
      payload: payload({ identity: UNAVAILABLE }),
    });
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("República Argentina");

    expect(screen.getByText("Libreta Sanitaria Nacional")).toBeOnTheScreen();
    expect(screen.getByText("Emitida el 03/09/2026")).toBeOnTheScreen();
    expect(screen.queryByText(/Palermo/)).toBeNull();
  });

  it("keeps the standalone QR on the sheet when the identity read failed — it does not rise into the band", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue({
      outcome: "ok",
      payload: payload({ identity: UNAVAILABLE }),
    });
    render(<PetDocumentScreen publicToken={TOKEN} />);
    // "Pampa" never renders in this arm; the issuing foot is the marker its
    // sibling test above already uses.
    await screen.findByText("República Argentina");
    const frame = screen.getByLabelText("Ver credencial pública");
    // The rise and the stacking belong to the flanking ROW, where the band is
    // above the frame. Below a refusal box there is no band to rise into —
    // only the refusal's own text to cover, which is the message the
    // "a failure is never drawn as an absence" doctrine exists to protect.
    expect(frame).not.toHaveStyle({ marginTop: -IDENTITY_POKE_OUT });
    expect(frame).not.toHaveStyle({ zIndex: 3 });
    // …and the fix may not shrink the frame to dodge the overlap.
    expect(frame).toHaveStyle({ width: 84, height: 84 });
  });

  it("draws nothing for a section that is ok and empty, and still draws its refusal", async () => {
    // The pair this file exists to keep apart. An EMPTY section and an
    // UNAVAILABLE one used to look identical — both a titled card with a
    // sentence in it — so a healthy animal's credential was followed by four
    // boxes announcing absences, drawn with the same weight as a real failure.
    //
    // Empty renders nothing. A refusal always renders. Asserting both in one
    // test is deliberate: either rule alone can be satisfied by a mistake that
    // breaks the other (hide everything, or show everything), and only the
    // pair pins the actual behaviour.
    mockFetchOwnerPetDetail.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        reminders: OK({ items: [], total: 0, truncated: false }),
        cases: OK({ openCount: 0, truncated: false }),
        pregnancy: OK(null),
        banners: UNAVAILABLE,
      }),
    });
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");

    // Empty: gone entirely — not the title, not the sentence it used to carry.
    expect(screen.queryByText("Recordatorios")).toBeNull();
    expect(screen.queryByText("Trámites")).toBeNull();
    expect(screen.queryByText("Preñez")).toBeNull();
    expect(screen.queryByText("No está preñada.")).toBeNull();
    expect(screen.queryByText("No tiene trámites abiertos.")).toBeNull();

    // Unavailable: still there, still saying so. A server that could not
    // answer is not an animal with nothing to report.
    expect(screen.getByText("Arreglos")).toBeOnTheScreen();
    expect(screen.getByText("No se pudo leer esta sección.")).toBeOnTheScreen();
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
  it("takes Editar datos to the native edit screen, not to a caption", async () => {
    // This row USED to be the honest-disabled rendering, captioned "Desde la
    // web": same pill, muted, announced disabled. The screen behind it now
    // exists, so the caption would have become the lie the caption existed to
    // avoid. The assertion is kept pointing at the same row on purpose — it is
    // the one that fails if the destination is ever removed again without the
    // caption coming back.
    //
    // IT IS NOW REACHED THROUGH ⋯ Más (2026-09-04): the face carries four pills
    // in two columns, and the fifth was this one. The row and its destination
    // are unchanged — only where you press it from.
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    expect(screen.queryByText("Editar datos")).toBeNull();
    fireEvent.press(screen.getByText("Más"));
    fireEvent.press(screen.getByText("Editar datos"));
    expect(mockPush).toHaveBeenCalledWith(`/mascotas/${TOKEN}/editar`);
    expect(screen.queryByText("Desde la web")).toBeNull();
  });

  it("leaves the face at four action pills, two per row", async () => {
    // THE 2+2 GRID, MEASURED. Four labels being on the screen is not the
    // claim — all four were on the screen when there were FIVE pills too, so
    // an assertion that only reads labels passes on the layout it was written
    // to reject. The claim has two halves and needs both: exactly four buttons
    // INSIDE the action row, and a cell basis that puts two of them on a line.
    // Four pills at a 100% basis is 4+0+0+0; a 48% basis over five pills is
    // the 2+2+1 orphan this change removed.
    //
    // NO testID: the mobile convention is that production stays a11y-only and
    // the test reaches under it with UNSAFE_* (ui/skeleton.test.tsx states it,
    // ui/kit.test.tsx repeats it). The row is found by the style OBJECT it was
    // built from, so renaming the label of any pill cannot fake this pass.
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");

    const rows = screen.UNSAFE_getAllByProps({ style: ownerFaceStyles.actionRow });
    const actionRow = rows.at(-1);
    if (!actionRow) throw new Error("action row not rendered");
    expect(within(actionRow).getAllByRole("button")).toHaveLength(4);
    expect(StyleSheet.flatten(ownerFaceStyles.action).flexBasis).toBe("48%");

    // "Modo perdida" is the emergency and stays on the FACE by decision, not
    // by whichever four happened to be left over.
    expect(within(actionRow).getByText("Modo perdida")).toBeOnTheScreen();
  });

  it("takes Contactos de emergencia to the same screen, and leaves the rest honest", async () => {
    // The two rows share a destination because the web's two `?sheet=` rows are
    // one screen here — see the comment at the row. What matters for THIS test
    // is that the rows which are still web-only keep saying so: a live row and
    // a dead row must not look alike.
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    fireEvent.press(screen.getByText("Más"));
    expect(screen.getByText("Chapa física")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Contactos de emergencia"));
    expect(mockPush).toHaveBeenCalledWith(`/mascotas/${TOKEN}/editar`);

    mockPush.mockClear();
    expect(screen.getAllByText("Disponible en la web").length).toBeGreaterThanOrEqual(2);
    // Viaje is disabled on the WEB too, with the web's own badge.
    expect(screen.getByText("Viaje y movilidad")).toBeOnTheScreen();
    expect(screen.getByText("Próximamente")).toBeOnTheScreen();
    // The ones still marked web-only do not navigate.
    fireEvent.press(screen.getByText("Chapa física"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("reaches the photo screen from Más", async () => {
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    fireEvent.press(screen.getByText("Más"));
    fireEvent.press(screen.getByText("Foto de la mascota"));
    expect(mockPush).toHaveBeenCalledWith(`/mascotas/${TOKEN}/foto`);
  });

  // A CARETAKER SEES NEITHER ROW, and that case is asserted where the rest of
  // the per-role rules live — see "tells a caretaker how they hold the animal"
  // below. It is named here so a reader of this block does not conclude the
  // rows are unconditional now that they navigate.
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
    // web's own caretaker deny-list for the DISABLED rows only. Both rows now
    // live INSIDE the ⋯ Más sheet, so the sheet has to be open for the
    // assertion to mean anything — asserted before the press it would pass on
    // any caretaker AND on any titular, which is the vacuous shape.
    fireEvent.press(screen.getByText("Más"));
    expect(screen.queryByText("Editar datos")).toBeNull();
    expect(screen.queryByText("Contactos de emergencia")).toBeNull();
    // The server-refused entries stay offered, as they always were.
    expect(screen.getByText("Transferir la titularidad")).toBeOnTheScreen();
    // THE PHOTO STAYS, and that mirrors the server's own gate rather than the
    // titular one: `POST /pets/{token}/photo` takes any holder role, because
    // `titular-only.ts` lists photos among what a caretaker MAY do. Hiding the
    // row here would be a stricter second copy of an authorization rule.
    expect(screen.getByText("Foto de la mascota")).toBeOnTheScreen();
  });
});

describe("PetDocumentScreen — a pull re-reads the document without taking it away", () => {
  // WHAT THIS BLOCK EXISTS FOR. "Actualizar" became a pull gesture on
  // 2026-09-03, and the screen adopted `pullToRefresh` WITHOUT the
  // `mode: "initial" | "refresh"` split its four siblings (TurnosScreen,
  // SharesScreen, NotificationsScreen, TransfersScreen) already use. The two
  // consequences were both visible on a device and invisible to the suite:
  // the platform spinner ran during the FIRST read, next to "Leyendo la
  // ficha…", and a pull replaced the whole credential with that placeholder
  // instead of refreshing it underneath. A refresh that unmounts what it is
  // refreshing is a reload.

  const control = () => screen.UNSAFE_getByType(RefreshControl);
  const pull = () => fireEvent(control(), "refresh");

  /** A read that has not answered yet, plus the handle that lands it. */
  function deferredRead() {
    let land!: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      land = resolve;
    });
    return { promise, land: (value: unknown) => land(value) };
  }

  it("does not spin the platform refresher during the first read", async () => {
    const first = deferredRead();
    mockFetchOwnerPetDetail.mockReturnValueOnce(first.promise as Promise<unknown>);
    render(<PetDocumentScreen publicToken={TOKEN} />);

    // The screen's own placeholder is the first read's indicator. The
    // platform's is for the gesture, and no gesture happened.
    expect(screen.getByText("Leyendo la ficha…")).toBeOnTheScreen();
    expect(control().props.refreshing).toBe(false);

    await act(async () => {
      first.land({ outcome: "ok", payload: payload() });
    });
    expect(screen.getByText("Pampa")).toBeOnTheScreen();
  });

  it("keeps the credential on screen while a pull re-reads it, and stops when it lands", async () => {
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    expect(mockFetchOwnerPetDetail).toHaveBeenCalledTimes(1);

    const second = deferredRead();
    mockFetchOwnerPetDetail.mockReturnValueOnce(second.promise as Promise<unknown>);
    act(() => {
      pull();
    });

    // The document is STILL THERE, being refreshed underneath — the animal,
    // the sections below the card, and no placeholder.
    expect(screen.getByText("Pampa")).toBeOnTheScreen();
    expect(screen.getByText("Recordatorios")).toBeOnTheScreen();
    expect(screen.queryByText("Leyendo la ficha…")).toBeNull();
    expect(control().props.refreshing).toBe(true);
    expect(mockFetchOwnerPetDetail).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.land({ outcome: "ok", payload: payload() });
    });
    await waitFor(() => expect(control().props.refreshing).toBe(false));
    expect(screen.getByText("Pampa")).toBeOnTheScreen();
  });

  it("re-reads the libreta from the back face without taking the face away", async () => {
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    fireEvent.press(screen.getByLabelText("Girar a Libreta"));
    await screen.findByText("Libreta · dorso", { includeHiddenElements: true }, { timeout: 5000 });
    await waitFor(() => expect(mockFetchPetLibreta).toHaveBeenCalledTimes(1));

    // Both reads held in flight, so the assertions below describe the pull
    // WHILE it is happening rather than after it has finished.
    const ledger = deferredRead();
    const detail = deferredRead();
    mockFetchPetLibreta.mockReturnValueOnce(ledger.promise as Promise<unknown>);
    mockFetchOwnerPetDetail.mockReturnValueOnce(detail.promise as Promise<unknown>);
    act(() => {
      pull();
    });

    // The two faces have SEPARATE reads, and one pull has to reach both — but
    // reaching the libreta must not mean throwing it away and mounting a new
    // one. The placeholder is the witness that it was: it only renders while
    // the libreta's own state is `loading`.
    expect(screen.queryByText("Leyendo la libreta…")).toBeNull();
    // "Asentar" is the reason a person opens this face, and it is disabled
    // while the read is loading. A refresh must not take it away either.
    expect(screen.getByRole("button", { name: "Asentar" }).props.accessibilityState.disabled).toBe(
      false,
    );
    expect(mockFetchPetLibreta).toHaveBeenCalledTimes(2);
    expect(mockFetchOwnerPetDetail).toHaveBeenCalledTimes(2);

    await act(async () => {
      ledger.land({ outcome: "unreachable", detail: "not under test" });
      detail.land({ outcome: "ok", payload: payload() });
    });
    await waitFor(() => expect(control().props.refreshing).toBe(false));
  });

  it("does not read the libreta at all from the front face", async () => {
    render(<PetDocumentScreen publicToken={TOKEN} />);
    await screen.findByText("Pampa");
    act(() => {
      pull();
    });
    await waitFor(() => expect(mockFetchOwnerPetDetail).toHaveBeenCalledTimes(2));
    // The libreta face is not mounted, so there is nothing to refresh there.
    expect(mockFetchPetLibreta).not.toHaveBeenCalled();

    // THE REGRESSION: the nonce this pull bumped is still non-zero when the
    // libreta mounts later. `useFocusEffect` alone must account for the read —
    // a nonce that arrives already set is a fact about an EARLIER pull, not a
    // new one to honour, and mounting must not fire the focus read AND a
    // spurious "refresh" on top of it.
    fireEvent.press(screen.getByLabelText("Girar a Libreta"));
    await screen.findByText("Libreta · dorso", { includeHiddenElements: true }, { timeout: 5000 });
    expect(mockFetchPetLibreta).toHaveBeenCalledTimes(1);
  });
});

describe("OwnerFace — the QR frame's ring arithmetic", () => {
  it("leaves the code enough room inside the ring", () => {
    // The frame is 84 and React Native is border-box, so the 4-point surface
    // ring leaves 76 — which is `QR_SIZE`, and the web's own
    // `.ln-qr-frame svg { width: 76px }`. jest has no Yoga, so this is
    // arithmetic over the real style object rather than a measurement; what it
    // pins is that the box, the ring and the code cannot drift apart silently.
    const frame = ownerFaceStyles.qrFrame;
    expect(frame.width - 2 * frame.borderWidth).toBeGreaterThanOrEqual(QR_SIZE);
  });
});
