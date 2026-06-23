"use client";

// Deactivation UI for admin accounts.
//
// State machine: idle → confirming → submitting → done | error
// Mirrors RevokeUserActions.tsx structure — design §8.8.
//
// Evidence upload flow (design §3, spec REQ-6):
//   1. User picks files via <input type="file">
//   2. Each file is uploaded to Supabase Storage then registered via uploadRevocationEvidence.
//   3. On submit, attachmentIds[] are passed to deactivateAdminAction.
//
// Client-side canDeactivateAdmin hides/disables the button when the actor
// clearly has no scope (defense-in-depth; server is authoritative).

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { deactivateAdminAction } from "@/app/actions/admin-institutional";
import { uploadRevocationEvidence } from "@/app/actions/revocation-evidence";
import { MOTIVO_MIN, MotivoField } from "@/components/MotivoField";
import { LnCheckbox } from "@/components/ui/Field";
import { canDeactivateAdmin } from "@/lib/institutional-scope";
import type { ActorProfile } from "@/lib/institutional-scope";
import { createClient } from "@/lib/supabase/client";

type Target = {
  id: string;
  displayName: string;
};

type UploadedFile = { name: string; attachmentId: string };

type Mode = "idle" | "confirming" | "done";

export function DeactivateAdminActions({
  target,
  actor,
  activeAdminCount,
}: {
  target: Target;
  actor: ActorProfile;
  activeAdminCount: number;
}) {
  const canAct = canDeactivateAdmin(actor, target.id, activeAdminCount);

  const [mode, setMode] = useState<Mode>("idle");

  if (mode === "done") {
    return (
      <p className="text-[12px] text-ln-op-ok font-medium">
        Admin desactivado. {target.displayName} fue notificado.
      </p>
    );
  }

  if (!canAct) {
    const isSelf = actor.id === target.id;
    const isLast = activeAdminCount <= 1;
    const reason = isSelf
      ? "No podés desactivarte a vos mismo."
      : isLast
        ? "No se puede desactivar al único admin activo."
        : null;

    if (!reason) return null;

    return <p className="text-[10px] text-ln-op-mute italic">{reason}</p>;
  }

  if (mode === "confirming") {
    return (
      <DeactivateAdminForm
        target={target}
        actorUserId={actor.id}
        onDone={() => setMode("done")}
        onCancel={() => setMode("idle")}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setMode("confirming")}
      className="text-[12px] px-3 py-1.5 rounded-[6px] border border-ln-op-danger-bd text-ln-op-danger hover:opacity-90 transition-opacity"
    >
      Desactivar admin
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form component
// ---------------------------------------------------------------------------

function DeactivateAdminForm({
  target,
  actorUserId,
  onDone,
  onCancel,
}: {
  target: Target;
  actorUserId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const motivoTrimmed = motivo.trim();
  const motivoValid = motivoTrimmed.length >= MOTIVO_MIN;
  const canSubmit = motivoValid && uploadedFiles.length >= 1 && confirm && !pending && !uploading;

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

        const result = await uploadRevocationEvidence(actorUserId, {
          storagePath: path,
          mimeType: file.type,
          fileSize: file.size,
        });

        if ("error" in result) {
          setError(`Error al registrar ${file.name}: ${result.error}`);
          setUploading(false);
          return;
        }

        newFiles.push({ name: file.name, attachmentId: result.attachmentId });
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

  function removeFile(attachmentId: string) {
    setUploadedFiles((prev) => prev.filter((f) => f.attachmentId !== attachmentId));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deactivateAdminAction({
        targetAdminUserId: target.id,
        motivo: motivoTrimmed,
        attachmentIds: uploadedFiles.map((f) => f.attachmentId),
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
    <div className="rounded-[6px] border border-ln-op-danger-bd bg-ln-op-danger-bg p-3 space-y-3">
      <p className="text-[10px] uppercase tracking-wider font-bold text-ln-op-danger">
        Desactivar admin &mdash; {target.displayName}
      </p>
      <p className="text-[10px] text-ln-op-danger">
        Esta acción es irreversible desde esta interfaz. El usuario quedará desactivado y recibirá
        una notificación con el motivo.
      </p>

      <MotivoField value={motivo} onChange={setMotivo} />

      <div className="space-y-1">
        <label
          htmlFor="deactivate-admin-evidence"
          className="block text-[10px] uppercase tracking-wider text-ln-op-mute"
        >
          Evidencia (al menos 1 archivo)
        </label>
        <input
          id="deactivate-admin-evidence"
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFilesChange}
          disabled={uploading || pending}
          className="text-[12px] text-ln-op-ink-2"
        />
        {uploading && <p className="text-[10px] text-ln-op-mute">Subiendo...</p>}
        {uploadedFiles.length > 0 && (
          <ul className="space-y-0.5">
            {uploadedFiles.map((f) => (
              <li
                key={f.attachmentId}
                className="flex items-center gap-2 text-[10px] text-ln-op-ink-2"
              >
                <span className="truncate max-w-[200px]">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(f.attachmentId)}
                  className="text-ln-op-danger hover:underline shrink-0"
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
        Confirmo que quiero desactivar la cuenta de {target.displayName}. Esta acción genera un
        registro permanente en el audit log.
      </LnCheckbox>

      {error && <p className="text-[12px] text-ln-op-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="text-[12px] px-3 py-1.5 rounded-[6px] bg-ln-op-danger text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Desactivando..." : "Desactivar"}
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
