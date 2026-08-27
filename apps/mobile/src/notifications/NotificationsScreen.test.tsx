// `NotificationsScreen` — the inbox's render and action tests.
//
// WHAT THESE HAVE TO PROVE, beyond "it renders"
// ---------------------------------------------------------------------------
//   1. A FAILED READ IS NOT AN EMPTY INBOX. "Tu bandeja está vacía" over a
//      server outage tells somebody that nobody has reported seeing their lost
//      dog. It must show the failure and a way to retry.
//   2. THE AFFORDANCES ARE THE SERVER'S. `petLinkAvailable: false` on a row that
//      HAS a pet must hide the link — that combination is the whole point of the
//      denylist, and a screen that decided from `pet !== null` would offer a
//      guaranteed dead end.
//   3. A CTA WITH NO NATIVE ROUTE IS NOT PRESSABLE. Pushing a web path opens the
//      app onto a blank stack, which is the failure mode this whole resolution
//      exists to prevent.
//   4. THE WRITES GO THROUGH THE CONTRACT AND THE LIST RE-READS. A tap that
//      patched local state instead would let the badge and the rows disagree.
//   5. THE ORDER IS THE SHARED RULE'S. Asserted here as "urgent renders above
//      info even though the wire order is the reverse" — the cross-client half
//      lives in `__tests__/notification-ordering-parity.test.ts`.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../api/endpoints", () => ({
  fetchMyNotifications: (...args: unknown[]) => mockFetch(...args),
  sendNotificationCommand: (...args: unknown[]) => mockSend(...args),
}));

jest.mock("../auth/session-store", () => ({ sessionPort: {} }));

import type { MyNotificationV1, MyNotificationsV1 } from "@dim/contract/api";
import { NotificationsScreen } from "./NotificationsScreen";

function aNotification(over: Partial<MyNotificationV1> = {}): MyNotificationV1 {
  return {
    id: "n-1",
    notificationType: "pet_sighting",
    title: "Avistaje de Pampa",
    body: "Alguien la vio en Palermo.",
    severity: "urgent",
    category: "perdidas",
    createdAt: "2026-08-20T10:00:00.000Z",
    read: false,
    pet: { publicToken: "DIM-PAMP-0001", name: "Pampa" },
    petLinkAvailable: true,
    cta: null,
    ...over,
  };
}

function payload(over: Partial<MyNotificationsV1> = {}): MyNotificationsV1 {
  return {
    payloadVersion: 1,
    issuedAt: "2026-08-26T00:00:00.000Z",
    staleAfter: "2026-08-26T00:00:30.000Z",
    notifications: [],
    categories: [],
    unreadCount: 0,
    total: 0,
    truncated: false,
    ...over,
  };
}

const noop = () => {};

function renderScreen(onOpenRoute = noop as (route: string) => void) {
  return render(<NotificationsScreen onOpenRoute={onOpenRoute} onOpenPets={noop} />);
}

beforeEach(() => {
  mockFetch.mockReset();
  mockSend.mockReset();
});

describe("NotificationsScreen — reading", () => {
  it("shows the failure and a retry, never an empty inbox", async () => {
    mockFetch.mockResolvedValue({ outcome: "unreachable", detail: "offline" });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Reintentar")).toBeTruthy());
    expect(screen.queryByText("Sin notificaciones")).toBeNull();
  });

  it("offers a way out of an empty inbox instead of a dead end", async () => {
    mockFetch.mockResolvedValue({ outcome: "ok", payload: payload() });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Sin notificaciones")).toBeTruthy());
    expect(screen.getByText("Ver mis mascotas")).toBeTruthy();
  });

  it("renders the shared display order, not the wire order", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        total: 2,
        unreadCount: 2,
        notifications: [
          aNotification({ id: "n-info", severity: "info", title: "Un aviso cualquiera" }),
          aNotification({ id: "n-urgent", severity: "urgent", title: "Avistaje de Pampa" }),
        ],
      }),
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Avistaje de Pampa")).toBeTruthy());
    const rendered = screen.getAllByText(/Avistaje de Pampa|Un aviso cualquiera/);
    expect(rendered[0]?.props.children).toBe("Avistaje de Pampa");
  });

  it("says the list is incomplete rather than looking complete", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ total: 240, truncated: true, notifications: [aNotification()] }),
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("La lista está incompleta")).toBeTruthy());
  });
});

describe("NotificationsScreen — the affordances are the server's", () => {
  it("hides the pet link when the server says the destination is dead for this reader", async () => {
    // The row HAS a pet. `pet_transfer_accepted` means custody LEFT the reader,
    // so the pet page is a guaranteed dead end and only the denylist knows it.
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        total: 1,
        notifications: [
          aNotification({
            notificationType: "pet_transfer_accepted",
            petLinkAvailable: false,
            read: true,
          }),
        ],
      }),
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Archivar")).toBeTruthy());
    expect(screen.queryByText("Ver Pampa")).toBeNull();
  });

  it("pushes the CTA's NATIVE route and never a web path", async () => {
    const pushed: string[] = [];
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        total: 1,
        notifications: [
          aNotification({
            cta: { label: "Ver el registro", route: "/mascotas/DIM-PAMP-0001/eventos/ev-1" },
          }),
        ],
      }),
    });
    renderScreen((route) => pushed.push(route));
    await waitFor(() => expect(screen.getByText("Ver el registro")).toBeTruthy());
    fireEvent.press(screen.getByText("Ver el registro"));
    expect(pushed).toEqual(["/mascotas/DIM-PAMP-0001/eventos/ev-1"]);
  });

  it("renders a routeless CTA as inert text rather than a tap onto a blank stack", async () => {
    const pushed: string[] = [];
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        total: 1,
        notifications: [aNotification({ cta: { label: "Leer la resolución", route: null } })],
      }),
    });
    renderScreen((route) => pushed.push(route));
    await waitFor(() => expect(screen.getByText("Leer la resolución")).toBeTruthy());
    fireEvent.press(screen.getByText("Leer la resolución"));
    expect(pushed).toEqual([]);
  });

  it("offers 'marcar como leída' only while the row is unread", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ total: 1, notifications: [aNotification({ read: true })] }),
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Archivar")).toBeTruthy());
    expect(screen.queryByText("Marcar como leída")).toBeNull();
  });

  it("offers 'marcar todas' only while something is unread", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        total: 1,
        unreadCount: 0,
        notifications: [aNotification({ read: true })],
      }),
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Archivar")).toBeTruthy());
    expect(screen.queryByText("Marcar todas como leídas")).toBeNull();
  });
});

describe("NotificationsScreen — the writes", () => {
  it("marks one row read through the contract and re-reads the list", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ total: 1, unreadCount: 1, notifications: [aNotification()] }),
    });
    mockSend.mockResolvedValue({
      outcome: "ok",
      payload: { command: "mark_read", changed: true, unreadCount: 0 },
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Marcar como leída")).toBeTruthy());
    fireEvent.press(screen.getByText("Marcar como leída"));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend.mock.calls[0]?.[1]).toEqual({
      command: "mark_read",
      notificationIds: ["n-1"],
    });
    // The re-read is what keeps the badge and the rows from disagreeing.
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  it("archives one row and never a batch of them", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ total: 1, notifications: [aNotification({ read: true })] }),
    });
    mockSend.mockResolvedValue({
      outcome: "ok",
      payload: { command: "archive", changed: true, unreadCount: 0 },
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Archivar")).toBeTruthy());
    fireEvent.press(screen.getByText("Archivar"));
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend.mock.calls[0]?.[1]).toEqual({ command: "archive", notificationId: "n-1" });
  });

  it("marks the whole inbox read", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ total: 1, unreadCount: 1, notifications: [aNotification()] }),
    });
    mockSend.mockResolvedValue({
      outcome: "ok",
      payload: { command: "mark_all_read", changed: true, unreadCount: 0 },
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Marcar todas como leídas")).toBeTruthy());
    fireEvent.press(screen.getByText("Marcar todas como leídas"));
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend.mock.calls[0]?.[1]).toEqual({ command: "mark_all_read" });
  });

  it("reports a refused write instead of pretending the tap worked", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({ total: 1, unreadCount: 1, notifications: [aNotification()] }),
    });
    mockSend.mockResolvedValue({
      outcome: "api-error",
      code: "rate_limited",
      retryAfterSeconds: 30,
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Marcar como leída")).toBeTruthy());
    fireEvent.press(screen.getByText("Marcar como leída"));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    // The row is still unread on screen and the failure is stated. Optimism here
    // would leave the badge and the row disagreeing after a refusal.
    await waitFor(() => expect(screen.getByText("Marcar como leída")).toBeTruthy());
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("NotificationsScreen — the tabs", () => {
  it("re-reads with the chosen category and draws only populated tabs", async () => {
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        total: 3,
        notifications: [aNotification()],
        categories: [
          { category: "perdidas", count: 2 },
          { category: "health", count: 1 },
        ],
      }),
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Pérdidas · 2")).toBeTruthy());
    // Six categories exist; only the two with rows are drawn.
    expect(screen.queryByText(/Custodia/)).toBeNull();

    fireEvent.press(screen.getByText("Salud · 1"));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch.mock.calls[1]?.[1]).toBe("health");
  });

  it("draws no tab bar at all for an inbox with nothing in any category", async () => {
    mockFetch.mockResolvedValue({ outcome: "ok", payload: payload() });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Sin notificaciones")).toBeTruthy());
    expect(screen.queryByText("Todas")).toBeNull();
  });
});

describe("NotificationsScreen — grouping", () => {
  it("collapses a run and expands it on demand", async () => {
    const sighting = (id: string) => aNotification({ id, title: `Avistaje ${id}` });
    mockFetch.mockResolvedValue({
      outcome: "ok",
      payload: payload({
        total: 3,
        unreadCount: 3,
        notifications: [sighting("a1"), sighting("a2"), sighting("a3")],
      }),
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("+ 2 más del mismo tipo")).toBeTruthy());
    // The two behind the leader are not on screen until asked for.
    expect(screen.queryByText("Avistaje a2")).toBeNull();

    fireEvent.press(screen.getByText("+ 2 más del mismo tipo"));
    expect(screen.getByText("Avistaje a2")).toBeTruthy();
    expect(screen.getByText("Ocultar")).toBeTruthy();
  });
});
