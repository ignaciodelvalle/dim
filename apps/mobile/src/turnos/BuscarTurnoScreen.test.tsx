// `BuscarTurnoScreen` — the picker and the results.
//
// WHAT THESE HAVE TO PROVE, beyond "it renders"
// ---------------------------------------------------------------------------
//   1. THE PICKER IS THE SERVER'S ANSWER, not this screen's state. An
//      unrecognised `service_kind` comes back `serviceKind: null`, and the screen
//      must fall through to the catalogue — never print the raw code as a
//      heading, which is the defect QA 2026-08-08 (S3-F07) found on the web.
//   2. A FAILED READ IS NOT AN EMPTY CATALOGUE. "No hay turnos" over an outage
//      sends somebody away from a vaccination drive that is running.
//   3. AN EMPTY RESULT NAMES THE PLACE IT LOOKED IN. Otherwise it reads as "this
//      service does not exist anywhere".
//   4. A GUESSED JURISDICTION SAYS SO. The web draws the prefill into its filter
//      form where it reads as something the person chose.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockSearch = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("./turnos-api", () => ({
  fetchAppointmentSearch: (...args: unknown[]) => mockSearch(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

import type { AppointmentSearchV1, BookableOfferingV1 } from "@dim/contract/api";

import { BuscarTurnoScreen } from "./BuscarTurnoScreen";

function anOffering(over: Partial<BookableOfferingV1> = {}): BookableOfferingV1 {
  return {
    offeringToken: "SVO-7K2M-9QX4",
    displayName: "Campaña antirrábica — Plaza San Martín",
    description: null,
    serviceKind: "vaccination_rabies",
    serviceKindLabel: "Vacunación antirrábica",
    provider: {
      kind: "organization",
      displayName: "Zoonosis Bariloche",
      phone: null,
      locality: null,
    },
    durationMinutes: 15,
    priceArs: null,
    coverageLabel: "San Carlos de Bariloche",
    slotsInWindow: 3,
    nextSlotAt: "2026-09-03T13:30:00.000Z",
    ...over,
  };
}

function payload(over: Partial<AppointmentSearchV1> = {}): AppointmentSearchV1 {
  return {
    payloadVersion: 1,
    issuedAt: "2026-08-30T12:00:00.000Z",
    staleAfter: "2026-08-30T12:00:30.000Z",
    serviceKinds: [
      { code: "vaccination_rabies", label: "Vacunación antirrábica" },
      { code: "sterilization_dog_male", label: "Castración perro macho" },
    ],
    serviceKind: null,
    appliedProvince: null,
    appliedLocality: null,
    jurisdictionSource: "none",
    results: [],
    windowDays: 7,
    ...over,
  };
}

beforeEach(() => {
  mockSearch.mockReset();
});

describe("the service picker", () => {
  it("draws the catalogue the SERVER sent, not twelve labels of its own", () => {
    // A client that hard-coded the catalogue would print a stale label the day a
    // kind is added, and `service_kinds.ts` lives inside the Next app where a
    // phone cannot reach it.
    mockSearch.mockResolvedValue({ outcome: "ok", payload: payload() });
    render(<BuscarTurnoScreen onOpenOffering={jest.fn()} />);

    return waitFor(() => {
      expect(screen.getByText("Vacunación antirrábica")).toBeTruthy();
      expect(screen.getByText("Castración perro macho")).toBeTruthy();
      expect(screen.getByText("Indicá qué servicio buscás.")).toBeTruthy();
    });
  });

  it("asks again with the chosen service when a row is tapped", async () => {
    mockSearch.mockResolvedValue({ outcome: "ok", payload: payload() });
    render(<BuscarTurnoScreen onOpenOffering={jest.fn()} />);

    await waitFor(() => expect(screen.getByText("Vacunación antirrábica")).toBeTruthy());
    fireEvent.press(screen.getByText("Vacunación antirrábica"));

    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));
    expect(mockSearch.mock.calls[1]?.[1]).toEqual({ serviceKind: "vaccination_rabies" });
  });

  it("falls back to the picker when the server does not recognise the service", async () => {
    // THE S3-F07 CASE. The screen's own state says a kind was chosen; the payload
    // says `serviceKind: null`, because the server refuses to echo a code the
    // catalogue does not have. The SERVER's answer is what decides what is drawn.
    mockSearch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ serviceKind: null, results: [] }),
    });
    render(<BuscarTurnoScreen onOpenOffering={jest.fn()} />);

    await waitFor(() => expect(screen.getByText("Indicá qué servicio buscás.")).toBeTruthy());
    expect(screen.queryByText("Resultados")).toBeNull();
  });
});

describe("a failed read", () => {
  it("shows the failure and a retry, never an empty catalogue", async () => {
    mockSearch.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    render(<BuscarTurnoScreen onOpenOffering={jest.fn()} />);

    await waitFor(() => expect(screen.getByText("Reintentar")).toBeTruthy());
    expect(screen.getByText(/Revisá tu conexión/i)).toBeTruthy();
    // THE SENTENCE THAT MUST NOT APPEAR. "No hay turnos" over an outage sends
    // somebody away from a campaign that is running.
    expect(screen.queryByText(/No hay turnos disponibles/i)).toBeNull();
  });

  it("reads again when the retry is pressed", async () => {
    mockSearch.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    render(<BuscarTurnoScreen onOpenOffering={jest.fn()} />);

    await waitFor(() => expect(screen.getByText("Reintentar")).toBeTruthy());
    fireEvent.press(screen.getByText("Reintentar"));
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));
  });

  it("tells an out-of-date build to update instead of blaming the network", async () => {
    mockSearch.mockResolvedValue({ outcome: "unsupported-version", received: 2 });
    render(<BuscarTurnoScreen onOpenOffering={jest.fn()} />);

    await waitFor(() => expect(screen.getByText(/Actualizá la app/i)).toBeTruthy());
  });
});

describe("the results", () => {
  it("draws each offering with its provider, its meta and how much is left", async () => {
    mockSearch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        serviceKind: "vaccination_rabies",
        appliedProvince: "Río Negro",
        appliedLocality: "San Carlos de Bariloche",
        jurisdictionSource: "requested",
        results: [anOffering()],
      }),
    });
    render(<BuscarTurnoScreen onOpenOffering={jest.fn()} />);

    await waitFor(() =>
      expect(screen.getByText("Campaña antirrábica — Plaza San Martín")).toBeTruthy(),
    );
    expect(screen.getByText("Zoonosis Bariloche")).toBeTruthy();
    expect(screen.getByText("Gratuito · 15 min · San Carlos de Bariloche")).toBeTruthy();
    // THE WINDOW COMES FROM THE PAYLOAD, so this sentence cannot claim a figure
    // the read did not use.
    expect(screen.getByText("3 turnos disponibles en 7 días")).toBeTruthy();
    expect(screen.getByText("Buscando en San Carlos de Bariloche.")).toBeTruthy();
  });

  it("says a GUESSED jurisdiction was guessed", async () => {
    mockSearch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        serviceKind: "vaccination_rabies",
        appliedProvince: "Río Negro",
        appliedLocality: "San Carlos de Bariloche",
        jurisdictionSource: "defaulted-from-pet",
        results: [anOffering()],
      }),
    });
    render(<BuscarTurnoScreen onOpenOffering={jest.fn()} />);

    await waitFor(() =>
      expect(screen.getByText(/la zona donde registraste tu primera mascota/i)).toBeTruthy(),
    );
  });

  it("names the place in an empty result rather than saying nothing exists", async () => {
    mockSearch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        serviceKind: "vaccination_rabies",
        appliedProvince: "Río Negro",
        appliedLocality: "El Bolsón",
        jurisdictionSource: "requested",
        results: [],
      }),
    });
    render(<BuscarTurnoScreen onOpenOffering={jest.fn()} />);

    // THE EXACT SENTENCE, not a substring: "en El Bolsón" also appears in the
    // jurisdiction note one line up, and a regex that matched both would pass
    // over an empty state that said nothing at all.
    await waitFor(() =>
      expect(
        screen.getByText(
          "No hay turnos disponibles en El Bolsón para este servicio. Probá otra localidad.",
        ),
      ).toBeTruthy(),
    );
  });

  it("opens the offering that was tapped, by its own token", async () => {
    const onOpenOffering = jest.fn();
    mockSearch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        serviceKind: "vaccination_rabies",
        results: [anOffering({ offeringToken: "SVO-AAAA-BBBB" })],
      }),
    });
    render(<BuscarTurnoScreen onOpenOffering={onOpenOffering} />);

    await waitFor(() =>
      expect(screen.getByText("Campaña antirrábica — Plaza San Martín")).toBeTruthy(),
    );
    fireEvent.press(screen.getByText("Campaña antirrábica — Plaza San Martín"));
    expect(onOpenOffering).toHaveBeenCalledWith("SVO-AAAA-BBBB");
  });

  it("does NOT print a raw snake_case code when the catalogue does not know it", async () => {
    // The catalogue is open (`service_kind` is `text` with no CHECK), so a code
    // seeded outside it is a real possibility. The heading is the offering's own
    // name and the kind line is simply absent.
    mockSearch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        serviceKind: "vaccination_rabies",
        results: [anOffering({ serviceKind: "spay_female_dog", serviceKindLabel: null })],
      }),
    });
    render(<BuscarTurnoScreen onOpenOffering={jest.fn()} />);

    await waitFor(() =>
      expect(screen.getByText("Campaña antirrábica — Plaza San Martín")).toBeTruthy(),
    );
    expect(screen.queryByText("spay_female_dog")).toBeNull();
  });

  it("goes back to the picker without a navigation, since the picker is this screen", async () => {
    // WALKED, not staged. The first read is the picker, the tap chooses a
    // service, and only then is there something to go back FROM — staging a
    // results payload on the first read would put the screen in a state it cannot
    // reach, and the assertion would be about that state rather than about the
    // control.
    mockSearch.mockResolvedValueOnce({ outcome: "ok", payload: payload() });
    mockSearch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ serviceKind: "vaccination_rabies", results: [anOffering()] }),
    });
    render(<BuscarTurnoScreen onOpenOffering={jest.fn()} />);

    await waitFor(() => expect(screen.getByText("Vacunación antirrábica")).toBeTruthy());
    fireEvent.press(screen.getByText("Vacunación antirrábica"));

    await waitFor(() => expect(screen.getByText("Elegir otro servicio")).toBeTruthy());
    fireEvent.press(screen.getByText("Elegir otro servicio"));

    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(3));
    expect(mockSearch.mock.calls[2]?.[1]).toEqual({ serviceKind: null });
  });
});
