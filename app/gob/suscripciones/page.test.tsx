// @vitest-environment jsdom
//
// /gob/suscripciones — render smoke test (page promotion out of /gob/programa
// and /admin/programa, 2026-07-21).
//
// Pins:
//   - the canonical space-y-6 shell (no centered <main>/mx-auto wrapper —
//     matches the item-4 fix already applied to /gob/cola etc.)
//   - the card-list presentation actually renders: breaching-alert banner,
//     "Mis suscripciones" rows with toggle + delete wired, and the create form
//   - the Métrica/Estado OpFilterBar axes actually filter the subscriptions
//     LIST, while the "Alertas activas" banner stays unfiltered (it's a
//     current-state banner, not a browsable view)
//   - the govt "Sin acceso" gate is preserved (unassigned govt operator)
import "@testing-library/jest-dom/vitest";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/infra/auth-guards", () => ({
  requireAdminOrGovtOrRedirect: vi.fn(async () => ({
    user: { id: "govt-1", email: "govt@dim.test" },
    profile: { id: "govt-1", role: "govt" },
    jurisdictions: [{ province: "Buenos Aires", locality: "La Plata" }],
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "govt-1" } } })),
    },
  })),
}));

// sub-1: active + currently breaching (shows in the "Alertas activas" banner
// AND the list, with the "Pausar" toggle). sub-2: inactive + not breaching
// (list only, with "Activar" + the "(inactiva)" marker).
vi.mock("@/lib/metrics/alert-evaluation", () => ({
  evaluateAlertSubscriptions: vi.fn(async () => [
    {
      id: "sub-1",
      actorUserId: "govt-1",
      metricKey: "sterilization_coverage_pct",
      direction: "below",
      threshold: 70,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: null,
      label: null,
      isActive: true,
      currentValue: 38,
      breaching: true,
    },
    {
      id: "sub-2",
      actorUserId: "govt-1",
      metricKey: "microchip_penetration_pct",
      direction: "below",
      threshold: 50,
      jurisdictionProvince: null,
      jurisdictionLocality: null,
      label: null,
      isActive: false,
      currentValue: 60,
      breaching: false,
    },
  ]),
}));

import SuscripcionesPage from "./page";

describe("/gob/suscripciones — render smoke test", () => {
  it("uses the canonical space-y-6 shell, not a centered <main>/mx-auto wrapper", async () => {
    const node = await SuscripcionesPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Alertas y suscripciones");
    expect(html).not.toContain("<main");
    expect(html).not.toContain("mx-auto");
    expect(html).not.toContain("max-w-5xl");
  });

  it("renders the breaching-alert banner, both subscription rows (toggle + delete wired), and the create form", async () => {
    const node = await SuscripcionesPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    // Alertas activas — the breaching row only.
    expect(html).toContain("Alertas activas");
    expect(html).toContain("Cobertura de esterilización");
    // Mis suscripciones — both rows, both actions wired.
    expect(html).toContain("Mis suscripciones");
    expect(html).toContain("Pausar"); // sub-1 (active) toggle
    expect(html).toContain("Activar"); // sub-2 (inactive) toggle
    expect(html).toContain("(inactiva)"); // sub-2 state marker
    expect(html).toContain("Eliminar"); // DeleteAlertSubscriptionButton idle state
    // Crear suscripción — the form is mounted.
    expect(html).toContain("Crear suscripción");
    expect(html).toContain("Crear suscripción de alerta");
  });

  it("Estado=inactive filters the list to the inactive row only, without touching the Alertas activas banner", async () => {
    const node = await SuscripcionesPage({ searchParams: Promise.resolve({ state: "inactive" }) });
    const html = renderToStaticMarkup(node);
    // Banner is UNFILTERED — the breaching (active) row still shows there.
    expect(html).toContain("Alertas activas");
    expect(html).toContain("Cobertura de esterilización");
    // List IS filtered — sub-1 (active) dropped out, so its "Pausar" toggle
    // is gone; sub-2 (inactive) remains with "Activar".
    expect(html).not.toContain("Pausar");
    expect(html).toContain("Activar");
  });

  it("Métrica filter narrows the list to the matching subscription only", async () => {
    const node = await SuscripcionesPage({
      searchParams: Promise.resolve({ metricKey: "microchip_penetration_pct" }),
    });
    const html = renderToStaticMarkup(node);
    expect(html).not.toContain("Pausar"); // sub-1 filtered out
    expect(html).toContain("Activar"); // sub-2 matches
  });
});

describe("/gob/suscripciones — access gate", () => {
  it("shows Sin acceso for a govt operator with no jurisdiction assignments", async () => {
    const { requireAdminOrGovtOrRedirect } = await import("@/lib/infra/auth-guards");
    vi.mocked(requireAdminOrGovtOrRedirect).mockResolvedValueOnce({
      user: { id: "govt-2", email: "govt2@dim.test" },
      profile: { id: "govt-2", role: "govt" },
      jurisdictions: [],
    } as unknown as Awaited<ReturnType<typeof requireAdminOrGovtOrRedirect>>);
    const node = await SuscripcionesPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Sin acceso");
  });
});
