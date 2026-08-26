// `LostScreen` — the render tests for the one screen where being wrong costs
// somebody their animal.
//
// WHAT THESE HAVE TO PROVE, beyond "it renders"
// ---------------------------------------------------------------------------
//   1. EVERY AFFORDANCE COMES FROM `capabilities`. Four of the five conditions
//      need facts a client does not hold, and the fifth — reactivation, refused
//      on the ORG path alone — is invisible in `status`. A screen that
//      recomputed them would be right four times out of five and wrong in
//      somebody's hands.
//   2. THE PRIVACY ROWS ARE HONEST. A preference this caller may not change is
//      SHOWN and marked, never hidden and never a live switch that answers 403.
//   3. THE AVISTAJE CARRIES A KEY AND THE OTHER FOUR DO NOT. One command
//      appends; sending a key the server ignores is a client believing it holds
//      a guarantee it does not.
//   4. "NOTHING CHANGED" IS SAID OUT LOUD rather than dressed as success.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../api/endpoints", () => ({
  fetchPetLostMode: (...args: unknown[]) => mockFetch(...args),
  sendLostCommand: (...args: unknown[]) => mockSend(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

import type { PetLostV1 } from "@dim/contract/api";
import { LostScreen } from "./LostScreen";

const TOKEN = "DIM-PAMP-0001";

const ALL_KEYS = [
  "discloseFirstNameWhenLost",
  "disclosePhoneWhenLost",
  "discloseEmailWhenLost",
  "discloseLastLocationWhenLost",
  "allowFinderFormWhenLost",
  "discloseCaretakerContactWhenLost",
] as const;

function payload(overrides: Partial<PetLostV1> = {}): PetLostV1 {
  return {
    payloadVersion: 1,
    issuedAt: "2026-08-26T00:00:00.000Z",
    staleAfter: "2026-08-26T00:01:00.000Z",
    publicToken: TOKEN,
    petName: "Pampa",
    petSex: "female",
    status: "active",
    episode: null,
    disclosure: {
      discloseFirstNameWhenLost: false,
      disclosePhoneWhenLost: false,
      discloseEmailWhenLost: false,
      discloseLastLocationWhenLost: false,
      allowFinderFormWhenLost: true,
      discloseCaretakerContactWhenLost: false,
    },
    capabilities: {
      canMarkLost: true,
      canReportLastSeen: false,
      canMarkFound: false,
      canReactivateSearch: false,
      editableDisclosureKeys: [...ALL_KEYS],
    },
    feed: { items: [], truncated: false, totalScans: 0, totalSightings: 0 },
    ...overrides,
  };
}

const LOST_EPISODE = {
  publicCode: "LOS-00042",
  openedAt: "2026-08-20T12:00:00.000Z",
  placeName: "Plaza San Martín",
  ownerNote: "Se escapó por el portón",
  lastSeenAt: "2026-08-21T15:00:00.000Z",
  lastSeenLat: -36.6167,
  lastSeenLng: -64.2833,
  jurisdictionLocality: "Santa Rosa",
  sightingsCount: 3,
};

/** A pet mid-search: every running-search affordance available. */
function searching(overrides: Partial<PetLostV1> = {}) {
  return payload({
    status: "lost",
    episode: LOST_EPISODE,
    capabilities: {
      canMarkLost: false,
      canReportLastSeen: true,
      canMarkFound: true,
      canReactivateSearch: false,
      editableDisclosureKeys: [...ALL_KEYS],
    },
    ...overrides,
  });
}

function ok(body: unknown) {
  return { outcome: "ok", payload: body };
}

function ack(command: string, changed: boolean, status = "lost") {
  return ok({ command, status, changed });
}

/** The body of the Nth command the screen sent. */
function sentBody(index = 0) {
  const call = mockSend.mock.calls[index] as unknown[] | undefined;
  return call?.[2] as Record<string, unknown> | undefined;
}

/** The Idempotency-Key of the Nth command, or `null` when none was sent. */
function sentKey(index = 0) {
  const call = mockSend.mock.calls[index] as unknown[] | undefined;
  return call?.[3] as string | null | undefined;
}

beforeEach(() => {
  mockPush.mockReset();
  mockFetch.mockReset();
  mockSend.mockReset();
  mockFetch.mockResolvedValue(ok(payload()));
  mockSend.mockResolvedValue(ack("mark_found", true, "active"));
});

describe("LostScreen — the affordances come from capabilities, never from status", () => {
  it("offers ONLY marcar perdida for an animal that is not lost", async () => {
    render(<LostScreen publicToken={TOKEN} />);
    expect(await screen.findByText("Marcar como perdida")).toBeOnTheScreen();
    expect(screen.queryByText("Actualizar dónde la vieron")).toBeNull();
    expect(screen.queryByText("Marcar como encontrada")).toBeNull();
    expect(screen.queryByText("Reactivar búsqueda")).toBeNull();
  });

  it("offers the running-search affordances mid-search, and not marcar perdida", async () => {
    mockFetch.mockResolvedValue(ok(searching()));
    render(<LostScreen publicToken={TOKEN} />);
    expect(await screen.findByText("Actualizar dónde la vieron")).toBeOnTheScreen();
    expect(screen.getByText("Marcar como encontrada")).toBeOnTheScreen();
    expect(screen.queryByText("Marcar como perdida")).toBeNull();
  });

  it("offers REACTIVAR for a stale search and refuses to offer an avistaje", async () => {
    // `status: "lost"` with no open episode: the cron closed the case and left
    // the status alone. Logging a sighting is impossible until it reopens, and
    // the screen must not offer a button that would 409.
    mockFetch.mockResolvedValue(
      ok(
        payload({
          status: "lost",
          episode: null,
          capabilities: {
            canMarkLost: false,
            canReportLastSeen: false,
            canMarkFound: true,
            canReactivateSearch: true,
            editableDisclosureKeys: [...ALL_KEYS],
          },
        }),
      ),
    );
    render(<LostScreen publicToken={TOKEN} />);
    expect(await screen.findByText("Reactivar búsqueda")).toBeOnTheScreen();
    expect(screen.queryByText("Actualizar dónde la vieron")).toBeNull();
    expect(screen.getByText(/se cerró por inactividad/)).toBeOnTheScreen();
  });

  it("hides reactivation when the server did not offer it, whatever the status says", async () => {
    // The org path is refused for this one command alone, and nothing in
    // `status` or `episode` hints at it. A screen deriving the flag itself would
    // render a button that answers 403.
    mockFetch.mockResolvedValue(
      ok(
        payload({
          status: "lost",
          episode: null,
          capabilities: {
            canMarkLost: false,
            canReportLastSeen: false,
            canMarkFound: true,
            canReactivateSearch: false,
            editableDisclosureKeys: [...ALL_KEYS],
          },
        }),
      ),
    );
    render(<LostScreen publicToken={TOKEN} />);
    await screen.findByText("Marcar como encontrada");
    expect(screen.queryByText("Reactivar búsqueda")).toBeNull();
  });
});

describe("LostScreen — the privacy rows", () => {
  it("shows a preference this caller may not change, and marks it", async () => {
    mockFetch.mockResolvedValue(
      ok(
        payload({
          capabilities: {
            canMarkLost: true,
            canReportLastSeen: false,
            canMarkFound: false,
            canReactivateSearch: false,
            editableDisclosureKeys: ALL_KEYS.filter(
              (k) => k !== "discloseCaretakerContactWhenLost",
            ),
          },
        }),
      ),
    );
    render(<LostScreen publicToken={TOKEN} />);
    // The row is PRESENT — hiding it would leave a caretaker wondering whether
    // the setting exists at all.
    expect(await screen.findByText("Mostrar el contacto de su cuidador/a")).toBeOnTheScreen();
    expect(screen.getByText(/Solo el titular puede cambiar esto/)).toBeOnTheScreen();
  });

  it("sends one command per toggle, with the value it wants stated", async () => {
    mockSend.mockResolvedValue(ack("set_disclosure", true, "active"));
    render(<LostScreen publicToken={TOKEN} />);
    fireEvent.press(await screen.findByText("Mostrar mi teléfono"));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({
      command: "set_disclosure",
      key: "disclosePhoneWhenLost",
      value: true,
    });
    // NO KEY: the writer is idempotent on the state, and a header it would
    // ignore is a guarantee nobody has.
    expect(sentKey()).toBeNull();
  });

  it("says a preference was already that way instead of claiming a change", async () => {
    mockSend.mockResolvedValue(ack("set_disclosure", false, "active"));
    render(<LostScreen publicToken={TOKEN} />);
    fireEvent.press(await screen.findByText("Mostrar mi email"));
    expect(await screen.findByText("Esa preferencia ya estaba así.")).toBeOnTheScreen();
  });
});

describe("LostScreen — marcar perdida", () => {
  it("sends the five toggles it collected, with nothing inherited", async () => {
    mockSend.mockResolvedValue(ack("mark_lost", true));
    render(<LostScreen publicToken={TOKEN} />);
    fireEvent.press(await screen.findByText("Marcar como perdida"));

    fireEvent.changeText(
      screen.getByLabelText("Dónde la viste por última vez"),
      "Plaza San Martín",
    );
    // Publishing a phone is a decision somebody makes on this screen.
    fireEvent.press(screen.getByText("Mostrar mi teléfono"));
    fireEvent.press(screen.getByText("Marcar como perdida"));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({
      command: "mark_lost",
      locationDescription: "Plaza San Martín",
      disclosure: {
        discloseFirstNameWhenLost: false,
        disclosePhoneWhenLost: true,
        discloseEmailWhenLost: false,
        discloseLastLocationWhenLost: false,
        allowFinderFormWhenLost: true,
      },
    });
    expect(sentKey()).toBeNull();
  });

  it("marks lost with NOTHING filled in — the fast path the wizard protects", async () => {
    mockSend.mockResolvedValue(ack("mark_lost", true));
    render(<LostScreen publicToken={TOKEN} />);
    fireEvent.press(await screen.findByText("Marcar como perdida"));
    fireEvent.press(screen.getByText("Marcar como perdida"));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ enrichedDescription: null, locationDescription: null });
  });

  it("re-reads after the command instead of patching its own copy", async () => {
    mockSend.mockResolvedValue(ack("mark_lost", true));
    render(<LostScreen publicToken={TOKEN} />);
    await screen.findByText("Marcar como perdida");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText("Marcar como perdida"));
    fireEvent.press(screen.getByText("Marcar como perdida"));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});

describe("LostScreen — the avistaje is the one command that appends", () => {
  it("carries an Idempotency-Key, unlike the other four", async () => {
    mockFetch.mockResolvedValue(ok(searching()));
    mockSend.mockResolvedValue(ack("report_last_seen", true));
    render(<LostScreen publicToken={TOKEN} />);
    fireEvent.press(await screen.findByText("Actualizar dónde la vieron"));

    fireEvent.changeText(screen.getByLabelText("Dónde"), "Cerca de la plaza");
    fireEvent.press(screen.getByText("Guardar avistaje"));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({
      command: "report_last_seen",
      locationDescription: "Cerca de la plaza",
    });
    expect(sentKey()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("says a REPLAY did not duplicate instead of claiming a second sighting", async () => {
    mockFetch.mockResolvedValue(ok(searching()));
    mockSend.mockResolvedValue(ack("report_last_seen", false));
    render(<LostScreen publicToken={TOKEN} />);
    fireEvent.press(await screen.findByText("Actualizar dónde la vieron"));
    fireEvent.press(screen.getByText("Guardar avistaje"));

    expect(await screen.findByText(/no se duplicó/)).toBeOnTheScreen();
  });
});

describe("LostScreen — marcar encontrada is a two-step", () => {
  it("asks before closing the search, because a mis-tap must not end it", async () => {
    mockFetch.mockResolvedValue(ok(searching()));
    render(<LostScreen publicToken={TOKEN} />);
    fireEvent.press(await screen.findByText("Marcar como encontrada"));

    // Nothing sent yet — the first press only opens the confirmation.
    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.getByText(/avisamos a quienes la estaban buscando/)).toBeOnTheScreen();

    fireEvent.press(screen.getByText("Sí, la encontré"));
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({ command: "mark_found" });
    expect(sentKey()).toBeNull();
  });

  it("says the animal came home in her own gender", async () => {
    mockFetch.mockResolvedValue(ok(searching()));
    mockSend.mockResolvedValue(ack("mark_found", true, "active"));
    render(<LostScreen publicToken={TOKEN} />);
    fireEvent.press(await screen.findByText("Marcar como encontrada"));
    fireEvent.press(screen.getByText("Sí, la encontré"));
    expect(await screen.findByText(/como encontrada/)).toBeOnTheScreen();
  });
});

describe("LostScreen — the feed and the poster", () => {
  it("renders each kind of row, and never a photo it cannot show", async () => {
    mockFetch.mockResolvedValue(
      ok(
        searching({
          feed: {
            truncated: true,
            totalScans: 1,
            totalSightings: 1,
            items: [
              {
                kind: "finder",
                id: "f1",
                at: "2026-08-22T10:00:00.000Z",
                finderName: "Vecina",
                finderContact: "11-5555-5555",
                petCondition: "bien",
                localityLabel: "Santa Rosa",
                message: "La tengo en casa",
                availabilityLabel: "indefinido",
                hasPhoto: true,
              },
              {
                kind: "scan",
                id: "s1",
                at: "2026-08-22T09:00:00.000Z",
                count: 3,
                localityLabel: "Toay",
              },
            ],
          },
        }),
      ),
    );
    render(<LostScreen publicToken={TOKEN} />);
    expect(await screen.findByText("Vecina dice que la tiene")).toBeOnTheScreen();
    expect(screen.getByText(/Escanearon su QR 3 veces/)).toBeOnTheScreen();
    expect(screen.getByText("11-5555-5555")).toBeOnTheScreen();
    // A photo exists and the payload carries no URL for it — saying so is
    // honest, a broken image would not be.
    expect(screen.getByText(/Dejó una foto/)).toBeOnTheScreen();
    // A capped list that does not say so is the same dishonesty as an empty
    // state over a failed read.
    expect(screen.getByText(/Puede haber más/)).toBeOnTheScreen();
  });

  it("says the feed is empty rather than rendering nothing", async () => {
    mockFetch.mockResolvedValue(ok(searching()));
    render(<LostScreen publicToken={TOKEN} />);
    expect(await screen.findByText(/Todavía no hay avistajes/)).toBeOnTheScreen();
  });

  it("says where the printable poster lives instead of leaving a gap", async () => {
    render(<LostScreen publicToken={TOKEN} />);
    expect(await screen.findByText(/cartel para imprimir se arma desde la web/i)).toBeOnTheScreen();
  });
});

describe("LostScreen — the refusals a person sees", () => {
  it("renders a failed read as a refusal with a retry, not as an empty search", async () => {
    mockFetch.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    render(<LostScreen publicToken={TOKEN} />);
    expect(await screen.findByText(/Revisá tu conexión/)).toBeOnTheScreen();
    expect(screen.getByText("Reintentar")).toBeOnTheScreen();
    // NOT an empty feed: a read that failed and a search nobody reported on are
    // different facts.
    expect(screen.queryByText(/Todavía no hay avistajes/)).toBeNull();
  });

  it("renders a command refusal in the person's own words, and stays put", async () => {
    mockFetch.mockResolvedValue(ok(searching()));
    mockSend.mockResolvedValue({ outcome: "api-error", code: "lost_episode_closed" });
    render(<LostScreen publicToken={TOKEN} />);
    fireEvent.press(await screen.findByText("Actualizar dónde la vieron"));
    fireEvent.press(screen.getByText("Guardar avistaje"));

    expect(await screen.findByText(/se cerró por inactividad/)).toBeOnTheScreen();
    // The form is still standing, with what was typed still in it.
    expect(screen.getByText("Guardar avistaje")).toBeOnTheScreen();
  });

  it("renders a titular-only refusal as whose decision it is", async () => {
    mockSend.mockResolvedValue({ outcome: "api-error", code: "lost_forbidden" });
    render(<LostScreen publicToken={TOKEN} />);
    fireEvent.press(await screen.findByText("Mostrar el contacto de su cuidador/a"));
    expect(await screen.findByText(/solo del titular/i)).toBeOnTheScreen();
  });
});
