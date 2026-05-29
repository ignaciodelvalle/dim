// Smoke tests for <Checkbox>, <Radio>, <Fieldset>. Same render-via-server
// pattern as Field.test.tsx — see that file for the rationale.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Checkbox } from "./Checkbox";
import { Fieldset } from "./Fieldset";
import { Radio } from "./Radio";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("<Checkbox>", () => {
  it("wraps the label in a <label htmlFor> that matches the input id", () => {
    const html = render(<Checkbox name="terms">Acepto los términos</Checkbox>);
    const labelMatch = html.match(/<label[^>]*for="([^"]+)"/);
    const inputMatch = html.match(/<input[^>]*id="([^"]+)"/);
    expect(labelMatch).not.toBeNull();
    expect(inputMatch).not.toBeNull();
    expect(labelMatch?.[1]).toBe(inputMatch?.[1]);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("Acepto los términos");
  });

  it("respects an explicit id over the auto-generated one", () => {
    const html = render(
      <Checkbox id="my-terms" name="terms">
        Acepto
      </Checkbox>,
    );
    expect(html).toMatch(/id="my-terms"/);
    expect(html).toMatch(/for="my-terms"/);
  });

  it("emits aria-invalid when invalid", () => {
    const html = render(
      <Checkbox name="terms" invalid>
        Acepto
      </Checkbox>,
    );
    expect(html).toMatch(/aria-invalid="true"/);
  });

  it("forwards arbitrary input props (name, value, required, defaultChecked)", () => {
    const html = render(
      <Checkbox name="vaccines" value="rabies" required defaultChecked>
        Antirrábica
      </Checkbox>,
    );
    expect(html).toContain('name="vaccines"');
    expect(html).toContain('value="rabies"');
    expect(html).toMatch(/\brequired(\s|=|>|\/)/);
    expect(html).toMatch(/\bchecked(\s|=|>|\/)/);
  });

  it("renders label-less (no <label> wrapper) when children is omitted, keeping aria-label", () => {
    const html = render(<Checkbox name="row" aria-label="Seleccionar fila" />);
    expect(html).not.toContain("<label");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('aria-label="Seleccionar fila"');
  });
});

describe("<Radio>", () => {
  it("renders type=radio and a matched label", () => {
    const html = render(
      <Radio name="procedure" value="castration">
        Castración
      </Radio>,
    );
    expect(html).toContain('type="radio"');
    expect(html).toContain("Castración");
    const labelMatch = html.match(/<label[^>]*for="([^"]+)"/);
    const inputMatch = html.match(/<input[^>]*id="([^"]+)"/);
    expect(labelMatch?.[1]).toBe(inputMatch?.[1]);
  });

  it("renders label-less (no <label> wrapper) when children is omitted", () => {
    const html = render(<Radio name="row" value="a" aria-label="Opción A" />);
    expect(html).not.toContain("<label");
    expect(html).toContain('type="radio"');
    expect(html).toContain('aria-label="Opción A"');
  });

  it("two radios with the same name remain selectable as a group (distinct ids)", () => {
    const html = render(
      <>
        <Radio name="procedure" value="castration">
          Castración
        </Radio>
        <Radio name="procedure" value="spay">
          Ovariectomía
        </Radio>
      </>,
    );
    const ids = [...html.matchAll(/<input[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect((html.match(/name="procedure"/g) ?? []).length).toBe(2);
  });
});

describe("<Fieldset>", () => {
  it("renders <fieldset><legend> and includes the legend text", () => {
    const html = render(
      <Fieldset legend="Procedimiento">
        <Radio name="procedure" value="castration">
          Castración
        </Radio>
      </Fieldset>,
    );
    expect(html).toMatch(/<fieldset[^>]*>/);
    expect(html).toMatch(/<legend[^>]*>[\s\S]*Procedimiento/);
  });

  it("shows required asterisk and hides (opcional) when required", () => {
    const html = render(
      <Fieldset legend="Procedimiento" required>
        <Radio name="p" value="a">
          A
        </Radio>
      </Fieldset>,
    );
    expect(html).toContain("*");
    expect(html).not.toContain("(opcional)");
  });

  it("shows (opcional) by default", () => {
    const html = render(
      <Fieldset legend="Vacunas">
        <Checkbox name="v" value="r">
          Antirrábica
        </Checkbox>
      </Fieldset>,
    );
    expect(html).toContain("(opcional)");
  });

  it("wires aria-describedby to help id when no error", () => {
    const html = render(
      <Fieldset legend="Vacunas" help="Marcá las aplicadas">
        <Checkbox name="v" value="r">
          Antirrábica
        </Checkbox>
      </Fieldset>,
    );
    expect(html).toContain("Marcá las aplicadas");
    const dbMatch = html.match(/<fieldset[^>]*aria-describedby="([^"]+)"/);
    expect(dbMatch?.[1]).toMatch(/-help$/);
    expect(html).not.toMatch(/<fieldset[^>]*aria-invalid="true"/);
  });

  it("hides help, shows error with role=alert, sets aria-invalid on fieldset", () => {
    const html = render(
      <Fieldset legend="Procedimiento" help="Elegí una opción" error="Es obligatorio">
        <Radio name="p" value="a">
          A
        </Radio>
      </Fieldset>,
    );
    expect(html).not.toContain("Elegí una opción");
    expect(html).toContain("Es obligatorio");
    expect(html).toMatch(/role="alert"/);
    expect(html).toMatch(/<fieldset[^>]*aria-invalid="true"/);
    const dbMatch = html.match(/<fieldset[^>]*aria-describedby="([^"]+)"/);
    expect(dbMatch?.[1]).toMatch(/-error$/);
  });
});
