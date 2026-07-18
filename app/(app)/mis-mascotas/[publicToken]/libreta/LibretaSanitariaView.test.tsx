/**
 * Structure test — "cargar la libreta de papel" roadmap placeholder.
 *
 * PO-approved pattern (visible, disabled, reads as "coming", never as
 * broken — precedent: "Informe de situación (en desarrollo)" in panorama's
 * SituationalMap). Pinned here so a future edit to LibretaSanitariaView
 * can't silently drop the roadmap signal from either the empty state or the
 * populated agrupada/cronológica views.
 *
 * Pattern: react-dom/server renderToStaticMarkup (repo convention — no
 * jsdom, see EventTimeline.test.tsx / anotar/page.test.tsx).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LIBRETA_GROUPS, type LibretaGroupKey } from "@/lib/infra/libreta-sanitaria";
import { LibretaSanitariaView } from "./LibretaSanitariaView";

const ROADMAP_LABEL = "Cargar la libreta de papel (en desarrollo)";

// Mirrors the private `Event` shape LibretaSanitariaView expects — not
// exported by the module, so redeclared here for the fixture.
type Event = {
  id: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date | string;
  notes: string | null;
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
  tipoEventoCode?: string | null;
};

function emptyGroups(): Record<LibretaGroupKey, Event[]> {
  return Object.fromEntries(LIBRETA_GROUPS.map((g) => [g, [] as Event[]])) as unknown as Record<
    LibretaGroupKey,
    Event[]
  >;
}

const weightEvent: Event = {
  id: "evt-1",
  eventType: "weight_recorded",
  payload: { value_kg: 12.5 },
  occurredAt: new Date("2026-01-01T00:00:00Z"),
  notes: null,
  authorRole: "owner",
  authorVerified: false,
  authorOrganizationId: null,
};

describe("<LibretaSanitariaView> — paper-libreta roadmap placeholder", () => {
  it("renders the placeholder (disabled, aria-disabled, exact copy) in the empty state", () => {
    const html = renderToStaticMarkup(
      <LibretaSanitariaView groupedEvents={emptyGroups()} publicToken="abc123" vista="agrupada" />,
    );
    expect(html).toContain(ROADMAP_LABEL);
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('data-testid="paper-libreta-roadmap-cta"');
  });

  it("renders the placeholder in the populated agrupada view (thin, non-empty history)", () => {
    const groups = emptyGroups();
    groups.peso = [weightEvent];
    const html = renderToStaticMarkup(
      <LibretaSanitariaView groupedEvents={groups} publicToken="abc123" vista="agrupada" />,
    );
    expect(html).toContain(ROADMAP_LABEL);
    expect(html).toContain('aria-disabled="true"');
  });

  it("renders the placeholder in the cronológica view", () => {
    const groups = emptyGroups();
    groups.peso = [weightEvent];
    const html = renderToStaticMarkup(
      <LibretaSanitariaView groupedEvents={groups} publicToken="abc123" vista="cronologica" />,
    );
    expect(html).toContain(ROADMAP_LABEL);
    expect(html).toContain('aria-disabled="true"');
  });

  it("button carries a disabled attribute — never a live/dead link", () => {
    const html = renderToStaticMarkup(
      <LibretaSanitariaView groupedEvents={emptyGroups()} publicToken="abc123" vista="agrupada" />,
    );
    const btnMatch = html.match(/<button\b[\s\S]*?Cargar la libreta de papel[\s\S]*?<\/button>/);
    expect(btnMatch).not.toBeNull();
    expect(btnMatch?.[0]).toContain("disabled=");
  });
});
