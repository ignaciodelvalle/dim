"use client";

// Client-side wrapper for the approval queues (/admin/cola and /gob/cola).
// Renders each pending request as a row with a checkbox; when ≥ 1 are
// selected, a sticky BulkActionBar appears with Approve / Reject. Modals
// drive the corresponding bulk server action; results show per-item
// success / failure inline so partial-failure (e.g. some items out of the
// govt's scope) is legible.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  type BulkResult,
  bulkApproveRequestsAction,
  bulkRejectRequestsAction,
} from "@/app/actions/bulk-actions";

export type QueueItem = {
  publicToken: string;
  typeLabel: string;
  applicantName: string;
  jurisdiction: string;
  createdAt: string;
};

export function BulkApprovalQueueList({
  items,
  detailUrlPrefix,
}: {
  items: QueueItem[];
  detailUrlPrefix: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"none" | "approve" | "reject">("none");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [lastResult, setLastResult] = useState<BulkResult | null>(null);

  function toggle(token: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(items.map((i) => i.publicToken)));
  }

  function clear() {
    setSelected(new Set());
    setMode("none");
    setLastResult(null);
    setDecisionNotes("");
  }

  function runApprove() {
    const tokens = Array.from(selected);
    setLastResult(null);
    startTransition(async () => {
      const result = await bulkApproveRequestsAction({
        requestPublicTokens: tokens,
        decisionNotes: decisionNotes.trim() || null,
      });
      setLastResult(result);
      router.refresh();
    });
  }

  function runReject() {
    const tokens = Array.from(selected);
    setLastResult(null);
    startTransition(async () => {
      const result = await bulkRejectRequestsAction({
        requestPublicTokens: tokens,
        reason: decisionNotes,
      });
      setLastResult(result);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-500">
        Cuando lleguen nuevas solicitudes vas a verlas acá.
      </p>
    );
  }

  const allSelected = selected.size === items.length;
  const someSelected = selected.size > 0;

  return (
    <div className="space-y-3 pb-32">
      <div className="flex items-center gap-3 text-xs text-neutral-500">
        <button
          type="button"
          onClick={allSelected ? clear : selectAll}
          className="underline hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          {allSelected ? "Deseleccionar todo" : `Seleccionar todo (${items.length})`}
        </button>
      </div>

      <ul className="space-y-2">
        {items.map((item) => {
          const isSelected = selected.has(item.publicToken);
          return (
            <li
              key={item.publicToken}
              className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${
                isSelected
                  ? "border-neutral-900 dark:border-neutral-50 bg-neutral-50 dark:bg-neutral-900"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <input
                id={`row-${item.publicToken}`}
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(item.publicToken)}
                className="mt-1 h-4 w-4"
              />
              <Link
                href={`${detailUrlPrefix}/${item.publicToken}`}
                className="flex-1 min-w-0 space-y-0.5"
              >
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {item.typeLabel}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {item.applicantName} · {item.jurisdiction}
                </p>
                <p className="text-[10px] text-neutral-400 dark:text-neutral-600 font-mono">
                  {item.publicToken} · {item.createdAt}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      {lastResult && <ResultPanel result={lastResult} onDismiss={() => setLastResult(null)} />}

      {someSelected && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 z-50">
          <div className="max-w-5xl mx-auto px-6 py-3 space-y-3">
            {mode === "none" && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm">
                  <span className="font-medium">{selected.size}</span> seleccionada
                  {selected.size === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clear}
                    className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("reject")}
                    className="px-3 py-1.5 rounded text-sm border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("approve")}
                    className="px-3 py-1.5 rounded text-sm bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Aprobar
                  </button>
                </div>
              </div>
            )}

            {mode === "approve" && (
              <ConfirmRow
                title={`Aprobar ${selected.size} solicitud${selected.size === 1 ? "" : "es"}`}
                placeholder="Notas (opcional)"
                value={decisionNotes}
                onChange={setDecisionNotes}
                confirmLabel="Confirmar aprobación"
                confirmClass="bg-emerald-600 text-white hover:bg-emerald-700"
                pending={pending}
                onConfirm={runApprove}
                onCancel={() => setMode("none")}
              />
            )}

            {mode === "reject" && (
              <ConfirmRow
                title={`Rechazar ${selected.size} solicitud${selected.size === 1 ? "" : "es"}`}
                placeholder="Motivo del rechazo (mínimo 5 caracteres) *"
                value={decisionNotes}
                onChange={setDecisionNotes}
                confirmLabel="Confirmar rechazo"
                confirmClass="bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 hover:bg-neutral-800"
                confirmDisabled={decisionNotes.trim().length < 5}
                pending={pending}
                onConfirm={runReject}
                onCancel={() => setMode("none")}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmRow({
  title,
  placeholder,
  value,
  onChange,
  confirmLabel,
  confirmClass,
  confirmDisabled,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  confirmLabel: string;
  confirmClass: string;
  confirmDisabled?: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-3 py-1.5 rounded text-sm border border-neutral-300 dark:border-neutral-700"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || confirmDisabled}
          className={`px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 ${confirmClass}`}
        >
          {pending ? "Procesando..." : confirmLabel}
        </button>
      </div>
    </div>
  );
}

function ResultPanel({ result, onDismiss }: { result: BulkResult; onDismiss: () => void }) {
  return (
    <div className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-3 space-y-2 text-sm">
      <div className="flex items-baseline justify-between">
        <p className="font-medium">
          {result.succeeded.length} OK · {result.failed.length} fallaron
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          Cerrar
        </button>
      </div>
      {result.failed.length > 0 && (
        <ul className="text-xs text-red-700 dark:text-red-300 space-y-0.5">
          {result.failed.map((f) => (
            <li key={f.id}>
              <span className="font-mono">{f.id}</span> — {f.reason}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-neutral-500 font-mono">bulk: {result.bulkActionId}</p>
    </div>
  );
}
