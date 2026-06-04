"use client";

// DecomisoForm — client component for the govt decomiso execution form.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md §6.
//
// Fields:
//   - petPublicToken:               search/enter by public token → show pet preview
//   - seizureMotive:                Select (enum, required)
//   - seizureMotiveOtherDetail:     shown when motive === 'otro'
//   - judicialProceedingReference:  optional text
//   - originatingWelfareReportId:   optional, prefilled from ?welfareReportId=
//   - intendedReceiverOrganizationId: combobox over verified shelters
//   - intakeCondition:              optional text
//   - attachmentFiles:              ≥2 mandatory files (photo + acta)
//
// DC2: if the pet is a registered_pet (has an owner), show a double-confirm
// modal before calling executeDecomisoAction.

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  type ExecuteDecomisoInput,
  type ExecuteDecomisoResult,
  type SeizureMotive,
  executeDecomisoAction,
} from "@/app/actions/decomiso";
import {
  type GovtPetLookupResult,
  lookupPetForDecomisoAction,
} from "@/app/actions/decomiso-pet-lookup";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReceiverOrg = {
  id: string;
  displayName: string;
  orgType: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
};

type PetPreview = Extract<GovtPetLookupResult, { found: true }>;

type AttachmentEntry = {
  file: File;
  objectUrl: string | null;
};

type DecomisoFormProps = {
  receiverOrgs: ReceiverOrg[];
  prefillWelfareReportId: string | null;
  prefillPetToken: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEIZURE_MOTIVE_LABELS: Record<SeizureMotive, string> = {
  maltrato_fisico: "Maltrato físico",
  abandono_extremo: "Abandono extremo",
  acumulacion: "Acumulación / hoarding",
  trafico: "Tráfico / comercio ilegal",
  sin_refugio_critico: "Sin resguardo adecuado (situación crítica)",
  pelea_de_perros: "Pelea de perros",
  otro: "Otro",
};

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
]);

// ---------------------------------------------------------------------------
// DecomisoForm
// ---------------------------------------------------------------------------

export function DecomisoForm({
  receiverOrgs,
  prefillWelfareReportId,
  prefillPetToken,
}: DecomisoFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Form state ---
  const [petToken, setPetToken] = useState(prefillPetToken ?? "");
  const [petPreview, setPetPreview] = useState<PetPreview | null>(null);
  const [petLookupPending, setPetLookupPending] = useState(false);
  const [petLookupError, setPetLookupError] = useState<string | null>(null);

  const [seizureMotive, setSeizureMotive] = useState<SeizureMotive | "">("");
  const [seizureMotiveOtherDetail, setSeizureMotiveOtherDetail] = useState("");
  const [judicialRef, setJudicialRef] = useState("");
  const [welfareReportId, setWelfareReportId] = useState(prefillWelfareReportId ?? "");
  const [intakeCondition, setIntakeCondition] = useState("");
  const [receiverOrgId, setReceiverOrgId] = useState("");
  const [receiverSearch, setReceiverSearch] = useState("");

  const [attachments, setAttachments] = useState<AttachmentEntry[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isPending, startTransition] = useTransition();

  // --- Pet lookup ---
  async function lookupPet() {
    const token = petToken.trim().toUpperCase();
    if (!token) return;
    setPetLookupError(null);
    setPetPreview(null);
    setPetLookupPending(true);
    try {
      const result = await lookupPetForDecomisoAction(token);
      if (!result.found) {
        setPetLookupError(result.error);
        return;
      }
      setPetPreview(result);
    } catch {
      setPetLookupError("Error al buscar la mascota. Intentá nuevamente.");
    } finally {
      setPetLookupPending(false);
    }
  }

  // --- Attachment handling ---
  function handleFilesSelected(incoming: FileList | null) {
    if (!incoming || incoming.length === 0) return;
    setAttachmentError(null);
    const newFiles = Array.from(incoming);
    const combined = [...attachments.map((e) => e.file), ...newFiles];

    if (combined.length > MAX_ATTACHMENTS) {
      setAttachmentError(`Máximo ${MAX_ATTACHMENTS} archivos en total.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    for (const f of newFiles) {
      if (!ALLOWED_MIME.has(f.type)) {
        setAttachmentError(`Tipo no permitido: "${f.name}". Aceptamos imágenes, videos y PDF.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError(`"${f.name}" supera el límite de 25 MB.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }
    const added: AttachmentEntry[] = newFiles.map((f) => ({
      file: f,
      objectUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
    }));
    setAttachments((prev) => [...prev, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const entry = prev[index];
      if (entry?.objectUrl) URL.revokeObjectURL(entry.objectUrl);
      return prev.filter((_, i) => i !== index);
    });
    setAttachmentError(null);
  }

  // --- Validation ---
  function validate(): string | null {
    if (!petPreview) return "Buscá y confirmá la mascota antes de continuar.";
    if (!seizureMotive) return "Seleccioná el motivo del decomiso.";
    if (seizureMotive === "otro" && !seizureMotiveOtherDetail.trim()) {
      return "Especificá el detalle cuando el motivo es 'Otro'.";
    }
    if (!receiverOrgId) return "Seleccioná el refugio o red de rescate destinataria.";
    if (attachments.length < 2) {
      return "Adjuntá al menos 2 archivos: una foto del animal y el acta administrativa.";
    }
    return null;
  }

  // --- Submit flow ---
  function handleSubmit() {
    setFormError(null);
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    // DC2: registered pet with owner → double-confirm modal
    if (petPreview?.hasOwner) {
      setShowConfirmModal(true);
      return;
    }
    executeDecomiso();
  }

  function executeDecomiso() {
    setShowConfirmModal(false);
    setFormError(null);
    startTransition(async () => {
      const input: ExecuteDecomisoInput = {
        petPublicToken: petPreview?.publicToken ?? "",
        seizureMotive: seizureMotive as SeizureMotive,
        seizureMotiveOtherDetail: seizureMotiveOtherDetail.trim() || null,
        judicialProceedingReference: judicialRef.trim() || null,
        originatingWelfareReportId: welfareReportId.trim() || null,
        intendedReceiverOrganizationId: receiverOrgId,
        intakeCondition: intakeCondition.trim() || null,
        attachmentFiles: attachments.map((e) => e.file),
      };
      const result: ExecuteDecomisoResult = await executeDecomisoAction(input);
      if ("error" in result) {
        setFormError(result.error);
        return;
      }
      router.push(`/casos/${result.publicCode}?origin=decomiso`);
    });
  }

  // --- Receiver combobox filter ---
  const filteredOrgs =
    receiverSearch.trim().length > 0
      ? receiverOrgs.filter((o) =>
          o.displayName.toLowerCase().includes(receiverSearch.toLowerCase()),
        )
      : receiverOrgs;

  const selectedOrg = receiverOrgs.find((o) => o.id === receiverOrgId);

  // --- Render ---
  return (
    <>
      <div className="space-y-6">
        {/* --- Pet search --- */}
        <section className="rounded-xl border border-gob-border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gob-text uppercase tracking-wider">
            1. Mascota sujeto del decomiso
          </h2>
          <p className="text-xs text-gob-text-muted">
            Solo mascotas registradas (con token DIM-XXXX-XXXX). El decomiso de animales sin
            registrar requiere un flujo diferente — documentalo con el acta y adjuntos.
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="petToken" className="block text-xs font-medium text-gob-text mb-1">
                Token de la mascota
              </label>
              <input
                id="petToken"
                type="text"
                value={petToken}
                onChange={(e) => {
                  setPetToken(e.target.value.toUpperCase());
                  setPetPreview(null);
                  setPetLookupError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lookupPet();
                  }
                }}
                placeholder="DIM-XXXX-XXXX"
                className="block w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm font-mono text-gob-text placeholder-gob-text-muted focus:outline-none focus:border-gob-primary"
              />
            </div>
            <button
              type="button"
              onClick={lookupPet}
              disabled={petLookupPending || !petToken.trim()}
              className="self-end px-4 py-2 rounded-lg bg-gob-primary text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {petLookupPending ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {petLookupError && (
            <p className="text-sm text-gob-danger rounded-lg bg-gob-danger/10 border border-gob-danger/30 px-3 py-2">
              {petLookupError}
            </p>
          )}

          {petPreview && (
            <div
              className={`rounded-lg border p-4 space-y-1 ${
                petPreview.hasOwner
                  ? "border-gob-warning bg-gob-warning/5"
                  : "border-gob-border bg-gob-surface-alt"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gob-text">
                  {petPreview.name}{" "}
                  <span className="font-normal text-gob-text-muted">
                    ({petPreview.species}, {petPreview.sex})
                  </span>
                </p>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    petPreview.status === "active"
                      ? "bg-gob-success/10 text-gob-success"
                      : "bg-gob-surface-alt text-gob-text-muted"
                  }`}
                >
                  {petPreview.status}
                </span>
              </div>
              <p className="text-xs font-mono text-gob-text-muted">{petPreview.publicToken}</p>
              {petPreview.hasOwner ? (
                <p className="text-xs text-gob-warning-text mt-1">
                  Esta mascota tiene un dueño registrado
                  {petPreview.ownerDisplayName ? ` (${petPreview.ownerDisplayName})` : ""}. Al
                  continuar, se le quitará la custodia legal.
                </p>
              ) : (
                <p className="text-xs text-gob-text-muted mt-1">
                  Sin dueño registrado actualmente.
                </p>
              )}
            </div>
          )}
        </section>

        {/* --- Motivo --- */}
        <section className="rounded-xl border border-gob-border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gob-text uppercase tracking-wider">
            2. Motivo del decomiso
          </h2>
          <div>
            <label htmlFor="seizureMotive" className="block text-xs font-medium text-gob-text mb-1">
              Motivo <span className="text-gob-danger">*</span>
            </label>
            <select
              id="seizureMotive"
              value={seizureMotive}
              onChange={(e) => setSeizureMotive(e.target.value as SeizureMotive | "")}
              className="block w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm text-gob-text focus:outline-none focus:border-gob-primary appearance-none"
            >
              <option value="">— Seleccioná un motivo —</option>
              {(Object.entries(SEIZURE_MOTIVE_LABELS) as [SeizureMotive, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>

          {seizureMotive === "otro" && (
            <div>
              <label
                htmlFor="seizureMotiveOtherDetail"
                className="block text-xs font-medium text-gob-text mb-1"
              >
                Detalle del motivo <span className="text-gob-danger">*</span>
              </label>
              <textarea
                id="seizureMotiveOtherDetail"
                value={seizureMotiveOtherDetail}
                onChange={(e) => setSeizureMotiveOtherDetail(e.target.value)}
                rows={3}
                placeholder="Describí el motivo específico del decomiso"
                className="block w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm text-gob-text focus:outline-none focus:border-gob-primary resize-none"
              />
            </div>
          )}

          <div>
            <label htmlFor="judicialRef" className="block text-xs font-medium text-gob-text mb-1">
              Expediente judicial (opcional)
            </label>
            <input
              id="judicialRef"
              type="text"
              value={judicialRef}
              onChange={(e) => setJudicialRef(e.target.value)}
              placeholder="Ej: EXP-2025-123456"
              className="block w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm text-gob-text focus:outline-none focus:border-gob-primary"
            />
          </div>

          <div>
            <label
              htmlFor="welfareReportId"
              className="block text-xs font-medium text-gob-text mb-1"
            >
              ID de denuncia de maltrato vinculada (opcional)
            </label>
            <input
              id="welfareReportId"
              type="text"
              value={welfareReportId}
              onChange={(e) => setWelfareReportId(e.target.value)}
              placeholder="UUID de la denuncia que originó este decomiso"
              className="block w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm font-mono text-gob-text focus:outline-none focus:border-gob-primary"
            />
            {prefillWelfareReportId && (
              <p className="text-xs text-gob-text-muted mt-1">
                Prefilled desde la denuncia de maltrato.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="intakeCondition"
              className="block text-xs font-medium text-gob-text mb-1"
            >
              Estado del animal al momento del decomiso (opcional)
            </label>
            <textarea
              id="intakeCondition"
              value={intakeCondition}
              onChange={(e) => setIntakeCondition(e.target.value)}
              rows={2}
              placeholder="Descripción de la condición física / comportamental del animal"
              className="block w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm text-gob-text focus:outline-none focus:border-gob-primary resize-none"
            />
          </div>
        </section>

        {/* --- Refugio destinatario --- */}
        <section className="rounded-xl border border-gob-border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gob-text uppercase tracking-wider">
            3. Refugio destinatario
          </h2>
          <p className="text-xs text-gob-text-muted">
            Solo refugios y redes de rescate verificados. El refugio tiene 7 días para aceptar o
            rechazar el handoff.
          </p>

          {selectedOrg ? (
            <div className="flex items-center justify-between rounded-lg border border-gob-primary/40 bg-gob-primary/5 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gob-text">{selectedOrg.displayName}</p>
                <p className="text-xs text-gob-text-muted capitalize">
                  {selectedOrg.orgType === "rescue_network" ? "Red de rescate" : "Refugio"}
                  {selectedOrg.jurisdictionLocality
                    ? ` · ${selectedOrg.jurisdictionLocality}, ${selectedOrg.jurisdictionProvince ?? ""}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiverOrgId("")}
                className="text-xs text-gob-text-muted hover:text-gob-text transition-colors"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="receiverSearch" className="block text-xs font-medium text-gob-text">
                Buscar por nombre <span className="text-gob-danger">*</span>
              </label>
              <input
                id="receiverSearch"
                type="text"
                value={receiverSearch}
                onChange={(e) => setReceiverSearch(e.target.value)}
                placeholder="Escribí para filtrar..."
                className="block w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm text-gob-text focus:outline-none focus:border-gob-primary"
              />
              {receiverOrgs.length === 0 ? (
                <p className="text-xs text-gob-text-muted py-2">
                  No hay refugios verificados disponibles. Contactá al administrador.
                </p>
              ) : (
                <ul className="max-h-48 overflow-y-auto divide-y divide-gob-border rounded-lg border border-gob-border">
                  {filteredOrgs.slice(0, 50).map((org) => (
                    <li key={org.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setReceiverOrgId(org.id);
                          setReceiverSearch("");
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gob-surface-alt transition-colors"
                      >
                        <p className="text-sm text-gob-text">{org.displayName}</p>
                        <p className="text-xs text-gob-text-muted capitalize">
                          {org.orgType === "rescue_network" ? "Red de rescate" : "Refugio"}
                          {org.jurisdictionLocality
                            ? ` · ${org.jurisdictionLocality}, ${org.jurisdictionProvince ?? ""}`
                            : ""}
                        </p>
                      </button>
                    </li>
                  ))}
                  {filteredOrgs.length === 0 && (
                    <li className="px-4 py-3 text-sm text-gob-text-muted">
                      Sin resultados para "{receiverSearch}".
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* --- Adjuntos --- */}
        <section className="rounded-xl border border-gob-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gob-text uppercase tracking-wider">
              4. Adjuntos
            </h2>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                attachments.length >= 2
                  ? "bg-gob-success/10 text-gob-success"
                  : "bg-gob-warning/10 text-gob-warning-text"
              }`}
            >
              {attachments.length} / mín. 2
            </span>
          </div>
          <p className="text-xs text-gob-text-muted">
            Obligatorio: al menos 1 foto del animal y 1 acta administrativa (o screenshot del oficio
            judicial). Hasta {MAX_ATTACHMENTS} archivos, 25 MB cada uno.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/mp4,video/webm,video/quicktime,image/heic,image/heif,application/pdf"
            onChange={(e) => handleFilesSelected(e.target.files)}
            className="block w-full text-xs text-gob-text-gray file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-gob-surface-alt file:text-gob-text file:cursor-pointer"
          />

          {attachmentError && (
            <p className="text-xs text-gob-danger rounded bg-gob-danger/10 px-3 py-2">
              {attachmentError}
            </p>
          )}

          {attachments.length > 0 && (
            <ul className="space-y-2">
              {attachments.map((entry, i) => (
                <li
                  // name+size+index is a stable-enough composite key for this append-only list.
                  key={`${entry.file.name}-${entry.file.size}-${i}`}
                  className="flex items-center gap-3 rounded-lg border border-gob-border px-3 py-2"
                >
                  {entry.objectUrl ? (
                    <img
                      src={entry.objectUrl}
                      alt={entry.file.name}
                      className="w-10 h-10 object-cover rounded-md flex-shrink-0 border border-gob-border"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-gob-surface-alt flex items-center justify-center flex-shrink-0 text-lg">
                      {entry.file.type === "application/pdf" ? "📄" : "▶"}
                    </div>
                  )}
                  <span className="text-xs text-gob-text truncate flex-1">{entry.file.name}</span>
                  <span className="text-xs text-gob-text-muted flex-shrink-0">
                    {(entry.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    aria-label={`Quitar ${entry.file.name}`}
                    className="flex-shrink-0 w-5 h-5 rounded-full bg-gob-surface-alt text-gob-text-muted text-xs hover:bg-gob-border hover:text-gob-text transition-colors"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* --- Error global --- */}
        {formError && (
          <p
            className="text-sm text-gob-danger rounded-xl bg-gob-danger/10 border border-gob-danger/30 px-4 py-3"
            role="alert"
          >
            {formError}
          </p>
        )}

        {/* --- Submit --- */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full py-4 rounded-xl bg-gob-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {isPending ? "Ejecutando decomiso..." : "Ejecutar decomiso →"}
        </button>

        <p className="text-xs text-gob-text-muted text-center">
          Esta acción es irreversible — el decomiso quedará registrado en el sistema de casos bajo
          Ley 14.346. El refugio destinatario recibirá una notificación de handoff.
        </p>
      </div>

      {/* DC2 — double-confirm modal for pets with an owner */}
      {showConfirmModal && petPreview && (
        <dialog
          open
          className="fixed inset-0 z-50 flex items-center justify-center p-4 m-0 w-full h-full max-w-none max-h-none bg-transparent border-none"
          aria-labelledby="confirm-modal-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-gob-text/40"
            onClick={() => setShowConfirmModal(false)}
            onKeyDown={(e) => e.key === "Escape" && setShowConfirmModal(false)}
          />
          {/* Modal */}
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white border border-gob-border shadow-xl p-6 space-y-4">
            <h3 id="confirm-modal-title" className="text-lg font-semibold text-gob-text">
              Confirmar decomiso
            </h3>
            <div className="rounded-lg bg-gob-warning/10 border border-gob-warning/30 px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-gob-warning-text">
                Esta mascota tiene un dueño registrado.
              </p>
              <p className="text-sm text-gob-text">
                Vas a quitarle la custodia legal de{" "}
                <span className="font-semibold">{petPreview.name}</span>
                {petPreview.ownerDisplayName
                  ? ` a ${petPreview.ownerDisplayName}`
                  : " al dueño actual"}
                .
              </p>
              <p className="text-sm text-gob-text">
                El sistema notificará al dueño que el animal fue decomisado. Esta acción está
                amparada en Ley 14.346 y quedará auditada.
              </p>
            </div>
            <p className="text-sm text-gob-text-gray">
              Motivo:{" "}
              <span className="font-medium">
                {SEIZURE_MOTIVE_LABELS[seizureMotive as SeizureMotive]}
              </span>
              {seizureMotive === "otro" && seizureMotiveOtherDetail
                ? ` — ${seizureMotiveOtherDetail}`
                : ""}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={executeDecomiso}
                disabled={isPending}
                className="flex-1 py-3 rounded-xl bg-gob-danger text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isPending ? "Ejecutando..." : "Sí, ejecutar decomiso"}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isPending}
                className="flex-1 py-3 rounded-xl border border-gob-border text-sm text-gob-text hover:bg-gob-surface-alt transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
