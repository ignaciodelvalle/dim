// Smoke tests for <ActionLinkCard> — same render-via-server pattern as
// Checkbox.test.tsx and Field.test.tsx.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActionLinkCard } from "./ActionLinkCard";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("<ActionLinkCard>", () => {
  it("renders title and description", () => {
    const html = render(
      <ActionLinkCard
        href="/mis-mascotas/reclamar"
        icon="qr"
        title="Reclamar mascota existente"
        description="Tu mascota ya tiene chapita"
      />,
    );
    expect(html).toContain("Reclamar mascota existente");
    expect(html).toContain("Tu mascota ya tiene chapita");
  });

  it("renders the href as an anchor", () => {
    const html = render(
      <ActionLinkCard
        href="/mis-mascotas/postulaciones"
        icon="corazon"
        title="Mis postulaciones"
        description="Adopciones a las que te postulaste"
      />,
    );
    expect(html).toContain('href="/mis-mascotas/postulaciones"');
  });

  it("renders badge when badge > 0", () => {
    const html = render(
      <ActionLinkCard
        href="/mis-mascotas/postulaciones"
        icon="corazon"
        title="Mis postulaciones"
        description="Adopciones a las que te postulaste"
        badge={3}
      />,
    );
    expect(html).toContain(">3<");
  });

  it("does not render badge when badge is 0", () => {
    const html = render(
      <ActionLinkCard
        href="/mis-mascotas/postulaciones"
        icon="corazon"
        title="Mis postulaciones"
        description="Adopciones a las que te postulaste"
        badge={0}
      />,
    );
    // Badge span should not appear — 0 is falsy in the badge > 0 check
    expect(html).not.toContain("min-w-[1.25rem]");
  });

  it("renders nothing when hideWhenZero is true and badge is 0", () => {
    const html = render(
      <ActionLinkCard
        href="/cuenta/memberships"
        icon="edificio"
        title="Transferencias pendientes"
        description="Mascotas que alguien quiere transferirte"
        badge={0}
        hideWhenZero
      />,
    );
    expect(html).toBe("");
  });

  it("renders nothing when hideWhenZero is true and badge is null", () => {
    const html = render(
      <ActionLinkCard
        href="/cuenta/memberships"
        icon="edificio"
        title="Transferencias pendientes"
        description="Mascotas que alguien quiere transferirte"
        badge={null}
        hideWhenZero
      />,
    );
    expect(html).toBe("");
  });

  it("renders when hideWhenZero is true and badge > 0", () => {
    const html = render(
      <ActionLinkCard
        href="/cuenta/memberships"
        icon="edificio"
        title="Transferencias pendientes"
        description="Mascotas que alguien quiere transferirte"
        badge={2}
        hideWhenZero
      />,
    );
    expect(html).toContain("Transferencias pendientes");
    expect(html).toContain(">2<");
  });

  it("renders normally without badge or hideWhenZero", () => {
    const html = render(
      <ActionLinkCard
        href="/mis-mascotas/reclamar"
        icon="qr"
        title="Reclamar mascota existente"
        description="Ya registrada"
      />,
    );
    expect(html).toContain("Reclamar mascota existente");
    expect(html).not.toContain("min-w-[1.25rem]");
  });
});
