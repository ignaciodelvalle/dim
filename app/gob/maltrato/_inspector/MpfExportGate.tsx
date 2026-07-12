"use client";

// MpfExportGate — the gated MPF fiscal export inside the inspector's Acciones
// tab (task #12, folds in plan T1). The bare MpfExportButton fired the export
// with a single click; the gate adds the guardrails the PO asked for:
//
//   1. TRIAGE GATE: a report still in `open` (untriaged) cannot be exported —
//      the button is disabled with an explanation. The formal MPF PDF is a
//      fiscal act; it must follow at least a triage decision.
//   2. CONFIRM + REASON: a nested modal ConfirmDialog OVER the (non-modal)
//      inspector requires a written reason before generating. The dialog is the
//      only modal surface in the inspector — deliberately, per spec.
//
// The server action (generateMpfExportAction) re-runs auth + jurisdiction scope
// on its own (src/modules/welfare/actions.ts) — this gate is UX, not the
// security boundary.

import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { OpButton } from "@/components/ui/dashboard";
import { generateMpfExportAction } from "@/src/modules/welfare/actions";

const MIN_REASON = 10;

export function MpfExportGate({
  welfareReportId,
  status,
}: {
  welfareReportId: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const untriaged = status === "open";
  const reasonValid = reason.trim().length >= MIN_REASON;

  async function confirmExport() {
    if (!reasonValid) return;
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await generateMpfExportAction(welfareReportId);
      if (!result.ok) {
        setError(
          result.error === "pdf_render_failed"
            ? "Error al generar el PDF. Intentá de nuevo."
            : result.error === "storage_upload_failed"
              ? "Error al subir el PDF. Verificá la conectividad con el servidor."
              : "Error al generar el export. Intentá de nuevo.",
        );
      } else {
        setSuccess(true);
        setOpen(false);
        setReason("");
        window.open(result.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setError("Error inesperado. Intentá de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <OpButton
        type="button"
        variant="primary"
        disabled={untriaged || pending}
        onClick={(e) => {
          // OpButton is not a forwardRef component — capture the actual element
          // from the event so ConfirmDialog can restore focus here on close.
          triggerRef.current = e.currentTarget;
          setOpen(true);
        }}
      >
        Generar PDF MPF
      </OpButton>

      {untriaged && (
        <p className="text-[var(--text-xs)] text-ln-op-warn">
          Triage la denuncia (marcala revisada o iniciá seguimiento) antes de generar el export
          fiscal.
        </p>
      )}
      {error && <p className="text-[var(--text-xs)] text-ln-op-danger">{error}</p>}
      {success && (
        <p className="text-[var(--text-xs)] text-ln-op-ok">
          PDF generado. Se abrió en una nueva pestaña. El link expira en 24 horas.
        </p>
      )}
      <p className="text-xs text-ln-op-mute">
        PDF formal para presentar ante la Unidad Fiscal de Maltrato Animal del MPF CABA (Ley
        14.346).
      </p>

      <ConfirmDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        onConfirm={confirmExport}
        title="Generar export fiscal MPF"
        description="Se generará un PDF formal para el MPF. Indicá el motivo del export para el registro interno."
        confirmLabel="Generar PDF"
        cancelLabel="Cancelar"
        tone="neutral"
        pending={pending}
        triggerRef={triggerRef}
      >
        <div className="px-5 pb-1">
          <label
            htmlFor="mpf-export-reason"
            className="mb-1 block text-[var(--text-sm)] font-medium text-[var(--color-ln-ink-2)]"
          >
            Motivo del export
          </label>
          <textarea
            id="mpf-export-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={`Motivo del export fiscal (mínimo ${MIN_REASON} caracteres)`}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-3 py-2 text-[var(--text-sm)] text-[var(--color-ln-ink)]"
          />
          <p className="mt-1 text-[var(--text-xs)] text-[var(--color-ln-mute)] tabular-nums">
            {reason.trim().length} caracteres
            {!reasonValid && ` · faltan ${Math.max(0, MIN_REASON - reason.trim().length)}`}
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
