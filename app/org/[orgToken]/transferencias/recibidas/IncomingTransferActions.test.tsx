// @vitest-environment jsdom
//
// IncomingTransferActions — ConfirmDialog symmetry fix (audit-3-feedback
// §C2 asymmetry #3, 2026-07-21): accept and reject previously shared an
// inline mode-switch panel with no ConfirmDialog and no stated consequence.
// Both now use ConfirmDialog with consequence copy, and success fires the
// shared notifySaved toast (mutation-feedback convention, §C1) since this
// component never reloads.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const acceptCrossOrgTransferAction = vi.fn();
const rejectCrossOrgTransferAction = vi.fn();
vi.mock("@/src/modules/transfers/actions", () => ({
  acceptCrossOrgTransferAction: (...args: unknown[]) => acceptCrossOrgTransferAction(...args),
  rejectCrossOrgTransferAction: (...args: unknown[]) => rejectCrossOrgTransferAction(...args),
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), error: vi.fn() },
}));

// jsdom doesn't implement native <dialog>.showModal/close — stubbed the
// same way SharesManager.test.tsx does.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

import { IncomingTransferActions } from "./IncomingTransferActions";

const props = { receiverOrgToken: "org-1", casePublicCode: "DC-0001", petName: "Firulais" };

beforeEach(() => {
  acceptCrossOrgTransferAction.mockReset();
  rejectCrossOrgTransferAction.mockReset();
  toastSuccess.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("IncomingTransferActions — accept", () => {
  it("opens a ConfirmDialog naming the consequence, and confirms through it", async () => {
    acceptCrossOrgTransferAction.mockResolvedValue({ ok: true });
    render(<IncomingTransferActions {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    const dialog = screen.getByRole("dialog", {
      name: "Aceptar transferencia entre organizaciones",
    });
    expect(within(dialog).getByText(/Esto transfiere la custodia de Firulais/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Aceptar transferencia" }));

    await waitFor(() => {
      expect(acceptCrossOrgTransferAction).toHaveBeenCalledWith({
        receiverOrgToken: "org-1",
        casePublicCode: "DC-0001",
      });
    });
    expect(screen.getByText("Transferencia aceptada.")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("Transferencia aceptada");
  });

  it("cancelling the dialog does not call the action", () => {
    render(<IncomingTransferActions {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    const dialog = screen.getByRole("dialog", {
      name: "Aceptar transferencia entre organizaciones",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(acceptCrossOrgTransferAction).not.toHaveBeenCalled();
  });

  it("shows the server error and does not toast when accept fails", async () => {
    acceptCrossOrgTransferAction.mockResolvedValue({ error: "El caso ya fue procesado." });
    render(<IncomingTransferActions {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    const dialog = screen.getByRole("dialog", {
      name: "Aceptar transferencia entre organizaciones",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Aceptar transferencia" }));

    await waitFor(() => {
      expect(screen.getByText("El caso ya fue procesado.")).toBeInTheDocument();
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("IncomingTransferActions — reject (same ConfirmDialog mechanism as accept)", () => {
  it("carries the optional reason/message fields inside the dialog and submits them", async () => {
    rejectCrossOrgTransferAction.mockResolvedValue({ ok: true });
    render(<IncomingTransferActions {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    const dialog = screen.getByRole("dialog", {
      name: "Rechazar transferencia entre organizaciones",
    });
    fireEvent.change(within(dialog).getByPlaceholderText("Motivo del rechazo (opcional)"), {
      target: { value: "Duplicado" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Rechazar transferencia" }));

    await waitFor(() => {
      expect(rejectCrossOrgTransferAction).toHaveBeenCalledWith({
        receiverOrgToken: "org-1",
        casePublicCode: "DC-0001",
        reason: "Duplicado",
        message: null,
      });
    });
    expect(screen.getByText("Transferencia rechazada.")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("Transferencia rechazada");
  });
});
