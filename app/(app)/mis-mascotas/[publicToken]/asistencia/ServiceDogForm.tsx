"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  retireServiceDogAction,
  setServiceDogVisibilityAction,
  submitServiceDogVerificationRequestAction,
  upsertServiceDogAction,
} from "@/app/actions/service-dog";
import type { PetServiceDog, ServiceDogType } from "@/db";

const SERVICE_TYPE_OPTIONS: { value: ServiceDogType; label: string; bannerEligible: boolean }[] = [
  { value: "guia", label: "Guía (discapacidad visual)", bannerEligible: true },
  { value: "asistencia_motriz", label: "Asistencia motriz", bannerEligible: true },
  { value: "alerta_medica", label: "Alerta médica (diabetes, epilepsia)", bannerEligible: true },
  { value: "senal_auditiva", label: "Señal (auditiva)", bannerEligible: true },
  { value: "asistencia_tea", label: "Asistencia TEA (autismo)", bannerEligible: true },
  {
    value: "otro",
    label: "Otro (no enumerado por ANDIS — sin banner público)",
    bannerEligible: false,
  },
];

export function ServiceDogForm({
  petPublicToken,
  initial,
}: {
  petPublicToken: string;
  initial: PetServiceDog | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  const [serviceType, setServiceType] = useState<ServiceDogType>(initial?.serviceType ?? "guia");
  const [trainingCenter, setTrainingCenter] = useState(initial?.trainingCenter ?? "");
  const [trainingCertDate, setTrainingCertDate] = useState(initial?.trainingCertDate ?? "");
  const [rupgaCredential, setRupgaCredential] = useState(initial?.rupgaCredential ?? "");
  const [credentialIssueDate, setCredentialIssueDate] = useState(
    initial?.credentialIssueDate ?? "",
  );
  const [credentialExpiryDate, setCredentialExpiryDate] = useState(
    initial?.credentialExpiryDate ?? "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const canSubmitVerification =
    initial &&
    (initial.credentialStatus === "en_entrenamiento" ||
      initial.credentialStatus === "pendiente_verificacion");
  const isVigente = initial?.credentialStatus === "vigente";
  const isRevoked = initial?.credentialStatus === "revocada";

  function save() {
    setError(null);
    setOkMessage(null);
    startTransition(async () => {
      const result = await upsertServiceDogAction({
        petPublicToken,
        serviceType,
        trainingCenter,
        trainingCertDate: trainingCertDate || null,
        rupgaCredential: rupgaCredential.trim() || null,
        credentialIssueDate: credentialIssueDate || null,
        credentialExpiryDate: credentialExpiryDate || null,
        notes: notes.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOkMessage("Datos guardados.");
      router.refresh();
    });
  }

  function submitForVerification() {
    setError(null);
    setOkMessage(null);
    startTransition(async () => {
      const result = await submitServiceDogVerificationRequestAction({ petPublicToken });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOkMessage(
        `Solicitud enviada (${result.approvalRequestPublicToken}). La autoridad va a revisarla.`,
      );
      router.refresh();
    });
  }

  function toggleVisibility(next: "full_banner" | "private_only") {
    setError(null);
    setOkMessage(null);
    startTransition(async () => {
      const result = await setServiceDogVisibilityAction({
        petPublicToken,
        publicVisibility: next,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function retire() {
    if (
      !confirm(
        "¿Retirar el perro del servicio? Va a perder los derechos de acceso bajo Ley 26.858. El banner público deja de aparecer. Podés mantener esta info como historial.",
      )
    )
      return;
    setError(null);
    setOkMessage(null);
    startTransition(async () => {
      const result = await retireServiceDogAction({ petPublicToken });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {isVigente && initial?.inService && (
        <div className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-4 space-y-3">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            Banner público de acceso
          </p>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Cuando lo activás, el banner aparece en{" "}
            <code className="font-mono">/p/{petPublicToken}</code> con el texto del derecho de
            acceso (Arts. 1 y 7, Ley 26.858). Podés mostrarlo en la puerta de un local o transporte.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => toggleVisibility("full_banner")}
              disabled={pending || initial.publicVisibility === "full_banner"}
              className={`px-3 py-1 rounded text-sm ${
                initial.publicVisibility === "full_banner"
                  ? "bg-emerald-600 text-white"
                  : "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              } disabled:opacity-60`}
            >
              Activar banner público
            </button>
            <button
              type="button"
              onClick={() => toggleVisibility("private_only")}
              disabled={pending || initial.publicVisibility === "private_only"}
              className={`px-3 py-1 rounded text-sm ${
                initial.publicVisibility === "private_only"
                  ? "bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900"
                  : "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              } disabled:opacity-60`}
            >
              Mantener privado
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4"
      >
        <fieldset disabled={isRevoked} className="space-y-4 disabled:opacity-50">
          <div>
            <label
              htmlFor="service-type"
              className="block text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1"
            >
              Tipo de servicio
            </label>
            <select
              id="service-type"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceDogType)}
              className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
            >
              {SERVICE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-neutral-500 mt-1">
              Las 5 categorías ANDIS habilitan el banner público. "Otro" guarda los datos pero no
              renderiza banner (Res. ANDIS 2588/2022).
            </p>
          </div>

          <div>
            <label
              htmlFor="training-center"
              className="block text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1"
            >
              Centro de entrenamiento *
            </label>
            <input
              id="training-center"
              type="text"
              required
              value={trainingCenter}
              onChange={(e) => setTrainingCenter(e.target.value)}
              placeholder="Ej: Bocalan Argentina, IGDF/ADI miembro"
              className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
            />
            <p className="text-xs text-neutral-500 mt-1">
              ANDIS reconoce centros miembros de IGDF (International Guide Dog Federation) o ADI
              (Assistance Dogs International).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="training-cert-date"
                className="block text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1"
              >
                Fecha del certificado del centro
              </label>
              <input
                id="training-cert-date"
                type="date"
                value={trainingCertDate}
                onChange={(e) => setTrainingCertDate(e.target.value)}
                className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="rupga-credential"
                className="block text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1"
              >
                Número RUPGA
              </label>
              <input
                id="rupga-credential"
                type="text"
                value={rupgaCredential}
                onChange={(e) => setRupgaCredential(e.target.value)}
                placeholder="Si ya tenés"
                className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="cred-issue"
                className="block text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1"
              >
                Emisión de la credencial
              </label>
              <input
                id="cred-issue"
                type="date"
                value={credentialIssueDate}
                onChange={(e) => setCredentialIssueDate(e.target.value)}
                className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="cred-expiry"
                className="block text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1"
              >
                Vencimiento de la credencial
              </label>
              <input
                id="cred-expiry"
                type="date"
                value={credentialExpiryDate}
                onChange={(e) => setCredentialExpiryDate(e.target.value)}
                className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="sd-notes"
              className="block text-sm font-medium text-neutral-900 dark:text-neutral-50 mb-1"
            >
              Notas (opcional)
            </label>
            <textarea
              id="sd-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm"
            />
          </div>
        </fieldset>

        {error && <output className="block text-sm text-red-600 dark:text-red-400">{error}</output>}
        {okMessage && (
          <output className="block text-sm text-emerald-700 dark:text-emerald-300">
            {okMessage}
          </output>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending || isRevoked}
            className="px-4 py-2 rounded bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Guardando..." : "Guardar datos"}
          </button>
          {canSubmitVerification && (
            <button
              type="button"
              onClick={submitForVerification}
              disabled={pending}
              className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              Solicitar verificación
            </button>
          )}
          {initial?.inService && (
            <button
              type="button"
              onClick={retire}
              disabled={pending}
              className="px-4 py-2 rounded border border-red-300 text-red-700 dark:border-red-800 dark:text-red-300 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
            >
              Retirar del servicio
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
