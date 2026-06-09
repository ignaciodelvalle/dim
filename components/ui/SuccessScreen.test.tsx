// Smoke tests for <LnSuccessScreen>.
// Pattern: renderToStaticMarkup.
// LnSuccessScreen is "use client" and uses useState, but renderToStaticMarkup
// renders the initial state without executing effects or event handlers, so
// the structural markup is fully testable here.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LnSuccessScreen } from "./SuccessScreen";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

const minimalActions = [{ label: "Volver al inicio", href: "/" }];

describe("<LnSuccessScreen>", () => {
  it("renders the title", () => {
    const html = render(<LnSuccessScreen title="Denuncia registrada" next={minimalActions} />);
    expect(html).toContain("Denuncia registrada");
  });

  it("renders description when provided", () => {
    const html = render(
      <LnSuccessScreen
        title="Éxito"
        description="Te notificaremos por email."
        next={minimalActions}
      />,
    );
    expect(html).toContain("Te notificaremos por email.");
  });

  it("does NOT render code block when code is absent", () => {
    const html = render(<LnSuccessScreen title="OK" next={minimalActions} />);
    expect(html).not.toContain("Tu código de seguimiento");
  });

  it("renders confirmation code block when code is provided", () => {
    const html = render(<LnSuccessScreen title="OK" code="DEN-A1B2-C3D4" next={minimalActions} />);
    expect(html).toContain("Tu código de seguimiento");
    expect(html).toContain("DEN-A1B2-C3D4");
    expect(html).toContain("Tocá para copiar");
  });

  it("renders codeWarning when provided", () => {
    const html = render(
      <LnSuccessScreen title="OK" codeWarning="Guardalo bien." next={minimalActions} />,
    );
    expect(html).toContain("Guardalo bien.");
  });

  it("renders an <a> for href actions", () => {
    const html = render(<LnSuccessScreen title="OK" next={[{ label: "Inicio", href: "/" }]} />);
    expect(html).toMatch(/<a[^>]*href="\/"/);
    expect(html).toContain("Inicio");
  });

  it("renders a <button> for onClick actions", () => {
    const html = render(
      <LnSuccessScreen title="OK" next={[{ label: "Nueva denuncia", onClick: () => {} }]} />,
    );
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).toContain("Nueva denuncia");
  });

  it("first action gets primary styling (ln-azul token)", () => {
    const html = render(
      <LnSuccessScreen
        title="OK"
        next={[
          { label: "Primary action", href: "/" },
          { label: "Secondary action", href: "/other" },
        ]}
      />,
    );
    expect(html).toContain("color-ln-azul");
  });

  it("contains ln-* tokens and zero gob-* strings", () => {
    const html = render(
      <LnSuccessScreen
        title="Éxito"
        code="COD-123"
        description="Todo OK"
        codeWarning="Guardalo."
        next={[
          { label: "Volver", href: "/" },
          { label: "Cancelar", onClick: () => {} },
        ]}
      />,
    );
    expect(html).toMatch(/--color-ln-/);
    expect(html).not.toMatch(/\bgob-/);
  });
});
