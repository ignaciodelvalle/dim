// Smoke tests for the Field + Input/Textarea/Select primitives.
//
// Renders via react-dom/server → HTML string and asserts contract. The repo
// does not pull @testing-library/react / jsdom because the rest of the test
// suite is DB-driven (Node environment, no DOM). For Poncho primitives that's
// enough: every assertion below targets server-renderable behaviour (id
// generation, htmlFor wiring, aria-describedby concat, role="alert" on error).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Field } from "./Field";
import { Input } from "./Input";
import { Select } from "./Select";
import { Textarea } from "./Textarea";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("<Field>", () => {
  it("renders a label whose htmlFor matches the control's id", () => {
    const html = render(
      <Field label="Nombre">{({ id }) => <Input id={id} type="text" defaultValue="" />}</Field>,
    );
    // label and input share the same id (useId is deterministic per-render).
    const labelMatch = html.match(/<label[^>]*for="([^"]+)"/);
    const inputMatch = html.match(/<input[^>]*id="([^"]+)"/);
    expect(labelMatch).not.toBeNull();
    expect(inputMatch).not.toBeNull();
    expect(labelMatch?.[1]).toBe(inputMatch?.[1]);
    expect(html).toContain("Nombre");
  });

  it("emits aria-describedby pointing to help text when no error", () => {
    const html = render(
      <Field label="Email" help="Te lo pedimos para enviarte el código">
        {({ id, describedBy }) => (
          <Input id={id} type="email" aria-describedby={describedBy} defaultValue="" />
        )}
      </Field>,
    );
    expect(html).toContain("Te lo pedimos para enviarte el código");
    const describedByMatch = html.match(/aria-describedby="([^"]+)"/);
    expect(describedByMatch).not.toBeNull();
    expect(describedByMatch?.[1]).toMatch(/-help$/);
    // No aria-invalid when there's no error.
    expect(html).not.toMatch(/aria-invalid="true"/);
  });

  it("hides the help, shows error with role=alert, and flags the control as invalid", () => {
    const html = render(
      <Field label="DNI" help="8 dígitos" error="DNI inválido">
        {({ id, describedBy, invalid }) => (
          <Input id={id} type="text" aria-describedby={describedBy} invalid={invalid} />
        )}
      </Field>,
    );
    expect(html).not.toContain("8 dígitos");
    expect(html).toContain("DNI inválido");
    expect(html).toMatch(/role="alert"/);
    expect(html).toMatch(/aria-invalid="true"/);
    const describedByMatch = html.match(/aria-describedby="([^"]+)"/);
    expect(describedByMatch?.[1]).toMatch(/-error$/);
  });

  it("shows the required asterisk and suppresses the (opcional) marker", () => {
    const html = render(
      <Field label="Apellido" required>
        {({ id }) => <Input id={id} type="text" defaultValue="" />}
      </Field>,
    );
    expect(html).toContain("*");
    expect(html).not.toContain("(opcional)");
  });

  it("shows (opcional) by default (no required prop)", () => {
    const html = render(
      <Field label="Notas">{({ id }) => <Textarea id={id} defaultValue="" />}</Field>,
    );
    expect(html).toContain("(opcional)");
  });

  it("composes correctly with Textarea and Select children", () => {
    const html = render(
      <>
        <Field label="Bio">
          {({ id, invalid }) => <Textarea id={id} invalid={invalid} defaultValue="" />}
        </Field>
        <Field label="Especie">
          {({ id, invalid }) => (
            <Select id={id} invalid={invalid} defaultValue="dog">
              <option value="dog">Perro</option>
              <option value="cat">Gato</option>
            </Select>
          )}
        </Field>
      </>,
    );
    expect(html).toContain("<textarea");
    expect(html).toContain("<select");
    expect(html).toContain("Perro");
    expect(html).toContain("Gato");
  });
});
