"use client";

// Per-row locality revocation UI for the govt detail page.
//
// State machine: idle → confirming → submitting → done | error
// Mirrors RevokeUserActions.tsx structure — design §8.8.
//
// Wraps the existing revokeGovtLocalityAction from Fase 4 with the
// standard motivo + evidence upload pattern.
//
// Evidence (C23): files are held in state and uploaded on SUBMIT, namespaced by
// the TARGET assignment id. Cancelling never uploads — no orphaned objects.

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { revokeGovtLocalityAction } from "@/app/actions/admin-revocations";
import { MOTIVO_MIN, MotivoField } from "@/components/MotivoField";
import { LnCheckbox } from "@/components/ui/Field";
import { useEvidenceUpload } from "@/lib/use-evidence-upload";

type Mode = "idle" | "confirming" | "done";

export function RevokeLocalityRowActions({
  assignmentId,
  localityLabel,
  actorUserId,
}: {
  assignmentId: string;
  localityLabel: string;
  actorUserId: string;
}) {
  const [mode, setMode] = useState<Mode>("idle");

  if (mode === "done") {
    return (
      <span className="text-[10px] text-ln-op-ok font-semibold uppercase tracking-wide">
        Revocada
      </span>
    );
  }

  if (mode === "confirming") {
    return (
      <RevokeLocalityForm
        assignmentId={assignmentId}
        localityLabel={localityLabel}
        actorUserId={actorUserId}
        onDone={() => setMode("done")}
        onCancel={() => setMode("idle")}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setMode("confirming")}
      className="text-[10px] px-2 py-1 rounded-[4px] border border-ln-op-danger-bd text-ln-op-danger hover:opacity-90 transition-opacity"
    >
      Revocar
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form component
// ---------------------------------------------------------------------------

function RevokeLocalityForm({
  assignmentId,
  localityLabel,
  actorUserId,
  onDone,
  onCancel,
}: {
  assignmentId: string;
  localityLabel: string;
  actorUserId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [confirm, setConfirm] = useState(false);
  const { selectedFiles, uploading, addFiles, removeFile, uploadAll } = useEvidenceUpload();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const motivoTrimmed = motivo.trim();
  const motivoValid = motivoTrimmed.length >= MOTIVO_MIN;
  const canSubmit = motivoValid && selectedFiles.length >= 1 && confirm && !pending && !uploading;

  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    addFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      // C23: upload on submit, namespaced by the TARGET assignment id.
      const uploaded = await uploadAll(assignmentId, actorUserId);
      if ("error" in uploaded) {
        setError(uploaded.error);
        return;
      }

      const result = await revokeGovtLocalityAction({
        govtAssignmentId: assignmentId,
        motivo: motivoTrimmed,
        attachmentIds: uploaded.attachmentIds,
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <div className="rounded-[6px] border border-ln-op-danger-bd bg-ln-op-danger-bg p-3 space-y-3 mt-2">
      <p className="text-[10px] uppercase tracking-wider font-bold text-ln-op-danger">
        Revocar localidad &mdash; {localityLabel}
      </p>

      <MotivoField value={motivo} onChange={setMotivo} />

      <div className="space-y-1">
        <label
          htmlFor="revoke-locality-evidence"
          className="block text-[10px] uppercase tracking-wider text-ln-op-mute"
        >
          Evidencia (al menos 1 archivo)
        </label>
        <input
          id="revoke-locality-evidence"
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFilesChange}
          disabled={uploading || pending}
          className="text-[12px] text-ln-op-ink-2"
        />
        {uploading && <p className="text-[10px] text-ln-op-mute">Subiendo...</p>}
        {selectedFiles.length > 0 && (
          <ul className="space-y-0.5">
            {selectedFiles.map((f) => (
              <li key={f.key} className="flex items-center gap-2 text-[10px] text-ln-op-ink-2">
                <span className="truncate max-w-[200px]">{f.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(f.key)}
                  disabled={pending || uploading}
                  className="text-ln-op-danger hover:underline shrink-0 disabled:opacity-50"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <LnCheckbox
        checked={confirm}
        onChange={(e) => setConfirm(e.target.checked)}
        labelClassName="text-xs! text-ln-op-danger!"
      >
        Confirmo que quiero revocar la localidad {localityLabel}. Esta acción genera un registro
        permanente en el audit log.
      </LnCheckbox>

      {error && <p className="text-[12px] text-ln-op-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="text-[12px] px-3 py-1.5 rounded-[6px] bg-ln-op-danger text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Revocando..." : "Revocar localidad"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-[12px] px-3 py-1.5 rounded-[6px] border border-ln-op-line hover:bg-ln-op-stripe"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
