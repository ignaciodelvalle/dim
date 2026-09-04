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
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRecordPetEvent = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

jest.mock("../api/endpoints", () => ({
  recordPetEvent: (...args: unknown[]) => mockRecordPetEvent(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

import { RecordEventScreen } from "./RecordEventScreen";
import { RECORD_KINDS, kindTitle } from "./record-event-view-model";

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

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockRecordPetEvent.mockReset();
  mockRecordPetEvent.mockResolvedValue(recorded());
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
    expect(screen.getByText("Guardar")).toBeOnTheScreen();
  });
});

describe("RecordEventScreen — a weight, end to end", () => {
  it("sends what was typed, with the key, and reports success", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);

    fireEvent.changeText(screen.getByLabelText("Peso (kg), obligatorio"), "12,5");
    fireEvent.changeText(screen.getByLabelText("Fecha, obligatorio"), "2026-08-20");
    fireEvent.press(screen.getByText("Guardar"));

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    // The comma a person types on an es-AR keyboard is a decimal point.
    expect(sentBody()).toMatchObject({ kind: "weight", kg: 12.5, occurredAt: "2026-08-20" });
    expect(sentKey()).toMatch(/^[0-9a-f-]{36}$/);

    expect(await screen.findByText("Asiento registrado.")).toBeOnTheScreen();
  });

  it("says a REPLAY was a replay, instead of claiming a second asiento", async () => {
    mockRecordPetEvent.mockResolvedValue(recorded(true));
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);
    fireEvent.changeText(screen.getByLabelText("Peso (kg), obligatorio"), "12");
    fireEvent.press(screen.getByText("Guardar"));
    expect(await screen.findByText(/no se duplicó/i)).toBeOnTheScreen();
  });

  it("refuses a weight over the ceiling WITHOUT calling the server", async () => {
    // The contract's schema runs on this side first, which is the whole point of
    // shipping it to the client: the person gets the sentence immediately and
    // the network never sees a body that could not have been accepted.
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);
    fireEvent.changeText(screen.getByLabelText("Peso (kg), obligatorio"), "500");
    fireEvent.press(screen.getByText("Guardar"));

    expect(await screen.findByText("El peso no puede superar los 120 kg.")).toBeOnTheScreen();
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });
});

describe("RecordEventScreen — the refusals a person sees", () => {
  it("renders a server refusal in the person's own words", async () => {
    mockRecordPetEvent.mockResolvedValue({ outcome: "api-error", code: "event_date_future" });
    render(<RecordEventScreen publicToken={TOKEN} initialKind="note" />);
    fireEvent.changeText(screen.getByLabelText("Nota, obligatorio"), "Comió bien.");
    fireEvent.press(screen.getByText("Guardar"));

    expect(await screen.findByText("La fecha no puede ser futura.")).toBeOnTheScreen();
    // A refused write leaves the form standing, with what was typed still in it.
    expect(screen.getByText("Guardar")).toBeOnTheScreen();
  });

  it("renders a transport failure as a transport failure, not as a refusal", async () => {
    mockRecordPetEvent.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    render(<RecordEventScreen publicToken={TOKEN} initialKind="note" />);
    fireEvent.changeText(screen.getByLabelText("Nota, obligatorio"), "Comió bien.");
    fireEvent.press(screen.getByText("Guardar"));
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
    fireEvent.press(screen.getByText("Guardar"));

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
    fireEvent.changeText(screen.getByLabelText("Fecha de inicio, obligatorio"), "2026-08-20");
    fireEvent.changeText(screen.getByLabelText("Primera dosis — día, obligatorio"), "2026-08-20");
    fireEvent.changeText(screen.getByLabelText("Primera dosis — hora, obligatorio"), "08:00");
    fireEvent.press(screen.getByText("Guardar"));

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
    fireEvent.changeText(screen.getByLabelText("Fecha de fin, obligatorio"), "2026-08-20");
    fireEvent.press(screen.getByText("Guardar"));

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
    fireEvent.press(screen.getByText("Guardar"));
    expect(await screen.findByText(/Abrila desde su asiento/)).toBeOnTheScreen();
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });
});

describe("RecordEventScreen — the idempotency key", () => {
  it("keeps ONE key across every retry of one form", async () => {
    mockRecordPetEvent.mockResolvedValueOnce({ outcome: "api-error", code: "event_failed" });
    render(<RecordEventScreen publicToken={TOKEN} initialKind="note" />);
    fireEvent.changeText(screen.getByLabelText("Nota, obligatorio"), "Comió bien.");

    fireEvent.press(screen.getByText("Guardar"));
    await screen.findByText(/No pudimos guardar el registro/);
    fireEvent.press(screen.getByText("Guardar"));
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
    fireEvent.press(screen.getByText("Guardar"));
    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    const noteKey = sentKey(0);

    // Back to the picker via the finished screen is not reachable, so this
    // exercises the remount directly: a second mount is a second attempt.
    screen.unmount();
    render(<RecordEventScreen publicToken={TOKEN} initialKind="weight" />);
    fireEvent.changeText(screen.getByLabelText("Peso (kg), obligatorio"), "12");
    fireEvent.press(screen.getByText("Guardar"));
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
    fireEvent.changeText(screen.getByLabelText("Fecha, obligatorio"), "2026-08-20");
    fireEvent.changeText(screen.getByLabelText("Diagnóstico"), "Otitis externa");
    fireEvent.changeText(screen.getByLabelText("Veterinario/a"), "Dra. Sosa");
    fireEvent.press(screen.getByText("Guardar"));

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
    fireEvent.press(screen.getByText("Guardar"));

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
    fireEvent.changeText(screen.getByLabelText("Fecha, obligatorio"), "2026-08-20");
    fireEvent.press(screen.getByText("Guardar"));

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
    fireEvent.press(screen.getByText("Guardar"));

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ subKind: "lab_work" });
  });
});

describe("RecordEventScreen — esterilización", () => {
  it("sends the chosen procedure", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="sterilization" />);

    fireEvent.press(screen.getByText("Ovariectomía"));
    fireEvent.changeText(screen.getByLabelText("Fecha de la cirugía, obligatorio"), "2026-08-20");
    fireEvent.changeText(screen.getByLabelText("Clínica"), "Veterinaria del Parque");
    fireEvent.press(screen.getByText("Guardar"));

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
    fireEvent.changeText(screen.getByLabelText("Fecha de implantación, obligatorio"), "2026-08-20");
    fireEvent.changeText(screen.getByLabelText("Zona del cuerpo"), "Cuello, lado izquierdo");
    fireEvent.press(screen.getByText("Guardar"));

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
    fireEvent.press(screen.getByText("Guardar"));

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
    fireEvent.press(screen.getByText("Guardar"));

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
    fireEvent.changeText(screen.getByLabelText("Desde cuándo (si sabés)"), "2026-08-20");
    fireEvent.press(screen.getByText("Guardar"));

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ severity: "severe", onsetAt: "2026-08-20" });
  });

  it("lets a severity be UNPICKED, because the web's select starts blank", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="symptom" />);
    fireEvent.changeText(screen.getByLabelText("Qué le viste, obligatorio"), "Tos");
    fireEvent.press(screen.getByText("Leve"));
    fireEvent.press(screen.getByText("Leve"));
    fireEvent.press(screen.getByText("Guardar"));

    await waitFor(() => expect(mockRecordPetEvent).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ severity: null });
  });

  it("refuses an empty description WITHOUT calling the server", async () => {
    render(<RecordEventScreen publicToken={TOKEN} initialKind="symptom" />);
    fireEvent.press(screen.getByText("Guardar"));

    expect(await screen.findByText("Contá qué le viste.")).toBeOnTheScreen();
    expect(mockRecordPetEvent).not.toHaveBeenCalled();
  });

  it("is reachable from the picker, in the place the day happens in", () => {
    render(<RecordEventScreen publicToken={TOKEN} />);
    fireEvent.press(screen.getByText("Síntoma"));
    expect(screen.getByLabelText("Qué le viste, obligatorio")).toBeOnTheScreen();
  });
});
