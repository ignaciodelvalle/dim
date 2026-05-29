// Tests for LostLastSeenCard.
//
// Renders via react-dom/server → HTML string (same pattern as Field.test.tsx).
// CopyPublicLinkButton is a "use client" component; renderToStaticMarkup
// handles it fine since it has no hooks that need a browser environment.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LostLastSeenCard } from "./LostLastSeenCard";

const baseProps = {
  placeName: "Plaza Italia",
  localityLabel: "La Plata",
  at: new Date("2024-06-01T10:00:00Z"),
  note: null,
  editHref: "/mis-mascotas/abc123/perdida",
  publicUrl: "https://mimar.ar/p/abc123",
  sightingsCount: 0,
};

describe("<LostLastSeenCard>", () => {
  it("renders the place name and locality", () => {
    const html = renderToStaticMarkup(<LostLastSeenCard {...baseProps} />);
    expect(html).toContain("Plaza Italia");
    expect(html).toContain("La Plata");
  });

  it("does NOT render the dead add-sighting link", () => {
    const html = renderToStaticMarkup(<LostLastSeenCard {...baseProps} />);
    expect(html).not.toContain("Agregar avistamiento");
    expect(html).not.toContain("avistamiento/nuevo");
  });

  it("renders the helper copy about sharing the public link", () => {
    const html = renderToStaticMarkup(<LostLastSeenCard {...baseProps} />);
    expect(html).toContain("link de la credencial");
  });

  it("renders the Copiar link público button", () => {
    const html = renderToStaticMarkup(<LostLastSeenCard {...baseProps} />);
    expect(html).toContain("Copiar link público");
  });

  it("shows sightings count when > 0", () => {
    const html = renderToStaticMarkup(<LostLastSeenCard {...baseProps} sightingsCount={3} />);
    expect(html).toContain("3 avistamientos");
  });

  it("shows singular form for exactly 1 sighting", () => {
    const html = renderToStaticMarkup(<LostLastSeenCard {...baseProps} sightingsCount={1} />);
    expect(html).toContain("1 avistamiento");
    expect(html).not.toContain("avistamientos");
  });

  it("renders the optional owner note", () => {
    const html = renderToStaticMarkup(
      <LostLastSeenCard
        {...baseProps}
        note="Salió por la puerta del frente, llevaba collar rojo"
      />,
    );
    expect(html).toContain("collar rojo");
  });

  it("renders an edit link to the provided editHref", () => {
    const html = renderToStaticMarkup(<LostLastSeenCard {...baseProps} />);
    expect(html).toContain("/mis-mascotas/abc123/perdida");
    expect(html).toContain("Editar");
  });
});
