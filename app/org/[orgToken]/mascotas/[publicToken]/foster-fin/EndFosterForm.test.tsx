// @vitest-environment jsdom
//
// EndFosterForm — the modal gate added by D.3 clase 1 (2026-07-30).
//
// Closing a foster stay ends a custody arrangement and lands an append-only
// event that can never be edited away; the form used to submit straight off its
// only button. The gate wraps the SUBMIT, not the action: the <form action> +
// useActionState wiring is untouched and confirming calls requestSubmit() on
// it, so the server action, its pending state and its error rendering behave
// exactly as before.
//
// The load-bearing assertion is the FIRST CLICK: it must open a dialog and NOT
// submit.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const endFosterAction = vi.fn();
vi.mock("@/src/modules/foster/actions", () => ({
  endFosterAction: (...args: unknown[]) => endFosterAction(...args),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

import { EndFosterForm } from "./EndFosterForm";

const props = { orgToken: "org-1", publicToken: "DIM-TEST-0001", fosterName: "Ana" };

beforeEach(() => {
  endFosterAction.mockReset();
  endFosterAction.mockResolvedValue({ error: null });
});

afterEach(() => {
  cleanup();
});

describe("EndFosterForm — closing a foster stay is gated behind a modal", () => {
  it("the first click opens a ConfirmDialog and does NOT submit", () => {
    render(<EndFosterForm {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar tránsito" }));

    expect(endFosterAction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Cerrar el tránsito" })).toBeInTheDocument();
  });

  it("the dialog states the consequence, naming the foster", () => {
    render(<EndFosterForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar tránsito" }));

    const dialog = screen.getByRole("dialog", { name: "Cerrar el tránsito" });
    expect(
      within(dialog).getByText(
        /Esto cierra el tránsito de Ana.*solo en custodia del refugio.*evento inmutable/,
      ),
    ).toBeInTheDocument();
  });

  it("confirming through the dialog submits the form", async () => {
    render(<EndFosterForm {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar tránsito" }));
    const dialog = screen.getByRole("dialog", { name: "Cerrar el tránsito" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar tránsito" }));

    await waitFor(() => {
      expect(endFosterAction).toHaveBeenCalledTimes(1);
    });
    // The bound args survive the requestSubmit() detour.
    expect(endFosterAction.mock.calls[0][0]).toBe("org-1");
    expect(endFosterAction.mock.calls[0][1]).toBe("DIM-TEST-0001");
  });

  it("cancelling the dialog does not submit", () => {
    render(<EndFosterForm {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar tránsito" }));
    const dialog = screen.getByRole("dialog", { name: "Cerrar el tránsito" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(endFosterAction).not.toHaveBeenCalled();
  });

  it('no button in the flow reads "Confirmar" (D.3 grammar)', () => {
    render(<EndFosterForm {...props} />);
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar tránsito" }));
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
  });
});
