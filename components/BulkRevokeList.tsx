"use client";

// Generic bulk-revoke wrapper for the 4 admin/govt queues:
//   - /admin/usuarios (targetKind='vet') — revoke vet roles
//   - /gob/usuarios (targetKind='vet')
//   - /admin/organizaciones (targetKind='org') — revoke org verification
//   - /gob/organizaciones (targetKind='org')
//
// Renders each item via the caller's `renderItem` prop with a checkbox.
// When ≥1 are selected, a floating action bar appears with a single
// "Revocar seleccionados" button that opens a modal collecting the
// shared motivo (≥30 chars) + evidence files. On submit, calls
// `bulkRevokeAction` and shows per-item success/failure inline.
//
// The single-item RevokeUserActions / RevokeOrgActions remain on the
// row for one-off revocations; this component is additive.

import { useId, useRef, useState, useTransition } from "react";

import { type BulkRevokeKind, bulkRevokeAction } from "@/app/actions/bulk-actions";
import { uploadRevocationEvidence } from "@/app/actions/revocation-evidence";
import { createClient } from "@/lib/supabase/client";

const MOTIVO_MIN = 30;

export interface BulkRevokableItem {
  id: string;
  label: string;
}

type UploadedFile = { name: string; attachmentId: string };

interface Props<T extends BulkRevokableItem> {
  items: T[];
  targetKind: BulkRevokeKind;
  actorUserId: string;
  /**
   * Renders the row content (everything except the checkbox the
   * BulkRevokeList provides). The caller controls the existing
   * single-revoke / propose actions inside.
   */
  renderItem: (item: T, selected: boolean) => React.ReactNode;
  /**
   * Whether a given item is bulk-revocable. Use this to skip items
   * that wouldn't apply (e.g. non-verified orgs, owners). Returning
   * false hides the checkbox for that row.
   */
  isRevocable: (item: T) => boolean;
}

export function BulkRevokeList<T extends BulkRevokableItem>({
  items,
  targetKind,
  actorUserId,
  renderItem,
  isRevocable,
}: Props<T>) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedItems = items.filter((i) => selected.has(i.id));
  const hasSelection = selectedItems.length > 0;

  return (
    <>
      <ul className="space-y-2">
        {items.map((item) => {
          const revocable = isRevocable(item);
          return (
            <li
              key={item.id}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3"
            >
              <div className="flex items-start gap-3">
                {revocable ? (
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    aria-label={`Seleccionar ${item.label} para revocación masiva`}
                    className="mt-1.5 h-4 w-4 shrink-0 rounded border-neutral-300 dark:border-neutral-700"
                  />
                ) : (
                  <div className="mt-1.5 h-4 w-4 shrink-0" aria-hidden />
                )}
                <div className="min-w-0 flex-1">{renderItem(item, selected.has(item.id))}</div>
              </div>
            </li>
          );
        })}
      </ul>

      {hasSelection && (
        <div className="sticky bottom-4 z-30 mx-auto mt-6 flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-red-300 bg-white px-4 py-3 shadow-lg dark:border-red-800 dark:bg-neutral-900">
          <span className="text-sm text-neutral-700 dark:text-neutral-300">
            {selectedItems.length} seleccionad{selectedItems.length === 1 ? "o" : "os"} para
            revocación
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-md bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-800 dark:bg-red-800 dark:hover:bg-red-700"
            >
              Revocar seleccionados →
            </button>
          </div>
        </div>
      )}

      {modalOpen && (
        <BulkRevokeModal
          selectedItems={selectedItems}
          targetKind={targetKind}
          actorUserId={actorUserId}
          onClose={() => setModalOpen(false)}
          onDone={() => {
            setModalOpen(false);
            setSelected(new Set());
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface ModalProps {
  selectedItems: BulkRevokableItem[];
  targetKind: BulkRevokeKind;
  actorUserId: string;
  onClose: () => void;
  onDone: () => void;
}

function BulkRevokeModal({ selectedItems, targetKind, actorUserId, onClose, onDone }: ModalProps) {
  const [pending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    succeeded: string[];
    failed: { id: string; reason: string }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const evidenciaInputId = useId();

  const motivoTrimmed = motivo.trim();
  const motivoValid = motivoTrimmed.length >= MOTIVO_MIN;
  const canSubmit =
    motivoValid && uploadedFiles.length >= 1 && confirm && !pending && !uploading && !result;

  async function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    setUploading(true);

    const supabase = createClient();
    const newFiles: UploadedFile[] = [];

    for (const file of files) {
      try {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${actorUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: storageError } = await supabase.storage
          .from("revocations")
          .upload(path, file, { contentType: file.type });
        if (storageError) {
          setError(`Error al subir ${file.name}: ${storageError.message}`);
          setUploading(false);
          return;
        }
        const r = await uploadRevocationEvidence(actorUserId, {
          storagePath: path,
          mimeType: file.type,
          fileSize: file.size,
        });
        if ("error" in r) {
          setError(`Error al registrar ${file.name}: ${r.error}`);
          setUploading(false);
          return;
        }
        newFiles.push({ name: file.name, attachmentId: r.attachmentId });
      } catch {
        setError(`Error inesperado subiendo ${file.name}.`);
        setUploading(false);
        return;
      }
    }
    setUploadedFiles((prev) => [...prev, ...newFiles]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await bulkRevokeAction({
        targetIds: selectedItems.map((i) => i.id),
        targetKind,
        motivo: motivoTrimmed,
        attachmentIds: uploadedFiles.map((f) => f.attachmentId),
      });
      setResult({ succeeded: r.succeeded, failed: r.failed });
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      // biome-ignore lint/a11y/useSemanticElements: native <dialog> requires imperative showModal() which doesn't fit this controlled isOpen pattern; tracked as a follow-up to migrate to a Headless UI modal primitive.
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <header className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">
            Revocar {selectedItems.length} {targetKindLabel(targetKind, selectedItems.length)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            Cerrar
          </button>
        </header>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm">
              <strong className="text-emerald-700 dark:text-emerald-300">
                {result.succeeded.length} revocaciones aplicadas
              </strong>
              {result.failed.length > 0 && (
                <>
                  {" · "}
                  <strong className="text-red-700 dark:text-red-300">
                    {result.failed.length} fallaron
                  </strong>
                </>
              )}
              .
            </p>
            {result.failed.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-xs dark:border-red-900 dark:bg-red-950/30">
                {result.failed.map((f) => (
                  <li key={f.id} className="text-red-900 dark:text-red-200">
                    <span className="font-mono">{f.id.slice(0, 8)}…</span> — {f.reason}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              Recargar lista
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <details className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-800/60">
              <summary className="cursor-pointer font-medium">
                {selectedItems.length} {targetKindLabel(targetKind, selectedItems.length)}{" "}
                alcanzados
              </summary>
              <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto pl-4 text-xs text-neutral-700 dark:text-neutral-300">
                {selectedItems.map((i) => (
                  <li key={i.id}>{i.label}</li>
                ))}
              </ul>
            </details>

            <div>
              <label
                htmlFor="bulk-revoke-motivo"
                className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300"
              >
                Motivo (mínimo {MOTIVO_MIN} caracteres)
              </label>
              <textarea
                id="bulk-revoke-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                placeholder="Describí el motivo común para todas las revocaciones de esta operación."
              />
              <p className="mt-1 text-xs text-neutral-500">
                {motivoTrimmed.length}/{MOTIVO_MIN} caracteres
              </p>
            </div>

            <div>
              <label
                htmlFor={evidenciaInputId}
                className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300"
              >
                Evidencia (al menos 1 archivo)
              </label>
              <input
                id={evidenciaInputId}
                type="file"
                ref={fileInputRef}
                onChange={handleFilesChange}
                multiple
                className="block w-full text-xs"
              />
              {uploading && <p className="mt-1 text-xs text-neutral-500">Subiendo archivos…</p>}
              {uploadedFiles.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {uploadedFiles.map((f) => (
                    <li key={f.attachmentId} className="text-emerald-700 dark:text-emerald-300">
                      ✓ {f.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label className="flex items-start gap-2 text-xs text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Confirmo que esta revocación afecta a {selectedItems.length}{" "}
                {targetKindLabel(targetKind, selectedItems.length)} y entiendo que cada afectado va
                a recibir una notificación con el motivo.
              </span>
            </label>

            {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}

            <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-800 dark:hover:bg-red-700"
              >
                {pending ? "Revocando…" : "Confirmar revocación"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function targetKindLabel(kind: BulkRevokeKind, count: number): string {
  if (kind === "vet") return count === 1 ? "matrícula vet" : "matrículas vet";
  if (kind === "org") return count === 1 ? "organización" : "organizaciones";
  return count === 1 ? "asignación govt" : "asignaciones govt";
}
