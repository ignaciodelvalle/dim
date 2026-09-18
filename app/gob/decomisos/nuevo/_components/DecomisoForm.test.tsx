// @vitest-environment jsdom
//
// Executing a decomiso ends on its receipt (L-13). The public code IS the
// receipt — it is what the funcionario writes on the acta — and it used to be
// thrown into a router.push URL. Drives the real form down the unowned-animal
// path (no DC2 double-confirm); only the server actions are mocked.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const executeDecomisoAction = vi.fn();
vi.mock("@/app/actions/decomiso", () => ({
  executeDecomisoAction: (...args: unknown[]) => executeDecomisoAction(...args),
}));
vi.mock("@/app/actions/decomiso-pet-lookup", () => ({
  lookupPetForDecomisoAction: vi.fn(),
}));

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

import { DecomisoForm } from "./DecomisoForm";

const RECEIVER = {
  id: "org-receiver-1",
  displayName: "Refugio Patitas",
  orgType: "shelter",
  jurisdictionProvince: "Buenos Aires",
  jurisdictionLocality: "Tres Arroyos",
};

beforeEach(() => {
  executeDecomisoAction.mockReset().mockResolvedValue({ ok: true, publicCode: "CASE-7Q2K-9XZ4" });
  routerPush.mockReset();
});

afterEach(() => cleanup());

function fillAndSubmit(container: HTMLElement) {
  fireEvent.click(screen.getByRole("button", { name: "Animal sin registrar (callejero)" }));
  fireEvent.change(screen.getByLabelText(/Especie/), { target: { value: "dog" } });
  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "maltrato_fisico" } });
  fireEvent.click(screen.getByRole("button", { name: /Refugio Patitas/ }));
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const acta = new File(["acta"], "acta.pdf", { type: "application/pdf" });
  const foto = new File(["foto"], "foto.pdf", { type: "application/pdf" });
  fireEvent.change(fileInput, { target: { files: [acta, foto] } });
  fireEvent.click(screen.getByRole("button", { name: "Ejecutar decomiso" }));
}

describe("executing a decomiso ends on its receipt", () => {
  it("shows the public code as the receipt, and does not navigate by itself", async () => {
    const { container } = render(
      <DecomisoForm
        receiverOrgs={[RECEIVER]}
        prefillWelfareReportId={null}
        prefillWelfareReportRef={null}
        prefillPetToken={null}
      />,
    );
    fillAndSubmit(container);
    await waitFor(() => expect(executeDecomisoAction).toHaveBeenCalled());

    expect(await screen.findByRole("heading", { name: "Decomiso registrado" })).toBeInTheDocument();
    expect(screen.getByText("Código del decomiso")).toBeInTheDocument();
    expect(screen.getByText("CASE-7Q2K-9XZ4")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Refugio Patitas recibe la propuesta de custodia y tiene 7 días para aceptarla o rechazarla. Mientras tanto, la custodia queda a cargo de tu autoridad.",
      ),
    ).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("the old redirect target survives only as the receipt's first action", async () => {
    const { container } = render(
      <DecomisoForm
        receiverOrgs={[RECEIVER]}
        prefillWelfareReportId={null}
        prefillWelfareReportRef={null}
        prefillPetToken={null}
      />,
    );
    fillAndSubmit(container);

    const first = (await screen.findAllByRole("link"))[0];
    expect(first).toHaveTextContent("Ver el caso");
    expect(first).toHaveAttribute("href", "/casos/CASE-7Q2K-9XZ4?origin=decomiso");
    expect(screen.getByRole("link", { name: "Volver a decomisos" })).toHaveAttribute(
      "href",
      "/gob/decomisos",
    );
  });

  it("a delivery warning is shown ON the receipt, not lost behind a navigation", async () => {
    executeDecomisoAction.mockResolvedValue({
      ok: true,
      publicCode: "CASE-7Q2K-9XZ4",
      warning: "No pudimos avisarle al refugio.",
    });
    const { container } = render(
      <DecomisoForm
        receiverOrgs={[RECEIVER]}
        prefillWelfareReportId={null}
        prefillWelfareReportRef={null}
        prefillPetToken={null}
      />,
    );
    fillAndSubmit(container);

    expect(await screen.findByRole("heading", { name: "Decomiso registrado" })).toBeInTheDocument();
    expect(screen.getByText("No pudimos avisarle al refugio.")).toBeInTheDocument();
  });

  it("an error keeps the form and shows it", async () => {
    executeDecomisoAction.mockResolvedValue({ error: "No se pudo registrar." });
    const { container } = render(
      <DecomisoForm
        receiverOrgs={[RECEIVER]}
        prefillWelfareReportId={null}
        prefillWelfareReportRef={null}
        prefillPetToken={null}
      />,
    );
    fillAndSubmit(container);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo registrar.");
    expect(screen.queryByRole("heading", { name: "Decomiso registrado" })).toBeNull();
  });
});
