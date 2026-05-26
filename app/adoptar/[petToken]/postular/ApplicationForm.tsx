"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { submitAdoptionApplicationAction } from "@/app/actions/adoption-applications";
import { labelClass } from "@/lib/form-classes";

type HousingType = "casa_con_patio" | "casa_sin_patio" | "departamento" | "otro";

const HOUSING_OPTIONS: Array<{ value: HousingType; label: string }> = [
  { value: "casa_con_patio", label: "Casa con patio" },
  { value: "casa_sin_patio", label: "Casa sin patio" },
  { value: "departamento", label: "Departamento" },
  { value: "otro", label: "Otra" },
];

export function ApplicationForm({
  petPublicToken,
  petName,
  applicantEmail,
}: {
  petPublicToken: string;
  petName: string;
  applicantEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [housingType, setHousingType] = useState<HousingType | "">("");
  const [otherPets, setOtherPets] = useState("");
  const [dailyRoutine, setDailyRoutine] = useState("");
  const [notes, setNotes] = useState("");
  const [profileSharingConsent, setProfileSharingConsent] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!housingType) {
      setError("Elegí el tipo de vivienda.");
      return;
    }
    startTransition(async () => {
      const result = await submitAdoptionApplicationAction({
        petPublicToken,
        housingType,
        otherPets: otherPets.trim() || null,
        dailyRoutine: dailyRoutine.trim() || null,
        notes: notes.trim() || null,
        profileSharingConsent,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/mis-mascotas/postulaciones?nueva=${result.applicationEventId}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-sm text-gob-text-gray">
        Compartinos un poco sobre tu situación para que el refugio sepa si tu hogar encaja con lo
        que necesita {petName}. Te van a contactar a tu email{" "}
        <span className="font-medium">{applicantEmail}</span> para coordinar los próximos pasos.
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gob-text">¿Cómo es tu vivienda?</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {HOUSING_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${
                housingType === opt.value
                  ? "border-gob-success bg-gob-success/10"
                  : "border-gob-border-strong"
              }`}
            >
              <input
                type="radio"
                name="housing"
                value={opt.value}
                checked={housingType === opt.value}
                onChange={() => setHousingType(opt.value)}
                className="sr-only"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="other-pets" className={`${labelClass} mb-1`}>
          ¿Tenés otras mascotas? <span className="text-gob-text-muted">(opcional)</span>
        </label>
        <textarea
          id="other-pets"
          value={otherPets}
          onChange={(e) => setOtherPets(e.target.value)}
          rows={2}
          placeholder='Ej: "un gato castrado adulto, sociable"'
          className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
        />
      </div>

      <div>
        <label htmlFor="daily-routine" className={`${labelClass} mb-1`}>
          Cómo es tu día a día <span className="text-gob-text-muted">(opcional)</span>
        </label>
        <textarea
          id="daily-routine"
          value={dailyRoutine}
          onChange={(e) => setDailyRoutine(e.target.value)}
          rows={3}
          placeholder="¿Quién está en casa durante el día? ¿Hay nenes? ¿Alguien la cuida si viajás?"
          className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
        />
      </div>

      <div>
        <label htmlFor="notes" className={`${labelClass} mb-1`}>
          Algo más que quieras contar <span className="text-gob-text-muted">(opcional)</span>
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded border border-gob-border-strong bg-white text-sm"
        />
      </div>

      {/* Consent checkbox — required before submit (spec §12.5.2) */}
      <div className="space-y-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={profileSharingConsent}
            onChange={(e) => setProfileSharingConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gob-border-strong text-gob-success focus:ring-gob-success"
          />
          <span className="text-sm text-gob-text-gray">
            Acepto compartir con el refugio mi historial de adopciones, fosters y mascotas en MiMAR
            para que tomen una mejor decisión.{" "}
            <button
              type="button"
              onClick={() => setPrivacyModalOpen(true)}
              className="underline text-gob-success hover:text-gob-success/80"
            >
              Más info sobre tu privacidad
            </button>
          </span>
        </label>
      </div>

      {/* Privacy modal — native <dialog>, no portal library needed */}
      {privacyModalOpen && (
        <dialog
          open
          className="fixed inset-0 z-50 m-auto max-w-lg w-full rounded-xl border border-gob-border bg-white p-6 shadow-xl"
          aria-labelledby="privacy-modal-title"
        >
          <h2 id="privacy-modal-title" className="text-base font-semibold text-gob-text mb-4">
            Información sobre privacidad — Ley 25.326
          </h2>
          <div className="text-sm text-gob-text-gray space-y-3">
            <p>
              Bajo la Ley 25.326 (Protección de Datos Personales), tus datos solo pueden compartirse
              con consentimiento informado y para un propósito específico.
            </p>
            <p>
              <strong>Qué compartirías:</strong> la lista de tus adopciones previas en MiMAR (con
              outcome — exitosa, revertida, etc.), tus fosters previos, tus mascotas registradas
              actualmente (species, sex, año aproximado de nacimiento, no nombre completo del
              veterinario ni medical detail). NO compartirías: tus notificaciones, otras
              postulaciones a OTRAS mascotas, denuncias de bienestar que hayas hecho, dirección
              exacta.
            </p>
            <p>
              <strong>Por cuánto tiempo:</strong> solo mientras tu postulación a {petName} esté
              abierta. Al cerrarse, el refugio pierde acceso inmediatamente.
            </p>
            <p>
              <strong>Por qué te pedimos esto:</strong> el refugio toma mejor decisión con contexto.
              Una persona con buena trayectoria de adopciones previas (checkins regulares, sin
              reversiones) tiene más probabilidad de ser elegida. Sin el consent, el refugio decide
              solo con lo que escribís acá.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPrivacyModalOpen(false)}
            className="mt-5 w-full px-4 py-2 rounded-lg bg-gob-primary text-white text-sm font-medium hover:opacity-90"
          >
            Entendido
          </button>
        </dialog>
      )}

      {error && <output className="block text-sm text-gob-danger">{error}</output>}

      <button
        type="submit"
        disabled={pending || !profileSharingConsent}
        className="w-full px-6 py-3 rounded-lg bg-emerald-600 text-white text-base font-semibold hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Enviando postulación..." : "Enviar postulación"}
      </button>
    </form>
  );
}
