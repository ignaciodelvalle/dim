"use client";

// MpfExportGate — the gated MPF fiscal export inside the inspector's Acciones
// tab (task #12, folds in plan T1). The bare MpfExportButton fired the export
// with a single click; the gate adds the guardrails the PO asked for:
//
//   1. TRIAGE GATE: a report still in `open` (untriaged) cannot be exported —
//      the button is disabled with an explanation. The formal MPF PDF is a
//      fiscal act; it must follow at least a triage decision.
//   2. JURISDICTION GATE (capability-gating pattern, engram
//      pattern/locality-variable-capability-gating): the generated PDF is
//      hardwired to "MPF CABA" (lib/analytics/welfare-exports.ts) — no
//      per-province routing exists. Offering this button for a report outside
//      MPF_CONFIGURED_PROVINCES would misroute a formal fiscal document, so it
//      is disabled with a visible explanation instead. Gated by the REPORT's
//      jurisdiction — see lib/domain/mpf-jurisdiction.ts and MpfExportButton.tsx
//      for the admin/govt scoping rationale (they coincide by construction).
//   3. CONFIRM + REASON: a nested modal ConfirmDialog OVER the (non-modal)
//      inspector requires a written reason before generating. The dialog is the
//      only modal surface in the inspector — deliberately, per spec.
//
// The server action (generateMpfExportAction) re-runs auth + jurisdiction scope
// AND the MPF-configured check on its own (src/modules/welfare/actions.ts) —
// this gate is UX, not the security/routing boundary.
//
// WHY a visible <a> instead of window.open(url) after the await: the browser
// popup blocker kills a window.open() call that isn't inside the direct click
// gesture (this one runs after an async server action), so the tab silently
// never opens while the UI still claimed success — the único fiscal output
// could vanish behind a green check. Mirrors MpfExportButton.tsx's fix (H3
// backlog).

import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { OpButton } from "@/components/ui/dashboard";
import { isMpfConfiguredForProvince } from "@/lib/domain/mpf-jurisdiction";
import { generateMpfExportAction } from "@/src/modules/welfare/actions";

const MIN_REASON = 10;

export function MpfExportGate({
  welfareReportId,
  status,
  jurisdictionProvince,
}: {
  welfareReportId: string;
  status: string;
  jurisdictionProvince: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const untriaged = status === "open";
  const mpfConfigured = isMpfConfiguredForProvince(jurisdictionProvince);
  const reasonValid = reason.trim().length >= MIN_REASON;

  async function confirmExport() {
    if (!reasonValid) return;
    setPending(true);
    setError(null);
    setSignedUrl(null);
    try {
      const result = await generateMpfExportAction(welfareReportId);
      if (!result.ok) {
        setError(
          result.error === "pdf_render_failed"
            ? "Error al generar el PDF. Intentá de nuevo."
            : result.error === "storage_upload_failed"
              ? "Error al subir el PDF. Verificá la conectividad con el servidor."
              : result.error === "mpf_not_configured"
                ? "El export a fiscalía no está configurado para esta jurisdicción."
                : "Error al generar el export. Intentá de nuevo.",
        );
      } else {
        setSignedUrl(result.signedUrl);
        setOpen(false);
        setReason("");
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
        disabled={untriaged || !mpfConfigured || pending}
        title={
          mpfConfigured
            ? undefined
            : "El export a fiscalía no está configurado para tu jurisdicción."
        }
        onClick={(e) => {
          // OpButton is not a forwardRef component — capture the actual element
          // from the event so ConfirmDialog can restore focus here on close.
          triggerRef.current = e.currentTarget;
          setOpen(true);
        }}
      >
        Generar PDF MPF
      </OpButton>

      {!mpfConfigured && (
        <p className="text-[var(--text-xs)] text-ln-op-warn">
          El export a fiscalía no está configurado para tu jurisdicción.
        </p>
      )}
      {mpfConfigured && untriaged && (
        <p className="text-[var(--text-xs)] text-ln-op-warn">
          Triage la denuncia (marcala revisada o iniciá seguimiento) antes de generar el export
          fiscal.
        </p>
      )}
      {error && <p className="text-[var(--text-xs)] text-ln-op-danger">{error}</p>}
      {signedUrl && (
        <p className="text-[var(--text-xs)] text-ln-op-ok">
          PDF generado.{" "}
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ln-op-azul hover:underline"
          >
            Abrir/Descargar el informe
          </a>{" "}
          — el link expira en 24 horas.
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
