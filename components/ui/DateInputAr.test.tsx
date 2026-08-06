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
import { describe, expect, it, vi } from "vitest";

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

  it("syncs the submitted ISO on CHANGE, before blur (implicit Enter submit)", () => {
    // A GET-form Enter submit does not blur the field first, so the hidden ISO
    // must already be current when the date is complete — else the typed value
    // is silently dropped (the Cursor-review HIGH regression).
    const { container } = render(<DateInputAr name="from" />);
    const input = textbox(container);
    fireEvent.change(input, { target: { value: "15072026" } });
    // No blur fired — the hidden ISO is already the typed date.
    expect(hidden(container, "from").value).toBe("2026-07-15");
  });

  it("re-editing an existing date updates the ISO on change, not a stale value", () => {
    const { container } = render(<DateInputAr name="from" defaultValue="2026-07-01" />);
    const input = textbox(container);
    expect(hidden(container, "from").value).toBe("2026-07-01");
    fireEvent.change(input, { target: { value: "15072026" } });
    expect(hidden(container, "from").value).toBe("2026-07-15");
  });

  it("ignores a calendar-invalid ISO default (tampered URL) — renders blank", () => {
    const { container } = render(<DateInputAr name="from" defaultValue="2026-99-99" />);
    expect(textbox(container).value).toBe("");
    expect(hidden(container, "from").value).toBe("");
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

  describe("onValueChange (commit-worthy signal)", () => {
    it("fires with the ISO value once a date becomes complete and valid", () => {
      const onValueChange = vi.fn();
      const { container } = render(<DateInputAr name="from" onValueChange={onValueChange} />);
      const input = textbox(container);
      fireEvent.change(input, { target: { value: "1" } });
      fireEvent.change(input, { target: { value: "15" } });
      fireEvent.change(input, { target: { value: "1507" } });
      expect(onValueChange).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: "15072026" } });
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenLastCalledWith("2026-07-15");
    });

    it("fires with an empty string once the field is fully cleared", () => {
      const onValueChange = vi.fn();
      const { container } = render(
        <DateInputAr name="from" defaultValue="2026-07-03" onValueChange={onValueChange} />,
      );
      fireEvent.change(textbox(container), { target: { value: "" } });
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenLastCalledWith("");
    });

    it("does NOT fire while a complete-but-impossible date is mid-typed", () => {
      const onValueChange = vi.fn();
      const { container } = render(<DateInputAr name="from" onValueChange={onValueChange} />);
      fireEvent.change(textbox(container), { target: { value: "32132026" } });
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it("does NOT fire again on blur (blur has no separate commit signal)", () => {
      const onValueChange = vi.fn();
      const { container } = render(<DateInputAr name="from" onValueChange={onValueChange} />);
      const input = textbox(container);
      fireEvent.change(input, { target: { value: "15072026" } });
      onValueChange.mockClear();
      fireEvent.blur(input);
      expect(onValueChange).not.toHaveBeenCalled();
    });
  });

  // The composing consumer's contract (PetSightingForm pairs this with a
  // TimeInputAr): this callback tracks the hidden ISO exactly — including the
  // empties `onValueChange` deliberately withholds — so a half-typed date can
  // never leave the composed datetime holding a stale valid one.
  describe("onHiddenValueChange (mirror of the submitted ISO)", () => {
    it("fires with the empty string while a date is incomplete, then with the ISO", () => {
      const onHiddenValueChange = vi.fn();
      const { container } = render(
        <DateInputAr name="from" onHiddenValueChange={onHiddenValueChange} />,
      );
      const input = textbox(container);
      fireEvent.change(input, { target: { value: "1507" } });
      expect(onHiddenValueChange).toHaveBeenLastCalledWith("");
      fireEvent.change(input, { target: { value: "15072026" } });
      expect(onHiddenValueChange).toHaveBeenLastCalledWith("2026-07-15");
    });

    it("empties when a previously valid date is edited down to a partial one", () => {
      const onHiddenValueChange = vi.fn();
      const { container } = render(
        <DateInputAr
          name="from"
          defaultValue="2026-07-03"
          onHiddenValueChange={onHiddenValueChange}
        />,
      );
      fireEvent.change(textbox(container), { target: { value: "0307202" } });
      expect(onHiddenValueChange).toHaveBeenLastCalledWith("");
    });

    it("empties on blur for an impossible date", () => {
      const onHiddenValueChange = vi.fn();
      const { container } = render(
        <DateInputAr
          name="from"
          defaultValue="2026-07-03"
          onHiddenValueChange={onHiddenValueChange}
        />,
      );
      const input = textbox(container);
      fireEvent.change(input, { target: { value: "32132026" } });
      fireEvent.blur(input);
      expect(onHiddenValueChange).toHaveBeenLastCalledWith("");
    });
  });
});
