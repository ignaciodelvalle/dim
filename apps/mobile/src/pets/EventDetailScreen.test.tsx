// `EventDetailScreen` — one asiento, rendered.
//
// WHAT ONLY A RENDER TEST SEES HERE. `event-detail-view-model.test.ts` proves
// the mapping; this proves the SCREEN honours it. Two things in particular:
//
//   · THE CORRECTION AFFORDANCE IS GATED. `canAmend: false` must hide the
//     button and SHOW the reason — a screen that hid both would leave a person
//     hunting for a control that was deliberately withheld.
//   · "TERMINAR MEDICACIÓN" APPEARS ON EXACTLY ONE KIND OF ASIENTO. It is the
//     only entry point to the sixth writer, so if it renders on the wrong
//     record — or fails to render on the right one — that writer is unreachable
//     or reachable from nonsense, and no pure test would notice either.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import type { PetEventDetailV1 } from "@dim/contract/api";

const mockPush = jest.fn();
const mockFetchPetEventDetail = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockAmendPetEvent = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../api/endpoints", () => ({
  fetchPetEventDetail: (...args: unknown[]) => mockFetchPetEventDetail(...args),
  amendPetEvent: (...args: unknown[]) => mockAmendPetEvent(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

import { EventDetailScreen } from "./EventDetailScreen";

const TOKEN = "DIM-PAMP-0001";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

function payload(overrides: Record<string, unknown> = {}): PetEventDetailV1 {
  return {
    payloadVersion: 1,
    issuedAt: "2026-08-25T15:00:00.000Z",
    staleAfter: "2026-08-25T15:05:00.000Z",
    publicToken: TOKEN,
    eventId: EVENT_ID,
    eventType: "vaccination_administered",
    kind: "Vacuna · obligatoria",
    title: "Antirrábica",
    subtitle: null,
    occurredAt: "2026-08-20T12:00:00.000Z",
    recordedAt: "2026-08-21T09:00:00.000Z",
    notes: null,
    location: null,
    author: { roleLabel: "Dueño", organizationName: null, verified: false },
    facts: [{ field: "batch", label: "Lote", value: "L-42" }],
    amendments: { status: "ok", data: { items: [] } },
    attachments: { status: "ok", data: { items: [] } },
    amend: { canAmend: true, refusal: null },
    ...overrides,
  } as unknown as PetEventDetailV1;
}

beforeEach(() => {
  mockPush.mockReset();
  mockAmendPetEvent.mockReset();
  mockFetchPetEventDetail.mockReset();
  mockFetchPetEventDetail.mockResolvedValue({ outcome: "ok", payload: payload() });
});

describe("EventDetailScreen — the record", () => {
  it("renders the asiento with both of its dates and its curated fields", async () => {
    render(<EventDetailScreen publicToken={TOKEN} eventId={EVENT_ID} />);
    expect(await screen.findByText("Antirrábica")).toBeOnTheScreen();
    expect(screen.getByText("Vacuna · obligatoria")).toBeOnTheScreen();
    expect(screen.getByText("L-42")).toBeOnTheScreen();
    // Two dates, two different questions — when it HAPPENED and when somebody
    // wrote it down. Collapsing them would hide an imported record's history.
    expect(screen.getByText("Ocurrió")).toBeOnTheScreen();
    expect(screen.getByText("Registrado")).toBeOnTheScreen();
  });

  it("renders a failed read as a failed read, with a way out", async () => {
    mockFetchPetEventDetail.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    render(<EventDetailScreen publicToken={TOKEN} eventId={EVENT_ID} />);
    expect(await screen.findByText(/Revisá tu conexión/)).toBeOnTheScreen();
    expect(screen.getByText("Volver a intentar")).toBeOnTheScreen();
  });
});

describe("EventDetailScreen — the correction affordance", () => {
  it("offers it when the server says this viewer may correct", async () => {
    render(<EventDetailScreen publicToken={TOKEN} eventId={EVENT_ID} />);
    expect(await screen.findByText("Corregir registro")).toBeOnTheScreen();
  });

  it("hides the button and SHOWS THE REASON when the server refuses", async () => {
    // Hiding both would be worse than either: a person would hunt for a control
    // that was withheld on purpose, and never learn why.
    mockFetchPetEventDetail.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        amend: { canAmend: false, refusal: "Este registro no admite correcciones." },
      }),
    });
    render(<EventDetailScreen publicToken={TOKEN} eventId={EVENT_ID} />);
    expect(await screen.findByText("Este registro no admite correcciones.")).toBeOnTheScreen();
    expect(screen.queryByText("Corregir registro")).toBeNull();
  });
});

describe("EventDetailScreen — terminar medicación", () => {
  it("does NOT offer it on an asiento that did not start a treatment", async () => {
    render(<EventDetailScreen publicToken={TOKEN} eventId={EVENT_ID} />);
    await screen.findByText("Antirrábica");
    expect(screen.queryByText("Terminar medicación")).toBeNull();
  });

  it("offers it on a medication_started, and carries that asiento to the writer", async () => {
    // The whole reason this affordance lives here: ending a treatment needs the
    // identifier of the event it ends, and this is the only screen where a
    // person already holds it.
    mockFetchPetEventDetail.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        eventType: "medication_started",
        kind: "Medicación",
        title: "Amoxicilina",
      }),
    });
    render(<EventDetailScreen publicToken={TOKEN} eventId={EVENT_ID} />);
    fireEvent.press(await screen.findByText("Terminar medicación"));
    expect(mockPush).toHaveBeenCalledWith(
      `/mascotas/${TOKEN}/asentar?kind=medication_end&source=${EVENT_ID}`,
    );
  });

  it("matches on the SPINE's type, not on the worded eyebrow", async () => {
    // A record whose es-AR eyebrow says "Medicación" but whose event_type is the
    // STOP must not offer to stop it again. Matching on display copy would break
    // the day somebody rewords one.
    mockFetchPetEventDetail.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        eventType: "medication_stopped",
        kind: "Medicación",
        title: "Amoxicilina",
      }),
    });
    render(<EventDetailScreen publicToken={TOKEN} eventId={EVENT_ID} />);
    await screen.findByText("Amoxicilina");
    expect(screen.queryByText("Terminar medicación")).toBeNull();
  });
});
