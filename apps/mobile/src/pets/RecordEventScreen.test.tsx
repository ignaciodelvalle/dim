// `RecordEventScreen` — the first RENDER tests in this app.
//
// WHY THEY EXIST, GIVEN 180 PASSING PURE TESTS
// ---------------------------------------------------------------------------
// The view-models are covered and the endpoints are covered; what was NOT
// covered is the wiring between them, and that is where this screen's real
// risks live. A form that validates perfectly and never calls the API, a
// refusal that arrives and renders nowhere, an idempotency key that a re-render
// quietly regenerates — every one of those is green under a pure test and
// broken on a phone.
//
// So these assert BEHAVIOUR through the rendered tree: what a person sees, what
// they can press, and what leaves the device when they do.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert, KeyboardAvoidingView, TextInput } from "react-native";

import { createNavigationFake } from "../ui/navigation-fake";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRecordPetEvent = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchOwnerPetDetail = jest.fn<(...args: unknown[]) => Promise<unknown>>();

// A REAL LISTENER REGISTRY with a stable object and a working unsubscribe — see
// `ui/navigation-fake.ts` for why both halves matter and what the stub they
// replace made invisible.
const mockNav = createNavigationFake();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useNavigation: () => mockNav.navigation,
}));

jest.mock("../api/endpoints", () => ({
  recordPetEvent: (...args: unknown[]) => mockRecordPetEvent(...args),
  // NOT OPTIONAL EVEN THOUGH ONE FORM READS IT. A module mock replaces the
  // whole module: an export left out of it is `undefined` at the call site, and
  // the attestation form would throw on mount rather than fail an assertion.
  fetchOwnerPetDetail: (...args: unknown[]) => mockFetchOwnerPetDetail(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

/**
 * The two network steps a tattoo photo takes before the asiento.
 *
 * MOCKED AT THE FLOW AND NOT AT THE ENDPOINTS, because the endpoints module is
 * already replaced whole by the mock above and adding two more exports to it
 * would spread this kind's wiring across two stubs. The flow's OWN rules are
 * covered by its own test; what these cases prove is what the SCREEN does with
 * each of its two outcomes.
 */
const mockStageTattooPhoto = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("./tattoo-photo-flow", () => ({
  stageTattooPhoto: (...args: unknown[]) => mockStageTattooPhoto(...args),
}));

import {
  type ImagePickerPort,
  resetImagePickerPort,
  setImagePickerPort,
} from "../native/image-picker-port";
import { RecordEventScreen } from "./RecordEventScreen";
import {
  RECORD_KINDS,
  WRITABLE_KINDS as WRITABLE_KIND_SET,
  kindTitle,
  recordEventCta,
} from "./record-event-view-model";

/**
 * Every kind that has a form.
 *
 * DERIVED, NOT RESTATED. This file kept a hand-written copy and it went stale
 * three times in one week — once per kind added — each time failing with
 * "expected exactly one submit control, found 0", which reads like a broken
 * screen and was a list that never learned a name. Pointing at the view-model's
 * own set makes that impossible: a kind it does not know cannot be written.
 */
const WRITABLE_KINDS = [...WRITABLE_KIND_SET];

/**
 * The primary submit, whatever this kind calls it.
 *
 * The label became per-kind with A2-alta-asentar-R05 ("Registrar vacuna",
 * "Confirmar cierre de medicación", …) and none of the cases below is ABOUT the
 * wording — they press the button that writes. Restating eleven strings across
 * twenty-seven call sites would turn a copy change into a twenty-seven-line
 * diff. The WORDING has its own case, with the literals written out, so a label
 * that regressed still turns something red.
 *
 * It fails LOUDLY when it finds none or more than one, rather than returning
 * `undefined` for an assertion two lines later to be confused by.
 */
function submitControl() {
  const nodes = WRITABLE_KINDS.flatMap((kind) => screen.queryAllByText(recordEventCta(kind).label));
  if (nodes.length !== 1) {
    throw new Error(`expected exactly one submit control on screen, found ${nodes.length}`);
  }
  return nodes[0] as NonNullable<(typeof nodes)[number]>;
}

const TOKEN = "DIM-PAMP-0001";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

/** The default answer: the append succeeded and was not a replay. */
function recorded(wasDuplicate = false) {
  return { outcome: "ok", payload: { eventId: EVENT_ID, wasDuplicate } };
}

/** The body of the single call the screen made. */
function sentBody() {
  const call = mockRecordPetEvent.mock.calls[0] as unknown[] | undefined;
  return call?.[2] as Record<string, unknown> | undefined;
}

/** The `Idempotency-Key` the screen sent, per call index. */
function sentKey(index = 0) {
  const call = mockRecordPetEvent.mock.calls[index] as unknown[] | undefined;
  return call?.[3] as string | undefined;
}

/**
 * A build that CAN choose a photo.
 *
 * INSTALLED FOR EVERY CASE BELOW, because the default port answers
 * `available: false` and the tatuaje form then draws a callout instead of a
 * form — which is correct behaviour and would silently take that kind out of
 * every loop in this file. The loops walk the whole union on purpose, so they
 * have to walk it in a build where every kind HAS a form. The unavailable build
 * gets its own cases, which reset the port first.
 *
 * It never actually picks: the cases that press the pick control assert what
 * the screen does with an outcome, not what a native module returns.
 */
/** The shape a ticket mints — `{petId}/{uuid}.{ext}`. */
const A_STAGED_PATH =
  "77777777-7777-4777-8777-777777777777/88888888-8888-4888-8888-888888888888.jpg";

const availablePicker: ImagePickerPort = {
  name: "test-available",
  available: true,
  pickImage: async () => ({ outcome: "cancelled" }),
};

beforeEach(() => {
  setImagePickerPort(availablePicker);
  mockStageTattooPhoto.mockReset();
  mockStageTattooPhoto.mockResolvedValue({ outcome: "staged", stagedPath: A_STAGED_PATH });
  mockPush.mockReset();
  mockReplace.mockReset();
  mockRecordPetEvent.mockReset();
  mockRecordPetEvent.mockResolvedValue(recorded());
  // THE PICKER READS THE PET NOW, so every test that renders it reaches this
  // mock — not only the two forms that ask for registries or a species. Before
  // this default the read resolved to `undefined` and the hook threw on
  // `.outcome`, which surfaced as two unrelated tests failing on a screen that
  // was fine.
  //
  // A PROMISE THAT NEVER LANDS, deliberately, and not a resolved failure. It
  // holds `facts` at `null` — the fourth state — so the picker draws exactly
  // the ten fixed rows and NOTHING updates state after the assertion. A
  // resolved default would settle mid-test and make every picker test carry an
  // `act` it has no reason to know about. The tests that are ABOUT the
  // conditional rows set their own read.
  mockFetchOwnerPetDetail.mockReset();
  mockFetchOwnerPetDetail.mockReturnValue(new Promise(() => {}));
});

describe("RecordEventScreen — the picker's conditional rows", () => {
  /**
   * A COMPLETE pet-detail payload, and complete on purpose.
   *
   * The fixture further down deliberately carries only the two sections the
   * FORMS read, and its own header explains why a partial one is a trap: a
   * payload missing a section the contract guarantees does not test a degraded
   * server, it tests a shape that cannot exist. The picker reads `identity` AND
   * `status`, so this one carries both — and `status` is where the honest
   * distinction lives between "no follow-up open" and "I could not find out".
   */
  function petDetail(o: {
    sex?: string | null;
    species?: string | null;
    pregnancyStatus?: string | null;
    statusDegraded?: boolean;
    /** The check-in section — its own read, so it degrades on its own. */
    checkinPending?: boolean;
    checkinDegraded?: boolean;
  }) {
    return {
      outcome: "ok",
      payload: {
        identity: { status: "ok", data: { sex: o.sex ?? "female", species: o.species ?? "dog" } },
        status: o.statusDegraded
          ? { status: "unavailable" }
          : { status: "ok", data: { pregnancyStatus: o.pregnancyStatus ?? null } },
        pppRegistries: { status: "ok", data: null },
        postAdoptionCheckin: o.checkinDegraded
          ? { status: "unavailable" }
          : { status: "ok", data: { pending: o.checkinPending ?? false } },
      },
    };
  }

  it("draws NO pregnancy row until the read lands", () => {
    // The default mock never resolves. Ten fixed rows and nothing else — a row
    // that appears late is fine, a row that vanishes under a thumb is not.
    render(<RecordEventScreen publicToken={TOKEN} />);
    expect(screen.queryByText(kindTitle("pregnancy_start"))).toBeNull();
    expect(screen.queryByText(kindTitle("pregnancy_end"))).toBeNull();
    expect(screen.queryByText(kindTitle("post_adoption_checkin"))).toBeNull();
    // NON-VACUITY: the fixed rows ARE there, so the absence above is the
    // condition and not a screen that failed to render.
    expect(screen.getByText(kindTitle("weight"))).toBeOnTheScreen();
  });

  it("adds the START row for a female with no follow-up open", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue(petDetail({ pregnancyStatus: null }));
    render(<RecordEventScreen publicToken={TOKEN} />);
    expect(await screen.findByText(kindTitle("pregnancy_start"))).toBeOnTheScreen();
    expect(screen.queryByText(kindTitle("pregnancy_end"))).toBeNull();
  });

  it("swaps to the END row while a pregnancy is in follow-up", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue(petDetail({ pregnancyStatus: "in_progress" }));
    render(<RecordEventScreen publicToken={TOKEN} />);
    expect(await screen.findByText(kindTitle("pregnancy_end"))).toBeOnTheScreen();
    expect(screen.queryByText(kindTitle("pregnancy_start"))).toBeNull();
  });

  it("adds NEITHER row for a male", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue(petDetail({ sex: "male" }));
    render(<RecordEventScreen publicToken={TOKEN} />);
    // The read has to LAND before the absence means anything, and it has no
    // visible effect here — so wait on the call rather than on a row.
    await waitFor(() => expect(mockFetchOwnerPetDetail).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(kindTitle("pregnancy_start"))).toBeNull();
    expect(screen.queryByText(kindTitle("pregnancy_end"))).toBeNull();
  });

  it("offers BOTH rows when the read failed outright", async () => {
    // Hiding a capability because a read failed is a dead end nobody can see.
    mockFetchOwnerPetDetail.mockResolvedValue({ outcome: "unreachable" });
    render(<RecordEventScreen publicToken={TOKEN} />);
    expect(await screen.findByText(kindTitle("pregnancy_start"))).toBeOnTheScreen();
    expect(screen.getByText(kindTitle("pregnancy_end"))).toBeOnTheScreen();
    // And the check-in row, for the same reason: the read knows nothing about
    // the window either.
    expect(screen.getByText(kindTitle("post_adoption_checkin"))).toBeOnTheScreen();
  });

  it("adds the CHECK-IN row while the refugio has a window open", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue(petDetail({ checkinPending: true }));
    render(<RecordEventScreen publicToken={TOKEN} />);
    expect(await screen.findByText(kindTitle("post_adoption_checkin"))).toBeOnTheScreen();
  });

  it("draws NO check-in row when nothing is pending", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue(petDetail({ checkinPending: false }));
    render(<RecordEventScreen publicToken={TOKEN} />);
    // The read has to LAND before the absence means anything — and this fixture
    // grows a pregnancy row when it does, so wait on that rather than on time.
    expect(await screen.findByText(kindTitle("pregnancy_start"))).toBeOnTheScreen();
    expect(screen.queryByText(kindTitle("post_adoption_checkin"))).toBeNull();
  });

  it("offers the check-in row when ITS section is degraded, even though the rest of the read is fine", async () => {
    // The section has its own budget and its own `unavailable`. A face whose
    // status section answered "no follow-up open" and whose window read timed
    // out must still offer the check-in: hiding it would turn a 2-second
    // hiccup on one lookup into a capability that vanished with no sentence.
    mockFetchOwnerPetDetail.mockResolvedValue(petDetail({ checkinDegraded: true }));
    render(<RecordEventScreen publicToken={TOKEN} />);
    expect(await screen.findByText(kindTitle("post_adoption_checkin"))).toBeOnTheScreen();
    // NON-VACUITY: the pregnancy rows followed THEIR facts (never pregnant →
    // start only), so the row above is the section's own state and not a
    // whole-read failure that offered everything.
    expect(screen.getByText(kindTitle("pregnancy_start"))).toBeOnTheScreen();
    expect(screen.queryByText(kindTitle("pregnancy_end"))).toBeNull();
  });

  it("opens the check-in form when its row is tapped — the web's own question, the web's own verb", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue(petDetail({ checkinPending: true }));
    render(<RecordEventScreen publicToken={TOKEN} />);
    fireEvent.press(await screen.findByText(kindTitle("post_adoption_checkin")));
    expect(screen.getByText("¿Cómo está?")).toBeOnTheScreen();
    expect(screen.getByText("Enviar el check-in")).toBeOnTheScreen();
  });

  it("offers BOTH rows when the read answered but the status section is degraded", async () => {
    // THE CASE A `pregnancyStatus: null` FIELD ALONE CANNOT EXPRESS. A degraded
    // section and an animal that was never pregnant would both read as null;
    // only the section's own status separates them, and they must diverge —
    // unknown offers both halves, never-pregnant offers only the start.
    mockFetchOwnerPetDetail.mockResolvedValue(petDetail({ statusDegraded: true }));
    render(<RecordEventScreen publicToken={TOKEN} />);
    expect(await screen.findByText(kindTitle("pregnancy_end"))).toBeOnTheScreen();
    expect(screen.getByText(kindTitle("pregnancy_start"))).toBeOnTheScreen();
  });

  it("opens the pregnancy form when its row is tapped", async () => {
    mockFetchOwnerPetDetail.mockResolvedValue(petDetail({ pregnancyStatus: "in_progress" }));
    render(<RecordEventScreen publicToken={TOKEN} />);
    fireEvent.press(await screen.findByText(kindTitle("pregnancy_end")));
    // The outcome chips are the form's own first question — a row that opened
    // the wrong form would show the picker's list again.
    expect(screen.getByText("¿Cómo terminó?")).toBeOnTheScreen();
    expect(screen.getByText("Nacieron con vida")).toBeOnTheScreen();
  });
});

describe("RecordEventScreen — the picker", () => {
  it("offers EVERY pickable kind, and says where the one that is not lives", () => {
    // DRIVEN OFF `RECORD_KINDS`, not off a list written here. The hand-written
    // list this replaced said "the nine kinds" and would have kept passing with
    // a tenth in the picker and no test touching it — which is precisely the
    // failure mode a render test exists to catch.
    render(<RecordEventScreen publicToken={TOKEN} />);
    for (const kind of RECORD_KINDS) {
      expect(screen.getByText(kindTitle(kind))).toBeOnTheScreen();
    }
    // Ending a treatment needs the asiento it ends, so it is NOT a choice here
    // — and the screen says so rather than leaving a gap a person hunts for.
    expect(screen.getByText("Terminar una medicación")).toBeOnTheScreen();
    // THE CAPTION IS THE HALF THAT ANSWERS "then where?". The row without it
    // is a dead control with no reason, so the label alone is not the
    // assertion. Reached by text and not by `getByRole("button", { name })`:
    // with no accessibilityLabel that name is derived from concatenated child
    // text, which would make this pass on the label alone.
    expect(
      screen.getByText(
        'Se hace desde el asiento del inicio del tratamiento, en la libreta: "Terminar medicación".',
      ),
    ).toBeOnTheScreen();
  });

  it("opens the form for the kind that was pressed", () => {
    render(<RecordEventScreen publicToken={TOKEN} />);
    fireEvent.press(screen.getByText("Peso"));
    expect(screen.getByLabelText("Peso (kg), obligatorio")).toBeOnTheScreen();
    expect(submitControl()).toBeOnTheScreen();
  });
});

describe("RecordEventScreen — the discard guard (A2-alta-asentar-08)", () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

  beforeEach(() => {
    alert.mockClear();
    mockNav.reset();
  });

  it("does NOT ask anything of somebody who typed nothing", () => {
    // THE CASE THAT KEPT THIS GUARD OFF EIGHT SCREENS. `draft !== emptyDraft()`
    // is true on mount — two different objects — so a naive predicate would
    // interrupt everyone who opened the form and read the first field, and a
    // guard people learn to dismiss is not there on the day it matters.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);
    expect(mockNav.pressBack().blocked).toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });

  it("asks before the back gesture discards a filled-in form", () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);
    fireEvent.changeText(screen.getByLabelText("Peso (kg), obligatorio"), "12,5");

    expect(mockNav.pressBack().blocked).toBe(true);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]?.[0]).toBe("¿Salir sin guardar?");
  });

  it("asks before 'Elegir otro tipo' remounts the form under it", () => {
    // A DISCARD THE NAVIGATOR CANNOT SEE: the screen stays and the form is
    // remounted under a new `key`, taking every field with it. `beforeRemove`
    // never fires, so nothing in the guard covers this on its own.
    render(<RecordEventScreen publicToken={TOKEN} />);
    fireEvent.press(screen.getByText("Peso"));
    fireEvent.changeText(screen.getByLabelText("Peso (kg), obligatorio"), "12,5");
    fireEvent.press(screen.getByText("Elegir otro tipo"));

    expect(alert).toHaveBeenCalledTimes(1);
    // It asked and did NOT go back on its own — the form is still there.
    expect(screen.getByLabelText("Peso (kg), obligatorio")).toBeOnTheScreen();
  });

  it("lets 'Elegir otro tipo' through untouched when nothing was typed", () => {
    render(<RecordEventScreen publicToken={TOKEN} />);
    fireEvent.press(screen.getByText("Peso"));
    fireEvent.press(screen.getByText("Elegir otro tipo"));

    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText("¿Qué querés registrar?")).toBeOnTheScreen();
  });

  it("does NOT ask once the asiento is on the server", async () => {
    // The guard fires on every navigation away, including the one this screen
    // makes itself. Two screens shipped without `allowLeave` in the batch before
    // this one and asked "¿Salir sin guardar?" about a write that had landed.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);
    fireEvent.changeText(screen.getByLabelText("Peso (kg), obligatorio"), "12,5");
    fireEvent.press(submitControl());
    await waitFor(() => expect(screen.getByText("Volver a la libreta")).toBeOnTheScreen());

    expect(mockNav.pressBack().blocked).toBe(false);
    fireEvent.press(screen.getByText("Volver a la libreta"));
    expect(alert).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalled();
  });
});

describe("RecordEventScreen — the CTA names what it writes (A2-alta-asentar-R05)", () => {
  // THE LITERALS LIVE HERE and nowhere else in this file. AGENTS.md's four-verb
  // rule forbids a bare CTA by name ("Never bare ('Aceptar', 'Guardar',
  // 'Publicar' on its own)") and this screen said "Guardar" for all eleven
  // forms while the web said "Registrar vacuna" for the same act.
  it("says 'Registrar vacuna' on a vaccination", () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="vaccination" />);
    expect(screen.getByText("Registrar vacuna")).toBeOnTheScreen();
    expect(screen.queryByText("Guardar")).toBeNull();
  });

  it("says 'Registrar peso' on a weight", () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);
    expect(screen.getByText("Registrar peso")).toBeOnTheScreen();
  });

  it("CONFIRMS a closure rather than registering an end", () => {
    // The rule names this exact case: "Closing a treatment is `Confirmar
    // cierre`, not `Registrar fin`." A screen that folded every kind into one
    // "Registrar X" would read as correct and break that reservation.
    render(
      <RecordEventScreen publicToken={TOKEN} initialKind="medication_end" sourceEventId="evt-1" />,
    );
    expect(screen.getByText("Confirmar cierre de medicación")).toBeOnTheScreen();
    expect(screen.queryByText(/Registrar fin/)).toBeNull();
  });

  it("does not call a note an observable event", () => {
    // `Registrar X` is reserved for logging something observed. A note is
    // neither observed nor confirmed, so it takes the fourth shape — a verb
    // WITH its object, which is what keeps it out of the banned bare "Guardar".
    render(<RecordEventScreen publicToken={TOKEN} initialKind="note" />);
    expect(screen.getByText("Guardar la nota")).toBeOnTheScreen();
    expect(screen.queryByText("Guardar")).toBeNull();
    expect(screen.queryByText("Registrar nota")).toBeNull();
  });
});

describe("RecordEventScreen — a weight, end to end", () => {
  it("sends what was typed, with the key, and reports success", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);

    fireEvent.changeText(screen.getByLabelText("Peso (kg), obligatorio"), "12,5");
    fireEvent.changeText(screen.getByLabelText("Fecha, obligatorio"), "20/08/2026");
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    // The comma a person types on an es-AR keyboard is a decimal point.
    expect(sentBody()).toMatchObject({ kind: "weight", kg: 12.5, occurredAt: "2026-08-20" });
    expect(sentKey()).toMatch(/^[0-9a-f-]{36}$/);

    expect(await screen.findByText("Asiento registrado.")).toBeOnTheScreen();
  });

  it("returns to the LIBRETA face, not to the front of the document", async () => {
    // D3 (native QA batch 1). "Volver a la libreta" used to call
    // `credentialRoute(token)`, which opens `PetDocumentScreen` on its default
    // face — so the person who had just written an asiento landed on the
    // CREDENTIAL side of the card and had to find the turn button to see what
    // they had done. The label promised the back; the navigation delivered the
    // front.
    //
    // The literal is spelled out rather than built with `credentialRoute`: a
    // test that re-derives its expected value from the function under test
    // agrees with a broken one.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);
    fireEvent.changeText(screen.getByLabelText("Peso (kg), obligatorio"), "12");
    fireEvent.press(submitControl());

    fireEvent.press(await screen.findByText("Volver a la libreta"));
    expect(mockReplace).toHaveBeenCalledWith(`/mascotas/${TOKEN}?face=libreta`);
  });

  it("says a REPLAY was a replay, instead of claiming a second asiento", async () => {
    mockRecordPetEvent.mockResolvedValue(recorded(true));
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);
    fireEvent.changeText(screen.getByLabelText("Peso (kg), obligatorio"), "12");
    fireEvent.press(submitControl());
    expect(await screen.findByText(/no se duplicó/i)).toBeOnTheScreen();
  });

  it("refuses a weight over the ceiling WITHOUT calling the server", async () => {
    // The contract's schema runs on this side first, which is the whole point of
    // shipping it to the client: the person gets the sentence immediately and
    // the network never sees a body that could not have been accepted.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);
    fireEvent.changeText(screen.getByLabelText("Peso (kg), obligatorio"), "500");
    fireEvent.press(submitControl());

    expect(await screen.findByText("El peso no puede superar los 120 kg.")).toBeOnTheScreen();
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });
});

describe("RecordEventScreen — the refusals a person sees", () => {
  it("renders a server refusal in the person's own words", async () => {
    mockRecordPetEvent.mockResolvedValue({ outcome: "api-error", code: "event_date_future" });
    render(<RecordEventScreen publicToken={TOKEN} initialKind="note" />);
    fireEvent.changeText(screen.getByLabelText("Nota, obligatorio"), "Comió bien.");
    fireEvent.press(submitControl());

    expect(await screen.findByText("La fecha no puede ser futura.")).toBeOnTheScreen();
    // A refused write leaves the form standing, with what was typed still in it.
    expect(submitControl()).toBeOnTheScreen();
  });

  it("renders a transport failure as a transport failure, not as a refusal", async () => {
    mockRecordPetEvent.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    render(<RecordEventScreen publicToken={TOKEN} initialKind="note" />);
    fireEvent.changeText(screen.getByLabelText("Nota, obligatorio"), "Comió bien.");
    fireEvent.press(submitControl());
    expect(await screen.findByText(/Revisá tu conexión/)).toBeOnTheScreen();
  });

  it("turns the same-day gate into a QUESTION, and resends on the SAME key", async () => {
    // It is a soft gate: nothing was written, so the retry is the same attempt
    // and must carry the same key. A fresh key here would be the app opting out
    // of the protection the header exists for.
    mockRecordPetEvent.mockResolvedValueOnce({
      outcome: "api-error",
      code: "same_day_duplicate_suspected",
    });
    render(<RecordEventScreen publicToken={TOKEN} initialKind="vaccination" />);
    fireEvent.changeText(screen.getByLabelText("Vacuna, obligatorio"), "Antirrábica");
    fireEvent.press(submitControl());

    const confirm = await screen.findByText("Sí, registrar igual");
    expect(screen.getByText(/¿Querés registrar otro\?/)).toBeOnTheScreen();

    fireEvent.press(confirm);
    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(2));
    expect(sentKey(0)).toBe(sentKey(1));
    // The second body carries the override; the first did not.
    expect(sentBody()).toMatchObject({ sameDayOverride: false });
    expect((mockRecordPetEvent.mock.calls[1] as unknown[])[2]).toMatchObject({
      sameDayOverride: true,
    });
  });
});

describe("RecordEventScreen — medicación", () => {
  it("shows the interval field only for a custom frequency", () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="medication_start" />);
    expect(screen.queryByLabelText("Cada cuántas horas, obligatorio")).toBeNull();
    fireEvent.press(screen.getByText("Personalizada"));
    expect(screen.getByLabelText("Cada cuántas horas, obligatorio")).toBeOnTheScreen();
  });

  it("joins the day and the hour into the one string the contract describes", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="medication_start" />);
    fireEvent.changeText(screen.getByLabelText("Medicamento, obligatorio"), "Amoxicilina");
    fireEvent.changeText(screen.getByLabelText("Dosis, obligatorio"), "250 mg");
    fireEvent.changeText(screen.getByLabelText("Fecha de inicio, obligatorio"), "20/08/2026");
    fireEvent.changeText(screen.getByLabelText("Primera dosis — día, obligatorio"), "20/08/2026");
    fireEvent.changeText(screen.getByLabelText("Primera dosis — hora, obligatorio"), "08:00");
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ firstDoseAt: "2026-08-20T08:00" });
  });

  it("carries the source asiento when it was opened from one", async () => {
    render(
      <RecordEventScreen
        publicToken={TOKEN}
        initialKind="medication_end"
        sourceEventId={EVENT_ID}
      />,
    );
    fireEvent.changeText(screen.getByLabelText("Fecha de fin, obligatorio"), "20/08/2026");
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({
      kind: "medication_end",
      medicationStartedEventId: EVENT_ID,
    });
    // Opened FOR one kind, so there is nothing to go back to inside the screen.
    expect(screen.queryByText("Elegir otro tipo")).toBeNull();
  });

  it("says so, instead of sending, when it was opened without the asiento it ends", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="medication_end" />);
    fireEvent.press(submitControl());
    expect(await screen.findByText(/Abrila desde su asiento/)).toBeOnTheScreen();
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });
});

describe("RecordEventScreen — the idempotency key", () => {
  it("keeps ONE key across every retry of one form", async () => {
    mockRecordPetEvent.mockResolvedValueOnce({ outcome: "api-error", code: "event_failed" });
    render(<RecordEventScreen publicToken={TOKEN} initialKind="note" />);
    fireEvent.changeText(screen.getByLabelText("Nota, obligatorio"), "Comió bien.");

    fireEvent.press(submitControl());
    await screen.findByText(/No pudimos guardar el registro/);
    fireEvent.press(submitControl());
    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(2));

    // THE POINT OF THE HEADER. If the first attempt had in fact committed before
    // the failure was reported, this retry resolves to it instead of writing a
    // second asiento onto an append-only spine.
    expect(sentKey(0)).toBe(sentKey(1));
  });

  it("gives a DIFFERENT key to a different kind, because it is a different act", async () => {
    render(<RecordEventScreen publicToken={TOKEN} />);

    fireEvent.press(screen.getByText("Nota"));
    fireEvent.changeText(screen.getByLabelText("Nota, obligatorio"), "Comió bien.");
    fireEvent.press(submitControl());
    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    const noteKey = sentKey(0);

    // Back to the picker via the finished screen is not reachable, so this
    // exercises the remount directly: a second mount is a second attempt.
    screen.unmount();
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);
    fireEvent.changeText(screen.getByLabelText("Peso (kg), obligatorio"), "12");
    fireEvent.press(submitControl());
    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(2));

    expect(sentKey(1)).not.toBe(noteKey);
  });
});

// ---------------------------------------------------------------------------
// WU-L — the four newest forms. One render test per kind, because a `switch`
// arm that returned the wrong fields would still compile and still submit.
// ---------------------------------------------------------------------------

describe("RecordEventScreen — visita veterinaria", () => {
  it("sends the motivo as the wire's `reason`, and the diagnosis as free text", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="vet_visit" />);

    fireEvent.changeText(
      screen.getByLabelText("Motivo de la visita, obligatorio"),
      "Control anual",
    );
    fireEvent.changeText(screen.getByLabelText("Fecha, obligatorio"), "20/08/2026");
    fireEvent.changeText(screen.getByLabelText("Diagnóstico"), "Otitis externa");
    fireEvent.changeText(screen.getByLabelText("Veterinario/a"), "Dra. Sosa");
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({
      kind: "vet_visit",
      reason: "Control anual",
      occurredAt: "2026-08-20",
      diagnosis: "Otitis externa",
      vetName: "Dra. Sosa",
      // Untouched: null on the wire, not "".
      clinic: null,
      notes: null,
    });
  });

  it("shows the refusal when the motivo is missing, and sends nothing", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="vet_visit" />);
    fireEvent.press(submitControl());

    await waitFor(() =>
      expect(screen.getByText("Falta el motivo de la visita.")).toBeOnTheScreen(),
    );
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });
});

describe("RecordEventScreen — información clínica", () => {
  it("sends the chosen sub-kind and the title", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="clinical_info" />);

    fireEvent.press(screen.getByText("Imágenes"));
    fireEvent.changeText(
      screen.getByLabelText("Estudio o procedimiento, obligatorio"),
      "Radiografía de tórax",
    );
    fireEvent.changeText(screen.getByLabelText("Fecha, obligatorio"), "20/08/2026");
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({
      kind: "clinical_info",
      subKind: "imaging",
      title: "Radiografía de tórax",
      occurredAt: "2026-08-20",
    });
  });

  it("offers the five owner sub-kinds and NEVER the vet-only one", () => {
    // `disease_diagnosis` is a real `clinical_info_logged` sub_kind whose writer
    // authorizes on a verified matrícula and checks no ownership at all. It is
    // absent from the contract's enum, so it cannot be rendered here — this
    // asserts the consequence a reader would otherwise have to take on faith.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="clinical_info" />);
    for (const label of ["Análisis", "Imágenes", "Cirugía", "Alergia", "Otro"]) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    expect(screen.queryByText("Diagnóstico de enfermedad")).toBeNull();
  });

  it("defaults to Análisis rather than to nothing, and the chip says so", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="clinical_info" />);
    fireEvent.changeText(
      screen.getByLabelText("Estudio o procedimiento, obligatorio"),
      "Hemograma",
    );
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ subKind: "lab_work" });
  });
});

describe("RecordEventScreen — esterilización", () => {
  it("sends the chosen procedure", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="sterilization" />);

    fireEvent.press(screen.getByText("Ovariectomía"));
    fireEvent.changeText(screen.getByLabelText("Fecha de la cirugía, obligatorio"), "20/08/2026");
    fireEvent.changeText(screen.getByLabelText("Clínica"), "Veterinaria del Parque");
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({
      kind: "sterilization",
      procedure: "spay",
      occurredAt: "2026-08-20",
      clinic: "Veterinaria del Parque",
      performedBy: null,
    });
  });
});

describe("RecordEventScreen — microchip", () => {
  it("sends the chip number and the implant date", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="microchip" />);

    fireEvent.changeText(
      screen.getByLabelText("Número de microchip, obligatorio"),
      "982000123456789",
    );
    fireEvent.changeText(screen.getByLabelText("Fecha de implantación, obligatorio"), "20/08/2026");
    fireEvent.changeText(screen.getByLabelText("Zona del cuerpo"), "Cuello, lado izquierdo");
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({
      kind: "microchip",
      chipNumber: "982000123456789",
      occurredAt: "2026-08-20",
      locationOnBody: "Cuello, lado izquierdo",
      countryCode: null,
      implantedBy: null,
    });
  });

  it("shows the refusal when the number is missing, and sends nothing", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="microchip" />);
    fireEvent.press(submitControl());

    await waitFor(() =>
      expect(screen.getByText("Falta el número de microchip.")).toBeOnTheScreen(),
    );
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });

  it("shows the immutability note on EVERY form, before the button", () => {
    // A person about to write into a national registry should read it while
    // they can still stop — and a new `switch` arm is exactly where it would
    // have been forgotten, which is why this walks the union rather than the
    // four kinds it originally listed.
    for (const kind of [...RECORD_KINDS, "medication_end" as const]) {
      const view = render(<RecordEventScreen publicToken={TOKEN} initialKind={kind} />);
      expect(screen.getByText(/no se editan ni se borran/i)).toBeOnTheScreen();
      view.unmount();
    }
  });

  it("chains the return key across every kind — one 'done', and it is the LAST field", () => {
    // forms-F6: the return key was a dead key on this form, so a person closed
    // and reopened the keyboard between six fields.
    //
    // THIS ALSO AUDITS `chainLength`, which is a hand-written count per kind
    // and the one thing about the chain that can silently drift: a count one
    // too low puts "done" on a middle field and orphans the last one; one too
    // high leaves no "done" at all. Both are invisible on a screenshot.
    for (const kind of [...RECORD_KINDS, "medication_end" as const]) {
      const view = render(<RecordEventScreen publicToken={TOKEN} initialKind={kind} />);
      const chained = screen
        .UNSAFE_getAllByType(TextInput)
        .filter((input) => input.props.returnKeyType !== undefined);

      expect(chained.length).toBeGreaterThan(0);
      const keys = chained.map((input) => input.props.returnKeyType);
      const expected = keys.map((_, index) => (index === keys.length - 1 ? "done" : "next"));
      expect({ kind, keys }).toEqual({ kind, keys: expected });
      view.unmount();
    }
  });
});

describe("RecordEventScreen — síntoma", () => {
  it("warns about the sanitary authority BEFORE the form, not after the write", () => {
    // The one asiento here whose write can leave the animal's own record. The
    // subtitle is on screen from the moment the form opens, which is while the
    // person can still decide not to send it.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="symptom" />);
    expect(screen.getByText(/autoridad sanitaria/i)).toBeOnTheScreen();
    expect(screen.getByText(/no se editan ni se borran/i)).toBeOnTheScreen();
  });

  it("offers NO date field a person must fill, unlike every other kind", () => {
    // Síntoma's onset is optional and blank; the form asks "desde cuándo (si
    // sabés)". A required date here would collect a guess.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="symptom" />);
    expect(screen.queryByLabelText("Fecha, obligatorio")).toBeNull();
    expect(screen.getByLabelText("Desde cuándo (si sabés)")).toBeOnTheScreen();
  });

  it("sends the free text alone when that is all the person knows", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="symptom" />);
    fireEvent.changeText(
      screen.getByLabelText("Qué le viste, obligatorio"),
      "Decaído, no come desde ayer",
    );
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({
      kind: "symptom",
      freeText: "Decaído, no come desde ayer",
      severity: null,
      onsetAt: null,
    });
    // NO `occurredAt`, even though `emptyDraft` pre-fills one for the other ten.
    expect(sentBody()).not.toHaveProperty("occurredAt");
    expect(sentKey()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("carries the severity and the onset when the person did know them", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="symptom" />);
    fireEvent.changeText(screen.getByLabelText("Qué le viste, obligatorio"), "Vómitos");
    fireEvent.press(screen.getByText("Grave"));
    fireEvent.changeText(screen.getByLabelText("Desde cuándo (si sabés)"), "20/08/2026");
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ severity: "severe", onsetAt: "2026-08-20" });
  });

  it("lets a severity be UNPICKED, because the web's select starts blank", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="symptom" />);
    fireEvent.changeText(screen.getByLabelText("Qué le viste, obligatorio"), "Tos");
    fireEvent.press(screen.getByText("Leve"));
    fireEvent.press(screen.getByText("Leve"));
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ severity: null });
  });

  it("refuses an empty description WITHOUT calling the server", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="symptom" />);
    fireEvent.press(submitControl());

    expect(await screen.findByText("Contá qué le viste.")).toBeOnTheScreen();
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });

  it("is reachable from the picker, in the place the day happens in", () => {
    render(<RecordEventScreen publicToken={TOKEN} />);
    fireEvent.press(screen.getByText("Síntoma"));
    expect(screen.getByLabelText("Qué le viste, obligatorio")).toBeOnTheScreen();
  });
});

describe("RecordEventScreen — check-in post-adopción, the eighteenth and last", () => {
  it("says who reads it and what it lacks BEFORE the form is filled", () => {
    // Addressed to the refugio, sent without a date, and no photo on this
    // release — three things a person is entitled to know while they can
    // still decide, and the third is the one that would otherwise read as a
    // broken form to somebody who used the web's.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="post_adoption_checkin" />);
    expect(screen.getByText(/refugio que pidió el seguimiento/i)).toBeOnTheScreen();
    expect(screen.getByText(/foto, por ahora se hace desde la web/i)).toBeOnTheScreen();
    expect(screen.getByText(/no se editan ni se borran/i)).toBeOnTheScreen();
  });

  it("sends the text alone — no date, no refugio, no attachment", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="post_adoption_checkin" />);
    fireEvent.changeText(screen.getByLabelText("¿Cómo está?"), "Come bien y ya duerme en su cama.");
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({
      kind: "post_adoption_checkin",
      notes: "Come bien y ya duerme en su cama.",
    });
    // NO `occurredAt`, even though `emptyDraft` pre-fills one: the server
    // stamps the moment of reporting, as the web action does.
    expect(sentBody()).not.toHaveProperty("occurredAt");
    expect(sentKey()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sends with nothing typed — 'estamos bien' is a real check-in, as on the web", async () => {
    // The web form has no required field; a client-side refusal here would be
    // this app inventing a rule the contract does not have.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="post_adoption_checkin" />);
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({ kind: "post_adoption_checkin", notes: null });
  });

  it("shows the server's own reason when the window closed under the person", async () => {
    // The refusal the three-state menu exists to reach: offered on a degraded
    // read, refused by the server, and the sentence names the real reason
    // rather than a generic failure.
    mockRecordPetEvent.mockResolvedValue({ outcome: "api-error", code: "checkin_no_open_window" });
    render(<RecordEventScreen publicToken={TOKEN} initialKind="post_adoption_checkin" />);
    fireEvent.press(submitControl());

    expect(
      await screen.findByText(/no tiene un check-in post-adopción pendiente/i),
    ).toBeOnTheScreen();
  });
});

describe("atestación PPP — the registry list is the jurisdiction's, and it degrades to the nation's", () => {
  /**
   * The pet-detail payload, cut down to the two sections these forms read.
   *
   * `identity` IS NOT OPTIONAL HERE even though only the death form reads it:
   * one hook serves both kinds off one request, so a fixture missing a section
   * the contract guarantees does not test a degraded server — it tests a
   * payload that cannot exist, and the throw it produces looks like a screen
   * bug. Caught the day the death form started reading the species.
   */
  function detail(section: unknown, species: string | null = "dog") {
    return {
      outcome: "ok",
      payload: {
        identity: { status: "ok", data: { species } },
        pppRegistries: section,
      },
    };
  }

  beforeEach(() => {
    mockFetchOwnerPetDetail.mockReset();
    mockRecordPetEvent.mockReset();
    // The append succeeds unless a case says otherwise — these cases are about
    // WHICH registry leaves the device, not about how a refusal renders.
    mockRecordPetEvent.mockResolvedValue(recorded());
  });

  it("offers the two national registries plus Otro registro before any read answers", async () => {
    // THE FORM IS CORRECT WITHOUT THE READ, which is the whole reason it does
    // not block on one. A pending promise is the state a person sees first, and
    // on a slow connection it is the state they fill the form in.
    mockFetchOwnerPetDetail.mockReturnValue(new Promise(() => {}));
    render(<RecordEventScreen publicToken={TOKEN} initialKind="dangerous_breed_attestation" />);

    expect(screen.getByText("CABA · Ley 4078")).toBeTruthy();
    expect(screen.getByText("Prov. Bs. As. · Ley 14.107")).toBeTruthy();
    expect(screen.getByText("Otro registro")).toBeTruthy();
  });

  it("replaces them with the jurisdiction's own list, and KEEPS Otro registro", async () => {
    // `buildRegistryOptions` appends "Otro registro" unconditionally on the web
    // and the server accepts it unconditionally; a jurisdiction naming its own
    // registries must not take that answer away from an owner registered in a
    // third province.
    mockFetchOwnerPetDetail.mockResolvedValue(
      detail({
        status: "ok",
        data: [{ id: "prov_neuquen", label: "Neuquén · Registro provincial", required: true }],
      }),
    );
    render(<RecordEventScreen publicToken={TOKEN} initialKind="dangerous_breed_attestation" />);

    await waitFor(() => expect(screen.getByText("Neuquén · Registro provincial")).toBeTruthy());
    expect(screen.getByText("Otro registro")).toBeTruthy();
    // NON-VACUITY: the national fallback is GONE, not merely joined.
    expect(screen.queryByText("CABA · Ley 4078")).toBeNull();
  });

  it("keeps the national list when the section says the read did not answer", async () => {
    // `unavailable` is not "this jurisdiction names none". Printing an empty
    // list over a read that failed would leave the person with no answer at all.
    mockFetchOwnerPetDetail.mockResolvedValue(detail({ status: "unavailable" }));
    render(<RecordEventScreen publicToken={TOKEN} initialKind="dangerous_breed_attestation" />);

    await waitFor(() => expect(mockFetchOwnerPetDetail).toHaveBeenCalledTimes(1));
    expect(screen.getByText("CABA · Ley 4078")).toBeTruthy();
  });

  it("DROPS a registry chosen from the fallback when the jurisdiction's list arrives without it", async () => {
    // THE DEFECT THIS RECONCILIATION EXISTS FOR, and it only bites on a slow
    // link. The fallback chips render, the person picks one and keeps filling
    // the form, and THEN the jurisdiction's own list replaces the options. The
    // chip row loses its highlight — scrolled out of view by now — while the
    // draft still holds `caba_4078`, so the form's own validation passes and
    // the refusal arrives from the SERVER, about a value the app itself
    // offered. Clearing it makes the draft agree with the screen, and the next
    // submit is refused HERE, in the place the person can act on it.
    let resolveDetail: (value: unknown) => void = () => {};
    mockFetchOwnerPetDetail.mockReturnValue(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );
    render(<RecordEventScreen publicToken={TOKEN} initialKind="dangerous_breed_attestation" />);

    fireEvent.press(screen.getByText("CABA · Ley 4078"));

    await act(async () => {
      resolveDetail(
        detail({
          status: "ok",
          data: [{ id: "prov_neuquen", label: "Neuquén · Registro provincial", required: true }],
        }),
      );
    });

    await waitFor(() => expect(screen.getByText("Neuquén · Registro provincial")).toBeTruthy());
    expect(screen.queryByText("CABA · Ley 4078")).toBeNull();

    fireEvent.press(submitControl());

    // THE TWO HALVES THAT MATTER: the person is told what to do, and nothing
    // left the device carrying the id the server would have refused.
    await waitFor(() =>
      expect(screen.getByText("Elegí el registro donde hiciste la atestación.")).toBeTruthy(),
    );
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });

  it("KEEPS a registry the jurisdiction's list still offers", async () => {
    // NON-VACUITY. A reconciliation that cleared the field on every list swap
    // would pass the case above and quietly throw away a valid answer. "Otro
    // registro" survives every list, which makes it the honest probe.
    let resolveDetail: (value: unknown) => void = () => {};
    mockFetchOwnerPetDetail.mockReturnValue(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );
    render(<RecordEventScreen publicToken={TOKEN} initialKind="dangerous_breed_attestation" />);

    fireEvent.press(screen.getByText("Otro registro"));

    await act(async () => {
      resolveDetail(
        detail({
          status: "ok",
          data: [{ id: "prov_neuquen", label: "Neuquén · Registro provincial", required: true }],
        }),
      );
    });

    await waitFor(() => expect(screen.getByText("Neuquén · Registro provincial")).toBeTruthy());
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ kind: "dangerous_breed_attestation", registry: "other" });
  });

  it("does NOT read the pet detail for a form with no registry field", async () => {
    // Every other kind would be paying for a pet-detail round trip it has no
    // field for.
    mockFetchOwnerPetDetail.mockResolvedValue(detail({ status: "ok", data: null }));
    render(<RecordEventScreen publicToken={TOKEN} initialKind="note" />);

    expect(mockFetchOwnerPetDetail).not.toHaveBeenCalled();
  });
});

describe("fallecimiento — el asiento que cierra el registro", () => {
  function detail(species: string | null = "dog") {
    return {
      outcome: "ok",
      payload: {
        identity: { status: "ok", data: { species } },
        pppRegistries: { status: "ok", data: null },
      },
    };
  }

  beforeEach(() => {
    mockFetchOwnerPetDetail.mockReset();
    mockRecordPetEvent.mockReset();
    mockFetchOwnerPetDetail.mockResolvedValue(detail());
    mockRecordPetEvent.mockResolvedValue(recorded());
  });

  it("avisa lo que cierra ANTES del formulario, no después de enviarlo", async () => {
    // La única subtitle de esta pantalla que advierte en vez de describir. Una
    // persona tiene derecho a saber que esto da de baja tránsitos y casos
    // mientras todavía puede decidir no hacerlo.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="death" />);
    expect(screen.getByText(/Cierra el registro del animal/)).toBeTruthy();
  });

  it("no muestra el selector de enfermedad hasta que la causa es Enfermedad", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="death" />);
    expect(screen.queryByText("Rabia (confirmada)")).toBeNull();

    fireEvent.press(screen.getByText("Enfermedad"));
    await waitFor(() => expect(screen.getByText("Rabia (confirmada)")).toBeTruthy());
  });

  it("filtra el catálogo por la especie del animal", async () => {
    // El catálogo es dog/cat-céntrico y el servidor filtra igual. Ofrecerle
    // panleucopenia felina al dueño de un perro es ofrecerle un código que su
    // propio animal no puede tener.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="death" />);
    await waitFor(() => expect(mockFetchOwnerPetDetail).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByText("Enfermedad"));

    await waitFor(() => expect(screen.getByText("Brucelosis canina (B. canis)")).toBeTruthy());
    expect(screen.queryByText("Panleucopenia felina")).toBeNull();
  });

  it("DESCARTA la enfermedad elegida cuando la causa deja de ser Enfermedad", async () => {
    // EL MISMO DEFECTO QUE EL REGISTRO PPP, en otra forma: alguien elige
    // "Enfermedad", nombra una, y después cambia a "Accidente". Sin este
    // borrado el borrador sigue cargando la enfermedad abandonada, el campo ya
    // no está en pantalla, y el servidor recibe una causa que no la pide con un
    // código que sí mandó.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="death" />);
    fireEvent.press(screen.getByText("Enfermedad"));
    await waitFor(() => expect(screen.getByText("Rabia (confirmada)")).toBeTruthy());
    fireEvent.press(screen.getByText("Rabia (confirmada)"));

    fireEvent.press(screen.getByText("Accidente"));
    await waitFor(() => expect(screen.queryByText("Rabia (confirmada)")).toBeNull());

    fireEvent.press(submitControl());
    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ kind: "death", cause: "accident", diseaseCode: null });
  });

  it("DESCARTA los datos de la clínica cuando deja de haber fallecido en una", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="death" />);
    fireEvent.press(screen.getByText("No la sé"));
    // `getAllByText` Y NO `getByText`: esta pantalla tiene TRES filas sí/no a la
    // vez y las tres dicen lo mismo. La primera en orden de dibujo es
    // "¿Falleció en una veterinaria?" — y que haga falta contarlas es la razón
    // por la que el grupo de `Choice` ahora lleva su pregunta como etiqueta
    // accesible.
    fireEvent.press(screen.getAllByText("Sí")[0] as never);

    // La veterinaria aparece, y con ella la pregunta del contacto.
    await waitFor(() => expect(screen.getByText("Nombre de la veterinaria")).toBeTruthy());
    fireEvent.press(screen.getByText("No me contactó"));
    await waitFor(() => expect(screen.getByText("¿Decidió sin consultarte?")).toBeTruthy());

    // Y al decir que NO falleció en una veterinaria, las tres se van juntas.
    fireEvent.press(screen.getAllByText("No")[0] as never);
    await waitFor(() => expect(screen.queryByText("Nombre de la veterinaria")).toBeNull());
    expect(screen.queryByText("¿Decidió sin consultarte?")).toBeNull();

    fireEvent.press(submitControl());
    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({
      kind: "death",
      deathAtClinic: false,
      clinicName: null,
      vetContactedOwner: null,
      vetDecidedAlone: false,
    });
  });

  it("refuse sin causa, ANTES de llamar al servidor", async () => {
    // `cause` no tiene default a propósito: "no la sé" es una respuesta que la
    // persona da, no una que el formulario dé por ella.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="death" />);
    fireEvent.press(submitControl());

    await waitFor(() => expect(screen.getByText("Elegí la causa del fallecimiento.")).toBeTruthy());
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });

  it("DESCARTA una enfermedad que el catálogo deja de ofrecer cuando llega la especie", async () => {
    // EL MISMO DEFECTO QUE EL REGISTRO PPP, REINTRODUCIDO EL MISMO DÍA tres
    // pantallas más abajo — y peor, porque acá el valor que sobrevive dispara
    // una señal a la autoridad sanitaria. En un link lento el selector muestra
    // el catálogo entero antes de saber la especie; alguien con un PERRO elige
    // "Toxoplasmosis", que es de gatos y es NOTIFICABLE. Cuando llega la
    // especie el chip desaparece y, sin este borrado, el borrador lo conserva.
    let resolveDetail: (value: unknown) => void = () => {};
    mockFetchOwnerPetDetail.mockReturnValue(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );
    render(<RecordEventScreen publicToken={TOKEN} initialKind="death" />);
    fireEvent.press(screen.getByText("Enfermedad"));

    // Sin especie todavía, el catálogo entero — incluidas las de gato.
    await waitFor(() => expect(screen.getByText("Panleucopenia felina")).toBeTruthy());
    fireEvent.press(screen.getByText("Panleucopenia felina"));

    await act(async () => {
      resolveDetail(detail("dog"));
    });

    await waitFor(() => expect(screen.queryByText("Panleucopenia felina")).toBeNull());
    fireEvent.press(submitControl());

    // Se refuta ACÁ, sobre un campo que la persona puede volver a contestar —
    // en vez de escribir en el libro una enfermedad que ese animal no puede
    // tener, en una fila que después nadie puede corregir.
    await waitFor(() => expect(screen.getByText("Elegí de qué enfermedad murió.")).toBeTruthy());
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });

  it("CONSERVA una enfermedad que la especie sí admite", async () => {
    // NO-VACUIDAD: un borrado incondicional pasaría el caso de arriba y le
    // tiraría la respuesta a quien contestó bien.
    let resolveDetail: (value: unknown) => void = () => {};
    mockFetchOwnerPetDetail.mockReturnValue(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );
    render(<RecordEventScreen publicToken={TOKEN} initialKind="death" />);
    fireEvent.press(screen.getByText("Enfermedad"));
    await waitFor(() => expect(screen.getByText("Rabia (confirmada)")).toBeTruthy());
    fireEvent.press(screen.getByText("Rabia (confirmada)"));

    await act(async () => {
      resolveDetail(detail("dog"));
    });

    await waitFor(() => expect(mockFetchOwnerPetDetail).toHaveBeenCalledTimes(1));
    fireEvent.press(submitControl());
    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ kind: "death", diseaseCode: "rabies_confirmed" });
  });

  it("manda la causa y la fecha en el asiento más simple que se puede escribir", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="death" />);
    fireEvent.press(screen.getByText("Natural / vejez"));
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ kind: "death", cause: "natural" });
  });
});

describe("tatuaje — el asiento que necesita una foto", () => {
  /** A build with no `expo-image-picker`, which is every build shipped so far. */
  function withoutPicker() {
    resetImagePickerPort();
  }

  it("EN UNA BUILD SIN SELECTOR no dibuja el formulario ni un botón que no puede funcionar", () => {
    // La regla del puerto, la misma que sigue `PetPhotoScreen`: leer
    // `available` ANTES de dibujar un control. La foto es obligatoria en las dos
    // puertas, así que un formulario sin manera de elegirla sólo podría terminar
    // en un refusal — y buscar un botón que no puede andar es el callejón que
    // esta pantalla existe para evitar.
    withoutPicker();
    render(<RecordEventScreen publicToken={TOKEN} initialKind="tattoo" />);

    expect(
      screen.getByText("Todavía no se puede registrar un tatuaje desde la app"),
    ).toBeOnTheScreen();
    expect(screen.getByText(/la foto se carga desde la web/i)).toBeOnTheScreen();
    // NI EL CAMPO DEL CÓDIGO NI EL BOTÓN DE ENVIAR.
    expect(screen.queryByText("Código del tatuaje")).not.toBeOnTheScreen();
    expect(screen.queryByText(recordEventCta("tattoo").label)).not.toBeOnTheScreen();
  });

  it("con selector disponible dibuja el formulario y dice que la foto es obligatoria", () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="tattoo" />);
    expect(screen.getByText(/la foto es obligatoria/i)).toBeOnTheScreen();
    expect(screen.getByText("Elegir la foto del tatuaje")).toBeOnTheScreen();
    expect(screen.getByText(recordEventCta("tattoo").label)).toBeOnTheScreen();
  });

  it("REFUSES sin foto y no manda nada — el contrato nombra el paso que falta", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="tattoo" />);
    fireEvent.changeText(screen.getByLabelText("Código del tatuaje, obligatorio"), "ABC-1234");
    fireEvent.press(submitControl());

    await waitFor(() => expect(screen.getByText(/falta la foto del tatuaje/i)).toBeOnTheScreen());
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });

  it("SUBE LA FOTO AL ELEGIRLA, no al enviar", async () => {
    // Que la persona se entere de que la subida falló mientras todavía está
    // mirando la foto, y que un campo mal cargado no cueste megabytes.
    setImagePickerPort({
      name: "test-picks",
      available: true,
      pickImage: async () => ({
        outcome: "picked",
        bytes: new Uint8Array([0xff, 0xd8, 0xff]),
        contentType: "image/jpeg",
        previewUri: null,
      }),
    });
    render(<RecordEventScreen publicToken={TOKEN} initialKind="tattoo" />);

    await act(async () => {
      fireEvent.press(screen.getByText("Elegir la foto del tatuaje"));
    });

    expect(mockStageTattooPhoto).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Foto lista")).toBeOnTheScreen();
    // NO DICE "LISTO" A SECAS: los bytes están arriba, el asiento no existe.
    expect(screen.getByText(/se va a guardar junto con el asiento/i)).toBeOnTheScreen();
    // Y todavía no salió ningún asiento.
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });

  it("manda el asiento con el stagedPath que dejó la subida", async () => {
    setImagePickerPort({
      name: "test-picks",
      available: true,
      pickImage: async () => ({
        outcome: "picked",
        bytes: new Uint8Array([0xff, 0xd8, 0xff]),
        contentType: "image/jpeg",
        previewUri: null,
      }),
    });
    render(<RecordEventScreen publicToken={TOKEN} initialKind="tattoo" />);

    fireEvent.changeText(screen.getByLabelText("Código del tatuaje, obligatorio"), "ABC-1234");
    await act(async () => {
      fireEvent.press(screen.getByText("Elegir la foto del tatuaje"));
    });
    fireEvent.press(submitControl());

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(mockRecordPetEvent.mock.calls[0]?.[2]).toMatchObject({
      kind: "tattoo",
      tattooCode: "ABC-1234",
      stagedPath: A_STAGED_PATH,
    });
  });

  it("muestra la razón cuando la subida falla, y sigue sin foto", async () => {
    setImagePickerPort({
      name: "test-picks",
      available: true,
      pickImage: async () => ({
        outcome: "picked",
        bytes: new Uint8Array([0xff, 0xd8, 0xff]),
        contentType: "image/jpeg",
        previewUri: null,
      }),
    });
    mockStageTattooPhoto.mockResolvedValue({
      outcome: "failed",
      failure: { stage: "put", kind: "expired" },
    });
    render(<RecordEventScreen publicToken={TOKEN} initialKind="tattoo" />);

    await act(async () => {
      fireEvent.press(screen.getByText("Elegir la foto del tatuaje"));
    });

    expect(screen.getByText(/el permiso venció/i)).toBeOnTheScreen();
    expect(screen.queryByText("Foto lista")).not.toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------------------
// The two kinds the app can now NAVIGATE to
// ---------------------------------------------------------------------------

/**
 * WHAT THESE ADD over the form tests above. `death` and
 * `dangerous_breed_attestation` have had working forms on this screen for
 * weeks; what they did not have was a door. The doors landed on 2026-09-10
 * (`OwnerFace`'s ⋯ Más row and its compliance card), and these cases pin the
 * other half of that wiring: a `kind` arriving from the route really renders
 * THAT form, and not the picker.
 *
 * EVERY EXPECTED STRING IS A LITERAL. `kindTitle("death")` as an expectation
 * would pass against a screen that rendered the wrong form with the right
 * heading, and would keep passing if both moved together.
 */
describe("las dos puertas nuevas — el kind del link rinde SU formulario", () => {
  beforeEach(() => {
    mockFetchOwnerPetDetail.mockReset();
    // No read answers: both forms are correct without one (the death form's
    // disease list and the attestation's registries degrade to their national
    // defaults), and a pending promise is the state a person sees first.
    mockFetchOwnerPetDetail.mockReturnValue(new Promise(() => {}));
  });

  it("kind=death rinde el formulario de fallecimiento y no el selector", () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="death" />);

    expect(screen.getByText("Fallecimiento")).toBeOnTheScreen();
    // The subtitle that warns before the form rather than after it.
    expect(screen.getByText(/Cierra el registro del animal/)).toBeOnTheScreen();
    // The CTA is the death form's own verb — "Asentar", never "Registrar".
    expect(screen.getByText("Asentar el fallecimiento")).toBeOnTheScreen();
    // NON-VACUITY: the PICKER is what a dropped kind renders, and its rows are
    // absent here. "Peso" is a fixed row of `RECORD_KINDS` and is not a field,
    // a label or a chip on the death form.
    expect(screen.queryByText("Peso")).toBeNull();
  });

  it("kind=dangerous_breed_attestation rinde la atestación y no el selector", () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="dangerous_breed_attestation" />);

    expect(screen.getByText("Atestación de raza peligrosa")).toBeOnTheScreen();
    expect(screen.getByText("Registrar la atestación")).toBeOnTheScreen();
    expect(screen.queryByText("Peso")).toBeNull();
  });

  it("un kind que esta app no conoce cae en el selector, con las dos filas fijas", () => {
    // THE CONTROL FOR THE TWO ABOVE. It proves "Peso" really is what the picker
    // shows and the two assertions above are not passing against a screen that
    // renders nothing at all.
    render(<RecordEventScreen publicToken={TOKEN} initialKind={null} />);

    expect(screen.getByText("Peso")).toBeOnTheScreen();
    expect(screen.queryByText("Asentar el fallecimiento")).toBeNull();
    // AND THE PICKER STILL DOES NOT OFFER EITHER OF THE TWO. They are
    // contextual acts; a person scrolling for "Peso" must not pass
    // "Fallecimiento" on the way.
    expect(screen.queryByText("Fallecimiento")).toBeNull();
    expect(screen.queryByText("Atestación de raza peligrosa")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The keyboard, on the longest form in the app (open-work row 11)
//
// `kit.test.tsx` pins the RULE and the primitive. This pins the thing the row
// was actually about: `asentar` is ~700 lines of fields, it is one of the two
// screens the fix exists for, and a keyboard-avoidance regression here is
// invisible to every test that renders the kit in isolation. A screen that
// dropped `keyboardAvoiding`, or a `Screen` that stopped honouring it, leaves
// the field being typed on under the IME on Android and nothing goes red
// anywhere else.
// ---------------------------------------------------------------------------

describe("RecordEventScreen — the form types above the keyboard", () => {
  it("mounts a KeyboardAvoidingView with a real behavior on a multi-field form", () => {
    // `medication_start` is the longest of the owner kinds — its own
    // `returnKeyChainLength` is 4 typed fields plus the chip rows.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="medication_start" />);
    // The form is really here, not a picker or a refusal: without this the
    // assertion below could be sweeping an empty screen clean.
    expect(screen.getAllByDisplayValue("").length).toBeGreaterThan(2);

    const avoider = screen.UNSAFE_getByType(KeyboardAvoidingView);
    // `undefined` is the defect, and it is a legal prop value — so the check is
    // membership in the two arms that DO something, not "is defined".
    expect(["padding", "height"]).toContain(avoider.props.behavior);
  });
});
