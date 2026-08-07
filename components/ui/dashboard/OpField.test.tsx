// @vitest-environment jsdom
//
// Contract test for the operator control primitives (OpInput / OpSelect /
// OpTextarea). These replaced 92 hand-rolled copies of the same chrome across
// app/gob, app/org, app/admin and components/, so the properties pinned here
// are the ones the copies had drifted on:
//
//  - the focus ring fires on `focus-visible:`, not `focus:` (OpButton's rule —
//    ~90 of the old sites flashed a ring on mouse click);
//  - the ring is `ln-op-azul`, not the `ln-op-ok` green this file used to ship;
//  - `invalid` forwards to aria-invalid exactly as LnInput does, so the two
//    skins stay one API;
//  - caller classNames MERGE with the base rather than replace it;
//  - the `size` step is a prop, because `text-sm`/`px-2` passed through
//    className would only beat the base by generated-CSS-order luck.

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OP_CONTROL_CLASS, OP_CONTROL_CLASS_SM, OpInput, OpSelect, OpTextarea } from "./OpField";

describe("op control chrome", () => {
  it("focuses with focus-visible on the azul ring, never a bare focus: ring", () => {
    render(<OpInput aria-label="Código" />);
    const input = screen.getByLabelText("Código");

    expect(input).toHaveClass("focus-visible:ring-2");
    expect(input).toHaveClass("focus-visible:ring-ln-op-azul");
    expect(input).toHaveClass("focus-visible:outline-none");
    // The regression this replaced: a mouse-click ring, and a green one.
    expect(input.className).not.toMatch(/(^|\s)focus:ring-/);
    expect(input.className).not.toMatch(/ring-ln-op-ok/);
  });

  it("wears the shared op chrome tokens", () => {
    render(<OpInput aria-label="Código" />);
    const input = screen.getByLabelText("Código");

    expect(input).toHaveClass("border-ln-op-line");
    expect(input).toHaveClass("bg-ln-op-card");
    expect(input).toHaveClass("text-ln-op-ink");
    expect(input).toHaveClass("rounded-[var(--radius-md)]");
  });

  it("exports the base chrome as a class string for composed controls", () => {
    expect(OP_CONTROL_CLASS).toContain("border-ln-op-line");
    expect(OP_CONTROL_CLASS).toContain("focus-visible:ring-ln-op-azul");
    expect(OP_CONTROL_CLASS).toContain("px-3 py-2 text-md");
    expect(OP_CONTROL_CLASS_SM).toContain("px-3 py-1.5 text-sm");
    expect(OP_CONTROL_CLASS).toContain("w-full");
  });
});

describe("<OpInput>", () => {
  it("merges the caller className instead of replacing the base", () => {
    render(<OpInput aria-label="Código" className="w-40 font-mono" />);
    const input = screen.getByLabelText("Código");

    expect(input).toHaveClass("w-40");
    expect(input).toHaveClass("font-mono");
    expect(input).toHaveClass("bg-ln-op-card");
  });

  it("forwards invalid to aria-invalid, and omits the attribute when valid", () => {
    const { rerender } = render(<OpInput aria-label="Código" invalid />);
    expect(screen.getByLabelText("Código")).toHaveAttribute("aria-invalid", "true");

    rerender(<OpInput aria-label="Código" />);
    expect(screen.getByLabelText("Código")).not.toHaveAttribute("aria-invalid");
  });

  it("forwards standard input props and handlers untouched", () => {
    render(
      <OpInput
        aria-label="Código"
        name="codigo"
        type="text"
        maxLength={8}
        placeholder="DIM-…"
        required
        defaultValue="DIM-0001"
      />,
    );
    const input = screen.getByLabelText("Código") as HTMLInputElement;

    expect(input).toHaveAttribute("name", "codigo");
    expect(input).toHaveAttribute("maxlength", "8");
    expect(input).toHaveAttribute("placeholder", "DIM-…");
    expect(input).toBeRequired();
    expect(input.value).toBe("DIM-0001");
  });

  it("switches density via the size prop, not via className", () => {
    const { rerender } = render(<OpInput aria-label="Código" />);
    expect(screen.getByLabelText("Código")).toHaveClass("text-md");

    rerender(<OpInput aria-label="Código" size="sm" />);
    const dense = screen.getByLabelText("Código");
    expect(dense).toHaveClass("text-sm");
    expect(dense).not.toHaveClass("text-md");
  });

  it("applies font-mono for the mono variant", () => {
    render(<OpInput aria-label="Chip" mono />);
    expect(screen.getByLabelText("Chip")).toHaveClass("font-mono");
  });

  it("accepts a ref — the props type is ComponentPropsWithRef, not *HTMLAttributes", () => {
    // BulkRevokeList focuses its motivo textarea through a ref; typing the
    // props as TextareaHTMLAttributes silently dropped it (React 19 passes ref
    // as a plain prop, so the spread already carried it — only the type lied).
    let el: HTMLInputElement | null = null;
    render(
      <OpInput
        aria-label="Código"
        ref={(node) => {
          el = node;
        }}
      />,
    );
    expect(el).toBe(screen.getByLabelText("Código"));
  });

  it("drops w-full for block={false} so an inline control sizes to content", () => {
    const { rerender } = render(<OpInput aria-label="Código" />);
    expect(screen.getByLabelText("Código")).toHaveClass("w-full");

    rerender(<OpInput aria-label="Código" block={false} />);
    expect(screen.getByLabelText("Código")).not.toHaveClass("w-full");
  });
});

describe("<OpSelect>", () => {
  it("renders its options and keeps the shared chrome", () => {
    render(
      <OpSelect aria-label="Estado" defaultValue="abierto">
        <option value="abierto">Abierto</option>
        <option value="cerrado">Cerrado</option>
      </OpSelect>,
    );

    const select = screen.getByLabelText("Estado") as HTMLSelectElement;
    expect(select).toHaveClass("bg-ln-op-card");
    expect(select).toHaveClass("focus-visible:ring-ln-op-azul");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(select.value).toBe("abierto");
  });

  it("forwards invalid and merges className", () => {
    render(
      <OpSelect aria-label="Estado" invalid className="sm:w-auto">
        <option value="a">A</option>
      </OpSelect>,
    );

    const select = screen.getByLabelText("Estado");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveClass("sm:w-auto");
    expect(select).toHaveClass("border-ln-op-line");
  });
});

describe("<OpTextarea>", () => {
  it("keeps the shared chrome and forwards rows/invalid", () => {
    render(<OpTextarea aria-label="Motivo" rows={4} invalid />);

    const textarea = screen.getByLabelText("Motivo");
    expect(textarea).toHaveAttribute("rows", "4");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toHaveClass("focus-visible:ring-ln-op-azul");
  });

  it("sets no resize utility of its own, so a caller's wins outright", () => {
    render(<OpTextarea aria-label="Motivo" className="resize-none" />);

    const textarea = screen.getByLabelText("Motivo");
    expect(textarea).toHaveClass("resize-none");
    expect(textarea).not.toHaveClass("resize-y");
  });
});
