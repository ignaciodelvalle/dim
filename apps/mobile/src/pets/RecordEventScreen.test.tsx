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
  it("offers the five kinds a person can choose, and says where the sixth lives", () => {
    render(<RecordEventScreen publicToken={TOKEN} />);
    expect(screen.getByText("Vacuna")).toBeOnTheScreen();
    expect(screen.getByText("Peso")).toBeOnTheScreen();
    expect(screen.getByText("Antiparasitario")).toBeOnTheScreen();
    expect(screen.getByText("Medicación · inicio")).toBeOnTheScreen();
    expect(screen.getByText("Nota")).toBeOnTheScreen();
    // Ending a treatment needs the asiento it ends, so it is NOT a choice here
    // — and the screen says so rather than leaving a gap a person hunts for.
    expect(screen.getByText("Terminar una medicación")).toBeOnTheScreen();
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
