"use client";

// DecomisoForm -- client component for the govt decomiso execution form.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md section 6.
//
// Mode toggle (DC3):
//   - "registered_pet": existing token-lookup path. DC2 double-confirm applies
//     when the pet has an owner.
//   - "unowned_animal": stray with no prior registration. Collects descriptive
//     fields (species required; breed/color/sex/approx age/distinguishing
//     features). DC2 double-confirm NOT shown (no prior owner).
//
// Fields (registered_pet mode):
//   - petPublicToken:               search/enter by public token -> show pet preview
//
// Fields (unowned_animal mode):
//   - unownedSpecies:               required
//   - unownedSex:                   male | female | unknown
//   - unownedBreed:                 optional
//   - unownedColor:                 optional
//   - unownedDistinguishingFeatures: optional
//   - unownedApproxAgeMonths:       optional
//
// Shared fields (both modes):
//   - seizureMotive:                Select (enum, required)
//   - seizureMotiveOtherDetail:     shown when motive === 'otro'
//   - judicialProceedingReference:  optional text
//   - originatingWelfareReportId:   optional, prefilled from ?welfareReportId=
//   - intendedReceiverOrganizationId: combobox over verified shelters
//   - intakeCondition:              optional text
//   - attachmentFiles:              >= 2 mandatory files (photo + acta)

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  type ExecuteDecomisoInput,
  type ExecuteDecomisoResult,
  type SeizureMotive,
  type UnownedAnimalInput,
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

type SubjectMode = "registered_pet" | "unowned_animal";

type DecomisoFormProps = {
  receiverOrgs: ReceiverOrg[];
  prefillWelfareReportId: string | null;
  prefillPetToken: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEIZURE_MOTIVE_LABELS: Record<SeizureMotive, string> = {
  maltrato_fisico: "Maltrato fisico",
  abandono_extremo: "Abandono extremo",
  acumulacion: "Acumulacion / hoarding",
  trafico: "Trafico / comercio ilegal",
  sin_refugio_critico: "Sin resguardo adecuado (situacion critica)",
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

  // --- Subject mode toggle (DC3) ---
  const [subjectMode, setSubjectMode] = useState<SubjectMode>("registered_pet");

  // --- Registered pet state ---
  const [petToken, setPetToken] = useState(prefillPetToken ?? "");
  const [petPreview, setPetPreview] = useState<PetPreview | null>(null);
  const [petLookupPending, setPetLookupPending] = useState(false);
  const [petLookupError, setPetLookupError] = useState<string | null>(null);

  // --- Unowned animal state ---
  const [unownedSpecies, setUnownedSpecies] = useState("");
  const [unownedSex, setUnownedSex] = useState<"male" | "female" | "unknown">("unknown");
  const [unownedBreed, setUnownedBreed] = useState("");
  const [unownedColor, setUnownedColor] = useState("");
  const [unownedFeatures, setUnownedFeatures] = useState("");
  const [unownedAgeMonths, setUnownedAgeMonths] = useState("");

  // --- Shared state ---
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
      setPetLookupError("Error al buscar la mascota. Intenta nuevamente.");
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
      setAttachmentError(`Maximo ${MAX_ATTACHMENTS} archivos en total.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    for (const f of newFiles) {
      if (!ALLOWED_MIME.has(f.type)) {
        setAttachmentError(`Tipo no permitido: "${f.name}". Aceptamos imagenes, videos y PDF.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError(`"${f.name}" supera el limite de 25 MB.`);
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
    if (subjectMode === "registered_pet") {
      if (!petPreview) return "Busca y confirma la mascota antes de continuar.";
    } else {
      if (!unownedSpecies.trim()) return "Indica la especie del animal sin registrar.";
    }
    if (!seizureMotive) return "Selecciona el motivo del decomiso.";
    if (seizureMotive === "otro" && !seizureMotiveOtherDetail.trim()) {
      return "Especifica el detalle cuando el motivo es 'Otro'.";
    }
    if (!receiverOrgId) return "Selecciona el refugio o red de rescate destinataria.";
    if (attachments.length < 2) {
      return "Adjunta al menos 2 archivos: una foto del animal y el acta administrativa.";
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
    // DC2: registered pet with owner -> double-confirm modal.
    // Unowned path skips DC2 (no prior owner to dispossess).
    if (subjectMode === "registered_pet" && petPreview?.hasOwner) {
      setShowConfirmModal(true);
      return;
    }
    executeDecomiso();
  }

  function executeDecomiso() {
    setShowConfirmModal(false);
    setFormError(null);
    startTransition(async () => {
      let input: ExecuteDecomisoInput;

      if (subjectMode === "registered_pet") {
        input = {
          subjectKind: "registered_pet",
          petPublicToken: petPreview?.publicToken ?? "",
          seizureMotive: seizureMotive as SeizureMotive,
          seizureMotiveOtherDetail: seizureMotiveOtherDetail.trim() || null,
          judicialProceedingReference: judicialRef.trim() || null,
          originatingWelfareReportId: welfareReportId.trim() || null,
          intendedReceiverOrganizationId: receiverOrgId,
          intakeCondition: intakeCondition.trim() || null,
          attachmentFiles: attachments.map((e) => e.file),
        };
      } else {
        const approxAgeMonthsRaw = unownedAgeMonths.trim();
        const approxAgeMonths = approxAgeMonthsRaw
          ? Math.max(0, Number.parseInt(approxAgeMonthsRaw, 10) || 0)
          : null;

        const unownedAnimal: UnownedAnimalInput = {
          species: unownedSpecies.trim(),
          sex: unownedSex,
          breed: unownedBreed.trim() || null,
          color: unownedColor.trim() || null,
          distinguishingFeatures: unownedFeatures.trim() || null,
          approxAgeMonths,
        };
        input = {
          subjectKind: "unowned_animal",
          unownedAnimal,
          seizureMotive: seizureMotive as SeizureMotive,
          seizureMotiveOtherDetail: seizureMotiveOtherDetail.trim() || null,
          judicialProceedingReference: judicialRef.trim() || null,
          originatingWelfareReportId: welfareReportId.trim() || null,
          intendedReceiverOrganizationId: receiverOrgId,
          intakeCondition: intakeCondition.trim() || null,
          attachmentFiles: attachments.map((e) => e.file),
        };
      }

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
        {/* --- Sujeto del decomiso (mode toggle + conditional fields) --- */}
        <section className="rounded-[6px] border border-ln-op-line p-5 space-y-4">
          <h2 className="text-[12px] font-semibold text-ln-op-ink uppercase tracking-wider">
            1. Sujeto del decomiso
          </h2>

          {/* Mode toggle */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSubjectMode("registered_pet")}
              className={`flex-1 py-2.5 px-4 rounded-[6px] border text-[13px] font-medium transition-colors ${
                subjectMode === "registered_pet"
                  ? "border-ln-op-azul bg-ln-op-blue-bg text-ln-op-azul"
                  : "border-ln-op-line bg-ln-op-card text-ln-op-mute hover:bg-ln-op-stripe"
              }`}
            >
              Mascota registrada (chapita)
            </button>
            <button
              type="button"
              onClick={() => setSubjectMode("unowned_animal")}
              className={`flex-1 py-2.5 px-4 rounded-[6px] border text-[13px] font-medium transition-colors ${
                subjectMode === "unowned_animal"
                  ? "border-ln-op-azul bg-ln-op-blue-bg text-ln-op-azul"
                  : "border-ln-op-line bg-ln-op-card text-ln-op-mute hover:bg-ln-op-stripe"
              }`}
            >
              Animal sin registrar (callejero)
            </button>
          </div>

          {/* Registered pet fields */}
          {subjectMode === "registered_pet" && (
            <div className="space-y-3">
              <p className="text-[12px] text-ln-op-mute">
                Ingresa el token DIM-XXXX-XXXX de la mascota registrada.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label
                    htmlFor="petToken"
                    className="block text-[12px] font-medium text-ln-op-ink mb-1"
                  >
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
                    className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] font-mono text-ln-op-ink placeholder-ln-op-faint focus:outline-none focus:border-ln-op-azul"
                  />
                </div>
                <button
                  type="button"
                  onClick={lookupPet}
                  disabled={petLookupPending || !petToken.trim()}
                  className="self-end px-4 py-2 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-medium disabled:opacity-50 hover:bg-ln-op-azul-700 transition-colors"
                >
                  {petLookupPending ? "Buscando..." : "Buscar"}
                </button>
              </div>

              {petLookupError && (
                <p className="text-[13px] text-ln-op-danger rounded-[6px] bg-ln-op-danger-bg border border-ln-op-danger-bd px-3 py-2">
                  {petLookupError}
                </p>
              )}

              {petPreview && (
                <div
                  className={`rounded-[6px] border p-4 space-y-1 ${
                    petPreview.hasOwner
                      ? "border-ln-op-warn-bd bg-ln-op-warn-bg"
                      : "border-ln-op-line bg-ln-op-stripe"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-ln-op-ink">
                      {petPreview.name}{" "}
                      <span className="font-normal text-ln-op-mute">
                        ({petPreview.species}, {petPreview.sex})
                      </span>
                    </p>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        petPreview.status === "active"
                          ? "bg-ln-op-ok-bg text-ln-op-ok"
                          : "bg-ln-op-stripe text-ln-op-mute"
                      }`}
                    >
                      {petPreview.status}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-ln-op-mute">{petPreview.publicToken}</p>
                  {petPreview.hasOwner ? (
                    <p className="text-[12px] text-ln-op-warn mt-1">
                      Esta mascota tiene un dueño registrado
                      {petPreview.ownerDisplayName ? ` (${petPreview.ownerDisplayName})` : ""}. Al
                      continuar, se le quitara la custodia legal.
                    </p>
                  ) : (
                    <p className="text-[12px] text-ln-op-mute mt-1">
                      Sin dueño registrado actualmente.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Unowned animal fields */}
          {subjectMode === "unowned_animal" && (
            <div className="space-y-3">
              <p className="text-[12px] text-ln-op-mute">
                Describe el animal. Se creara un registro en el sistema para este decomiso. La
                jurisdiccion se asignara desde tu organizacion sanitaria.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="unownedSpecies"
                    className="block text-[12px] font-medium text-ln-op-ink mb-1"
                  >
                    Especie <span className="text-ln-op-danger">*</span>
                  </label>
                  <select
                    id="unownedSpecies"
                    value={unownedSpecies}
                    onChange={(e) => setUnownedSpecies(e.target.value)}
                    className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul appearance-none"
                  >
                    <option value="">{"— Selecciona —"}</option>
                    <option value="dog">Perro</option>
                    <option value="cat">Gato</option>
                    <option value="other">Otro</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="unownedSex"
                    className="block text-[12px] font-medium text-ln-op-ink mb-1"
                  >
                    Sexo
                  </label>
                  <select
                    id="unownedSex"
                    value={unownedSex}
                    onChange={(e) => setUnownedSex(e.target.value as "male" | "female" | "unknown")}
                    className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul appearance-none"
                  >
                    <option value="unknown">Desconocido</option>
                    <option value="male">Macho</option>
                    <option value="female">Hembra</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="unownedBreed"
                    className="block text-[12px] font-medium text-ln-op-ink mb-1"
                  >
                    Raza (opcional)
                  </label>
                  <input
                    id="unownedBreed"
                    type="text"
                    value={unownedBreed}
                    onChange={(e) => setUnownedBreed(e.target.value)}
                    placeholder="Mestizo, labrador, etc."
                    className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
                  />
                </div>

                <div>
                  <label
                    htmlFor="unownedColor"
                    className="block text-[12px] font-medium text-ln-op-ink mb-1"
                  >
                    Color (opcional)
                  </label>
                  <input
                    id="unownedColor"
                    type="text"
                    value={unownedColor}
                    onChange={(e) => setUnownedColor(e.target.value)}
                    placeholder="Negro, blanco y marron, etc."
                    className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="unownedFeatures"
                  className="block text-[12px] font-medium text-ln-op-ink mb-1"
                >
                  Marcas distintivas (opcional)
                </label>
                <input
                  id="unownedFeatures"
                  type="text"
                  value={unownedFeatures}
                  onChange={(e) => setUnownedFeatures(e.target.value)}
                  placeholder="Cicatriz en lomo, mancha en ojo derecho, etc."
                  className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
                />
              </div>

              <div>
                <label
                  htmlFor="unownedAgeMonths"
                  className="block text-[12px] font-medium text-ln-op-ink mb-1"
                >
                  Edad aproximada en meses (opcional)
                </label>
                <input
                  id="unownedAgeMonths"
                  type="number"
                  min="0"
                  max="360"
                  step="1"
                  value={unownedAgeMonths}
                  onChange={(e) => setUnownedAgeMonths(e.target.value)}
                  placeholder="Ej: 24 (2 anios)"
                  className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
                />
              </div>
            </div>
          )}
        </section>

        {/* --- Motivo --- */}
        <section className="rounded-[6px] border border-ln-op-line p-5 space-y-4">
          <h2 className="text-[12px] font-semibold text-ln-op-ink uppercase tracking-wider">
            2. Motivo del decomiso
          </h2>
          <div>
            <label
              htmlFor="seizureMotive"
              className="block text-[12px] font-medium text-ln-op-ink mb-1"
            >
              Motivo <span className="text-ln-op-danger">*</span>
            </label>
            <select
              id="seizureMotive"
              value={seizureMotive}
              onChange={(e) => setSeizureMotive(e.target.value as SeizureMotive | "")}
              className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul appearance-none"
            >
              <option value="">{"— Selecciona un motivo —"}</option>
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
                className="block text-[12px] font-medium text-ln-op-ink mb-1"
              >
                Detalle del motivo <span className="text-ln-op-danger">*</span>
              </label>
              <textarea
                id="seizureMotiveOtherDetail"
                value={seizureMotiveOtherDetail}
                onChange={(e) => setSeizureMotiveOtherDetail(e.target.value)}
                rows={3}
                placeholder="Describe el motivo especifico del decomiso"
                className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul resize-none"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="judicialRef"
              className="block text-[12px] font-medium text-ln-op-ink mb-1"
            >
              Expediente judicial (opcional)
            </label>
            <input
              id="judicialRef"
              type="text"
              value={judicialRef}
              onChange={(e) => setJudicialRef(e.target.value)}
              placeholder="Ej: EXP-2025-123456"
              className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
            />
          </div>

          <div>
            <label
              htmlFor="welfareReportId"
              className="block text-[12px] font-medium text-ln-op-ink mb-1"
            >
              ID de denuncia de maltrato vinculada (opcional)
            </label>
            <input
              id="welfareReportId"
              type="text"
              value={welfareReportId}
              onChange={(e) => setWelfareReportId(e.target.value)}
              placeholder="UUID de la denuncia que origino este decomiso"
              className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] font-mono text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
            />
            {prefillWelfareReportId && (
              <p className="text-[12px] text-ln-op-mute mt-1">
                Prefilled desde la denuncia de maltrato.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="intakeCondition"
              className="block text-[12px] font-medium text-ln-op-ink mb-1"
            >
              Estado del animal al momento del decomiso (opcional)
            </label>
            <textarea
              id="intakeCondition"
              value={intakeCondition}
              onChange={(e) => setIntakeCondition(e.target.value)}
              rows={2}
              placeholder="Descripcion de la condicion fisica / comportamental del animal"
              className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul resize-none"
            />
          </div>
        </section>

        {/* --- Refugio destinatario --- */}
        <section className="rounded-[6px] border border-ln-op-line p-5 space-y-4">
          <h2 className="text-[12px] font-semibold text-ln-op-ink uppercase tracking-wider">
            3. Refugio destinatario
          </h2>
          <p className="text-[12px] text-ln-op-mute">
            Solo refugios y redes de rescate verificados. El refugio tiene 7 dias para aceptar o
            rechazar el handoff.
          </p>

          {selectedOrg ? (
            <div className="flex items-center justify-between rounded-[6px] border border-ln-op-blue-bd bg-ln-op-blue-bg px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-ln-op-ink">{selectedOrg.displayName}</p>
                <p className="text-[12px] text-ln-op-mute capitalize">
                  {selectedOrg.orgType === "rescue_network" ? "Red de rescate" : "Refugio"}
                  {selectedOrg.jurisdictionLocality
                    ? ` · ${selectedOrg.jurisdictionLocality}, ${selectedOrg.jurisdictionProvince ?? ""}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiverOrgId("")}
                className="text-[12px] text-ln-op-mute hover:text-ln-op-ink transition-colors"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="receiverSearch"
                className="block text-[12px] font-medium text-ln-op-ink"
              >
                Buscar por nombre <span className="text-ln-op-danger">*</span>
              </label>
              <input
                id="receiverSearch"
                type="text"
                value={receiverSearch}
                onChange={(e) => setReceiverSearch(e.target.value)}
                placeholder="Escribe para filtrar..."
                className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
              />
              {receiverOrgs.length === 0 ? (
                <p className="text-[12px] text-ln-op-mute py-2">
                  No hay refugios verificados disponibles. Contacta al administrador.
                </p>
              ) : (
                <ul className="max-h-48 overflow-y-auto divide-y divide-ln-op-line-2 rounded-[6px] border border-ln-op-line">
                  {filteredOrgs.slice(0, 50).map((org) => (
                    <li key={org.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setReceiverOrgId(org.id);
                          setReceiverSearch("");
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-ln-op-stripe transition-colors"
                      >
                        <p className="text-[13px] text-ln-op-ink">{org.displayName}</p>
                        <p className="text-[12px] text-ln-op-mute capitalize">
                          {org.orgType === "rescue_network" ? "Red de rescate" : "Refugio"}
                          {org.jurisdictionLocality
                            ? ` · ${org.jurisdictionLocality}, ${org.jurisdictionProvince ?? ""}`
                            : ""}
                        </p>
                      </button>
                    </li>
                  ))}
                  {filteredOrgs.length === 0 && (
                    <li className="px-4 py-3 text-[13px] text-ln-op-mute">
                      Sin resultados para &ldquo;{receiverSearch}&rdquo;.
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* --- Adjuntos --- */}
        <section className="rounded-[6px] border border-ln-op-line p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[12px] font-semibold text-ln-op-ink uppercase tracking-wider">
              4. Adjuntos
            </h2>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full ${
                attachments.length >= 2
                  ? "bg-ln-op-ok-bg text-ln-op-ok"
                  : "bg-ln-op-warn-bg text-ln-op-warn"
              }`}
            >
              {attachments.length} / min. 2
            </span>
          </div>
          <p className="text-[12px] text-ln-op-mute">
            Obligatorio: al menos 1 foto del animal y 1 acta administrativa (o screenshot del oficio
            judicial). Hasta {MAX_ATTACHMENTS} archivos, 25 MB cada uno.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/mp4,video/webm,video/quicktime,image/heic,image/heif,application/pdf"
            onChange={(e) => handleFilesSelected(e.target.files)}
            className="block w-full text-[12px] text-ln-op-mute file:mr-3 file:px-3 file:py-1.5 file:rounded-[6px] file:border-0 file:bg-ln-op-stripe file:text-ln-op-ink file:cursor-pointer"
          />

          {attachmentError && (
            <p className="text-[12px] text-ln-op-danger rounded-[6px] bg-ln-op-danger-bg px-3 py-2">
              {attachmentError}
            </p>
          )}

          {attachments.length > 0 && (
            <ul className="space-y-2">
              {attachments.map((entry, i) => (
                <li
                  // name+size+index is a stable-enough composite key for this append-only list.
                  key={`${entry.file.name}-${entry.file.size}-${i}`}
                  className="flex items-center gap-3 rounded-[6px] border border-ln-op-line px-3 py-2"
                >
                  {entry.objectUrl ? (
                    <img
                      src={entry.objectUrl}
                      alt={entry.file.name}
                      className="w-10 h-10 object-cover rounded-[4px] flex-shrink-0 border border-ln-op-line"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-[4px] bg-ln-op-stripe flex items-center justify-center flex-shrink-0 text-lg">
                      {entry.file.type === "application/pdf" ? "📄" : "▶"}
                    </div>
                  )}
                  <span className="text-[12px] text-ln-op-ink truncate flex-1">
                    {entry.file.name}
                  </span>
                  <span className="text-[12px] text-ln-op-mute flex-shrink-0">
                    {(entry.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    aria-label={`Quitar ${entry.file.name}`}
                    className="flex-shrink-0 w-5 h-5 rounded-full bg-ln-op-stripe text-ln-op-mute text-[12px] hover:bg-ln-op-line hover:text-ln-op-ink transition-colors"
                  >
                    {"×"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* --- Error global --- */}
        {formError && (
          <p
            className="text-[13px] text-ln-op-danger rounded-[6px] bg-ln-op-danger-bg border border-ln-op-danger-bd px-4 py-3"
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
          className="w-full py-4 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-semibold hover:bg-ln-op-azul-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Ejecutando decomiso..." : "Ejecutar decomiso"}
        </button>

        <p className="text-[12px] text-ln-op-mute text-center">
          Esta acción es irreversible — el decomiso quedará registrado en el sistema de casos bajo
          Ley 14.346. El refugio destinatario recibirá una notificación de handoff.
        </p>
      </div>

      {/* DC2 -- double-confirm modal for pets with an owner */}
      {showConfirmModal && petPreview && (
        <dialog
          open
          className="fixed inset-0 z-50 flex items-center justify-center p-4 m-0 w-full h-full max-w-none max-h-none bg-transparent border-none"
          aria-labelledby="confirm-modal-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-ln-op-ink/40"
            onClick={() => setShowConfirmModal(false)}
            onKeyDown={(e) => e.key === "Escape" && setShowConfirmModal(false)}
          />
          {/* Modal */}
          <div className="relative z-10 w-full max-w-md rounded-[8px] bg-ln-op-card border border-ln-op-line shadow-xl p-6 space-y-4">
            <h3 id="confirm-modal-title" className="text-[16px] font-semibold text-ln-op-ink">
              Confirmar decomiso
            </h3>
            <div className="rounded-[6px] bg-ln-op-warn-bg border border-ln-op-warn-bd px-4 py-3 space-y-1">
              <p className="text-[13px] font-medium text-ln-op-warn">
                Esta mascota tiene un dueño registrado.
              </p>
              <p className="text-[13px] text-ln-op-ink">
                Vas a quitarle la custodia legal de{" "}
                <span className="font-semibold">{petPreview.name}</span>
                {petPreview.ownerDisplayName
                  ? ` a ${petPreview.ownerDisplayName}`
                  : " al dueño actual"}
                .
              </p>
              <p className="text-[13px] text-ln-op-ink">
                El sistema notificará al dueño que el animal fue decomisado. Esta acción está
                amparada en Ley 14.346 y quedará auditada.
              </p>
            </div>
            <p className="text-[13px] text-ln-op-mute">
              Motivo:{" "}
              <span className="font-medium text-ln-op-ink">
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
                className="flex-1 py-3 rounded-[6px] bg-ln-op-danger text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isPending ? "Ejecutando..." : "Si, ejecutar decomiso"}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isPending}
                className="flex-1 py-3 rounded-[6px] border border-ln-op-line text-[13px] text-ln-op-ink hover:bg-ln-op-stripe transition-colors"
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
