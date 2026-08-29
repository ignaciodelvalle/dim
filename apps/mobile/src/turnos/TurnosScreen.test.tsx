// `TurnosScreen` — the hub's render tests.
//
// WHAT THESE HAVE TO PROVE, beyond "it renders"
// ---------------------------------------------------------------------------
//   1. A FAILED READ IS NOT AN EMPTY LIST. What is being missed here is an
//      appointment somebody has to physically attend at a time they no longer
//      remember, so "no tenés turnos" over a server outage is the worst sentence
//      this screen can say. It must show the failure and a way to retry.
//   2. THE THREE SECTIONS ARE THE SERVER'S. Nothing here re-derives which list a
//      row belongs to — that is the server's clock against the slot.
//   3. THE EMPTY SECTIONS ARE NOT DRAWN. An empty "Pasados" heading over nothing
//      is furniture, and the transfers hub already settled that rule.
//   4. THE EMPTY STATE DOES NOT PROMISE A BUTTON THAT DOES NOT EXIST. Booking is
//      not in this app yet; the copy says where it is instead.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../api/endpoints", () => ({
  fetchMyAppointments: (...args: unknown[]) => mockFetch(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

import type { MyAppointmentV1, MyAppointmentsV1 } from "@dim/contract/api";
import { TurnosScreen } from "./TurnosScreen";

function anAppointment(over: Partial<MyAppointmentV1> = {}): MyAppointmentV1 {
  return {
    appointmentToken: "APT-7K2M-9QX4",
    status: "confirmed",
    section: "upcoming",
    pet: { publicToken: "DIM-PAMP-0001", name: "Pampa" },
    offeringName: "Campaña antirrábica — Plaza San Martín",
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
    startsAt: "2026-09-03T13:30:00.000Z",
    endsAt: "2026-09-03T13:45:00.000Z",
    capabilities: { canCancel: true, canCheckIn: true },
    ...over,
  };
}

function payload(over: Partial<MyAppointmentsV1> = {}): MyAppointmentsV1 {
  return {
    payloadVersion: 1,
    issuedAt: "2026-08-29T00:00:00.000Z",
    staleAfter: "2026-08-29T00:01:00.000Z",
    upcoming: [],
    past: [],
    cancelled: [],
    ...over,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("a failed read", () => {
  it("shows the failure and a retry, never an empty list", async () => {
    mockFetch.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    render(<TurnosScreen onOpen={jest.fn()} />);

    await waitFor(() => expect(screen.getByText("Reintentar")).toBeTruthy());
    expect(screen.getByText(/Revisá tu conexión/i)).toBeTruthy();
    // THE SENTENCE THAT MUST NOT APPEAR. "No tenés turnos" over an outage is how
    // somebody stops expecting an appointment they still have.
    expect(screen.queryByText(/No tenés turnos/i)).toBeNull();
  });

  it("reads again when the retry is pressed", async () => {
    mockFetch.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    render(<TurnosScreen onOpen={jest.fn()} />);

    await waitFor(() => expect(screen.getByText("Reintentar")).toBeTruthy());
    fireEvent.press(screen.getByText("Reintentar"));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  it("tells an out-of-date build to update instead of blaming the network", async () => {
    mockFetch.mockResolvedValue({ outcome: "unsupported-version", received: 2 });
    render(<TurnosScreen onOpen={jest.fn()} />);

    await waitFor(() => expect(screen.getByText(/Actualizá la app/i)).toBeTruthy());
  });
});

describe("the sections", () => {
  it("draws a row in the section the SERVER put it in", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        upcoming: [anAppointment({ appointmentToken: "APT-UP" })],
        past: [
          anAppointment({
            appointmentToken: "APT-PAST",
            section: "past",
            status: "attended",
            offeringName: "Castración",
          }),
        ],
        cancelled: [
          anAppointment({
            appointmentToken: "APT-CAN",
            section: "cancelled",
            status: "cancelled_by_org",
            offeringName: "Consulta clínica",
          }),
        ],
      }),
    });
    render(<TurnosScreen onOpen={jest.fn()} />);

    await waitFor(() => expect(screen.getByText("Próximos")).toBeTruthy());
    expect(screen.getByText("Pasados")).toBeTruthy();
    expect(screen.getByText("Cancelados")).toBeTruthy();
    expect(screen.getByText("Asistido")).toBeTruthy();
    expect(screen.getByText("Cancelado por el prestador")).toBeTruthy();
    expect(screen.getByText("3 turnos en total.")).toBeTruthy();
  });

  it("does not draw a heading for a section with no rows", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ upcoming: [anAppointment()] }),
    });
    render(<TurnosScreen onOpen={jest.fn()} />);

    await waitFor(() => expect(screen.getByText("Próximos")).toBeTruthy());
    expect(screen.queryByText("Pasados")).toBeNull();
    expect(screen.queryByText("Cancelados")).toBeNull();
  });

  it("opens the row that was tapped, by its own token", async () => {
    const onOpen = jest.fn();
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ upcoming: [anAppointment({ appointmentToken: "APT-UP" })] }),
    });
    render(<TurnosScreen onOpen={onOpen} />);

    await waitFor(() =>
      expect(screen.getByText("Campaña antirrábica — Plaza San Martín")).toBeTruthy(),
    );
    fireEvent.press(screen.getByText("Campaña antirrábica — Plaza San Martín"));
    expect(onOpen).toHaveBeenCalledWith("APT-UP");
  });
});

describe("the empty state", () => {
  it("says where turnos are booked instead of offering a button that does not exist", async () => {
    mockFetch.mockResolvedValue({ outcome: "ok", payload: payload() });
    render(<TurnosScreen onOpen={jest.fn()} />);

    await waitFor(() => expect(screen.getByText("No tenés turnos próximos.")).toBeTruthy());
    expect(screen.getByText("No tenés turnos reservados.")).toBeTruthy();
    // BOOKING IS NOT IN THIS APP YET. An empty state that said "reservá tu primer
    // turno" with nothing to tap is a promise the app cannot keep.
    expect(screen.getByText(/mimar\.com\.ar/i)).toBeTruthy();
    expect(screen.queryByText(/^Buscar turnos$/)).toBeNull();
  });
});
