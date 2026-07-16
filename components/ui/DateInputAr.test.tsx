// @vitest-environment jsdom
//
// DateInputAr is the browser-independent dd/mm/aaaa date entry that replaced
// native `<input type="date">` on the operator filter surfaces (Safari/Firefox
// showed mm/dd/yyyy and submitted the wrong range). These tests pin the load-
// bearing contract:
//   - the SUBMITTED value is always ISO yyyy-mm-dd on a named hidden input, so
//     the GET filter query is unchanged,
//   - the VISIBLE value is dd/mm/aaaa text we control (never a native date),
//   - an impossible date is CLEARED (hidden ISO empties) with an inline hint,
//   - it is keyboard-operable and label-associable.

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DateInputAr } from "./DateInputAr";

function hidden(container: HTMLElement, name: string): HTMLInputElement {
  return container.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement;
}

function textbox(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="text"]') as HTMLInputElement;
}

describe("DateInputAr", () => {
  it("renders an ISO defaultValue as dd/mm/aaaa but submits the ISO value", () => {
    const { container } = render(<DateInputAr name="from" defaultValue="2026-07-03" />);
    expect(textbox(container).value).toBe("03/07/2026");
    expect(hidden(container, "from").value).toBe("2026-07-03");
  });

  it("renders a blank field for an empty/undefined default", () => {
    const { container } = render(<DateInputAr name="from" defaultValue={null} />);
    expect(textbox(container).value).toBe("");
    expect(hidden(container, "from").value).toBe("");
  });

  it("does NOT render a native date input (the whole point)", () => {
    const { container } = render(<DateInputAr name="from" />);
    expect(container.querySelector('input[type="date"]')).toBeNull();
    // The visible input carries no name — only the hidden ISO field is submitted.
    expect(textbox(container).getAttribute("name")).toBeNull();
  });

  it("keyboard entry of dd/mm/aaaa parses to ISO on blur (03/07 => 3-July)", () => {
    const { container } = render(<DateInputAr name="from" />);
    const input = textbox(container);
    // Simulate typing digits — the mask inserts slashes.
    fireEvent.change(input, { target: { value: "03072026" } });
    expect(input.value).toBe("03/07/2026");
    fireEvent.blur(input);
    expect(input.value).toBe("03/07/2026");
    expect(hidden(container, "from").value).toBe("2026-07-03");
  });

  it("clears the submitted ISO and shows an inline hint for an impossible date", () => {
    const { container } = render(<DateInputAr name="from" defaultValue="2026-07-03" />);
    const input = textbox(container);
    fireEvent.change(input, { target: { value: "32/13/2026" } });
    fireEvent.blur(input);
    expect(hidden(container, "from").value).toBe("");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const error = container.querySelector('[role="alert"]') as HTMLElement;
    expect(error).not.toBeNull();
    expect(error.textContent).toBe("Fecha inválida (usá dd/mm/aaaa)");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
  });

  it("clearing the field empties the submitted ISO without an error", () => {
    const { container } = render(<DateInputAr name="from" defaultValue="2026-07-03" />);
    const input = textbox(container);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(hidden(container, "from").value).toBe("");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("exposes an accessible name and numeric input mode", () => {
    const { container } = render(<DateInputAr name="from" ariaLabel="Desde" />);
    const input = textbox(container);
    expect(input.getAttribute("aria-label")).toBe("Desde");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("placeholder")).toBe("dd/mm/aaaa");
  });

  it("binds an external <label htmlFor> via the id prop", () => {
    const { container } = render(
      <>
        <label htmlFor="audit-from">Desde</label>
        <DateInputAr id="audit-from" name="from" />
      </>,
    );
    expect(textbox(container).id).toBe("audit-from");
  });
});
