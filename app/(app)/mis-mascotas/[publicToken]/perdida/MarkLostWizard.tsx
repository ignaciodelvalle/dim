"use client";

// MarkLostWizard — 3-step wizard wrapping the previous MarkLostForm.
// Trilogy unification handoff §3 PR-020.
//
// Steps:
//   1. ¿Dónde la viste por última vez? — L2 location + 'Usar mi ubicación'
//      primary + optional reason/notes. CTA: Continuar.
//   2. Datos para que la reconozcan — enriched description (color,
//      distinguishing features, accessories, behavior, last seen context,
//      optional retroactive chip/tattoo). Shown ONLY when the pet has
//      neither microchip nor tattoo on file; otherwise the wizard skips
//      this step. CTA: Continuar.
//   3. Qué querés que vean — 5 disclosure toggles. CTA: Marcar como perdida.
//
// All form fields are uncontrolled. The wizard reads them via a single
// formRef at submit time, exactly like DenunciaWizard does for the same
// reason (LocationFields renders its own hidden inputs and porting it to
// a controlled API is out of scope for this PR).

import { useRef, useState, useTransition } from "react";

import type { DisclosurePrefsInput, EventFormState } from "@/app/actions/events";
import { LocationFields } from "@/components/LocationFields";
import { SuccessScreen } from "@/components/poncho/SuccessScreen";
import { WizardShell } from "@/components/poncho/Wizard";
import { inputClass, labelClass } from "@/lib/form-classes";
import { TATTOO_LOCATIONS } from "@/lib/lookups";

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

const DISCLOSURE_TOGGLES: Array<{
  name: keyof DisclosurePrefsInput;
  formName: string;
  label: string;
  description: string;
}> = [
  {
    name: "discloseFirstNameWhenLost",
    formName: "disclose_first_name_when_lost",
    label: "Tu nombre",
    description: "Quienes encuentren a tu mascota verán tu nombre de pila.",
  },
  {
    name: "disclosePhoneWhenLost",
    formName: "disclose_phone_when_lost",
    label: "Tu teléfono",
    description: "La credencial pública mostrará un botón directo para llamarte.",
  },
  {
    name: "discloseEmailWhenLost",
    formName: "disclose_email_when_lost",
    label: "Tu email",
    description: "Se mostrará un enlace de contacto por correo electrónico.",
  },
  {
    name: "discloseLastLocationWhenLost",
    formName: "disclose_last_location_when_lost",
    label: "Última ubicación conocida",
    description: "Ayuda a orientar la búsqueda en el barrio correcto.",
  },
  {
    name: "allowFinderFormWhenLost",
    formName: "allow_finder_form_when_lost",
    label: "Formulario de quien la encontró",
    description:
      "Permite que alguien te avise a través de la credencial sin necesitar tu contacto.",
  },
];

export function MarkLostWizard({
  action,
  disclosureDefaults,
  petName,
  petPublicToken,
  petHasMicrochip,
  petHasTattoo,
  petColor,
  petDistinguishingFeatures,
  petJurisdictionProvince,
  petJurisdictionLocality,
}: {
  action: FormAction;
  disclosureDefaults: DisclosurePrefsInput;
  petName: string;
  petPublicToken: string;
  petHasMicrochip: boolean;
  petHasTattoo: boolean;
  petColor: string | null;
  petDistinguishingFeatures: string | null;
  petJurisdictionProvince: string | null;
  petJurisdictionLocality: string | null;
}) {
  // Detail step is conditional — pets with chip or tattoo skip it.
  const showDetailsStep = !petHasMicrochip && !petHasTattoo;
  const totalSteps = showDetailsStep ? 3 : 2;
  const stepLabels = showDetailsStep
    ? ["¿Dónde la viste?", "Datos para reconocerla", "Qué querés que vean"]
    : ["¿Dónde la viste?", "Qué querés que vean"];

  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function goBack() {
    setErrorMessage(null);
    setStep((s) => Math.max(1, s - 1));
  }

  function goNext() {
    setErrorMessage(null);
    setStep((s) => Math.min(totalSteps, s + 1));
  }

  function handleSubmit() {
    setErrorMessage(null);
    const formData = formRef.current ? new FormData(formRef.current) : new FormData();
    // Signal to setPetLostAction to skip the redirect so we can render
    // our own SuccessScreen client-side (sprint 3 PR-021).
    formData.set("noRedirect", "1");
    startTransition(async () => {
      const result = await action({ error: null }, formData);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      if (result?.ok) {
        setSubmitted(true);
      }
    });
  }

  if (submitted) {
    const profileHref = `/mis-mascotas/${petPublicToken}`;
    const printHref = `/p/${petPublicToken}?print=true`;
    const shareText = `${petName} está perdida — ayudanos a encontrarla. Su perfil público:`;
    const shareUrl = `https://wa.me/?text=${encodeURIComponent(
      `${shareText} ${typeof window !== "undefined" ? window.location.origin : ""}/p/${petPublicToken}`,
    )}`;
    return (
      <SuccessScreen
        title={`Activamos la búsqueda de ${petName}`}
        description="Su perfil público ya muestra el aviso. Más gente va a poder ayudarte a encontrarla."
        next={[
          { label: "Compartir por WhatsApp", href: shareUrl },
          { label: "Imprimir cartel A4", href: printHref, variant: "secondary" },
          { label: "Volver al perfil", href: profileHref, variant: "tertiary" },
        ]}
      />
    );
  }

  return (
    <form ref={formRef} className="space-y-0">
      <WizardShell
        currentStep={step}
        totalSteps={totalSteps}
        stepLabels={stepLabels}
        onBack={step > 1 ? goBack : undefined}
      >
        {/* Step 1 — Location + when. Always rendered to preserve uncontrolled
            field values across step transitions (same trick DenunciaWizard
            uses). Hidden via sr-only when not active. */}
        <section className={step === 1 ? "space-y-5" : "sr-only"} aria-hidden={step !== 1}>
          <div className="space-y-1">
            <p className="text-sm text-gob-text-muted">
              Marcá el lugar y la hora aproximada del último avistaje. La ubicación se vuelve parte
              de la credencial pública para orientar la búsqueda.
            </p>
          </div>

          <LocationFields
            mode="l2"
            biasProvince={petJurisdictionProvince}
            biasLocality={petJurisdictionLocality}
            useMyLocationVariant="primary"
          />

          <div className="space-y-1.5">
            <label htmlFor="reason" className={labelClass}>
              Detalles (opcional)
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              placeholder="Cualquier detalle que pueda ayudar (collar, comportamiento, hora aproximada)"
              className={inputClass}
            />
            <p className="text-xs text-gob-text-muted">
              Se guarda en el historial para tu referencia.
            </p>
          </div>

          <button
            type="button"
            onClick={goNext}
            className="w-full px-4 py-3 rounded-lg bg-gob-warning  text-white font-medium hover:bg-gob-warning  disabled:opacity-50 transition-colors"
          >
            Continuar
          </button>
        </section>

        {/* Step 2 — Enriched details (conditional). */}
        {showDetailsStep && (
          <section className={step === 2 ? "space-y-5" : "sr-only"} aria-hidden={step !== 2}>
            <div className="rounded-xl border border-gob-info  bg-gob-info/10  p-4 space-y-5">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-gob-azul-link ">
                  Sin chip ni tatuaje, estos detalles son clave
                </p>
                <p className="text-xs text-gob-azul-link ">
                  Cualquiera que la encuentre sin documentación va a depender de cómo se ve.
                </p>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gob-azul-link ">
                  Identidad
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="enriched_color" className={labelClass}>
                    Color y pelaje
                  </label>
                  <input
                    id="enriched_color"
                    name="enriched_color"
                    type="text"
                    defaultValue={petColor ?? ""}
                    placeholder="Ej: marrón con manchas blancas en el pecho"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="enriched_distinguishing_features" className={labelClass}>
                    Marcas o características distintivas
                  </label>
                  <textarea
                    id="enriched_distinguishing_features"
                    name="enriched_distinguishing_features"
                    rows={2}
                    defaultValue={petDistinguishingFeatures ?? ""}
                    placeholder="Ej: mancha negra en la oreja derecha, cola corta, cicatriz en el lomo"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gob-azul-link ">
                  Al momento de perderse
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="enriched_accessories_when_lost" className={labelClass}>
                    Accesorios que llevaba
                  </label>
                  <input
                    id="enriched_accessories_when_lost"
                    name="enriched_accessories_when_lost"
                    type="text"
                    placeholder="Ej: collar rojo con placa, campera azul"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="enriched_behavior_notes" className={labelClass}>
                    Comportamiento y temperamento
                  </label>
                  <textarea
                    id="enriched_behavior_notes"
                    name="enriched_behavior_notes"
                    rows={2}
                    placeholder="Ej: se asusta de los autos, responde a su nombre"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="enriched_last_seen_context" className={labelClass}>
                    Contexto del último avistaje
                  </label>
                  <textarea
                    id="enriched_last_seen_context"
                    name="enriched_last_seen_context"
                    rows={2}
                    placeholder="Ej: salió por la puerta cuando abrimos el portón"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gob-azul-link ">
                  Microchip (opcional)
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="enriched_microchip_id" className={labelClass}>
                    Número de microchip
                  </label>
                  <input
                    id="enriched_microchip_id"
                    name="enriched_microchip_id"
                    type="text"
                    placeholder="Ej: 982000411234567"
                    className={inputClass}
                  />
                  <p className="text-xs text-gob-text-muted">
                    Si te acordás que tiene chip pero nunca lo cargaste, ingresalo acá.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gob-azul-link ">
                  Tatuaje (opcional)
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="enriched_tattoo_code" className={labelClass}>
                    Código del tatuaje
                  </label>
                  <input
                    id="enriched_tattoo_code"
                    name="enriched_tattoo_code"
                    type="text"
                    placeholder="Ej: K9-2014-A"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="enriched_tattoo_location" className={labelClass}>
                    Ubicación
                  </label>
                  <select
                    id="enriched_tattoo_location"
                    name="enriched_tattoo_location"
                    className={inputClass}
                    defaultValue=""
                  >
                    <option value="">Seleccionar</option>
                    {TATTOO_LOCATIONS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="enriched_tattoo_description" className={labelClass}>
                    Descripción (opcional)
                  </label>
                  <textarea
                    id="enriched_tattoo_description"
                    name="enriched_tattoo_description"
                    rows={2}
                    placeholder="Ej: campaña de castración 2018"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={goNext}
              className="w-full px-4 py-3 rounded-lg bg-gob-warning  text-white font-medium hover:bg-gob-warning  transition-colors"
            >
              Continuar
            </button>
          </section>
        )}

        {/* Final step — disclosure. */}
        <section
          className={step === totalSteps ? "space-y-5" : "sr-only"}
          aria-hidden={step !== totalSteps}
        >
          <div className="rounded-xl border border-gob-border  bg-gob-surface-alt  p-4 space-y-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-gob-text ">
                ¿Qué información mostramos en tu credencial pública mientras esté perdida?
              </p>
              <p className="text-xs text-gob-text-muted">
                Podés cambiar esto en cualquier momento mientras la mascota esté perdida.
              </p>
            </div>

            <div className="space-y-3">
              {DISCLOSURE_TOGGLES.map((toggle) => (
                <label
                  key={toggle.formName}
                  className="flex items-start gap-3 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    name={toggle.formName}
                    defaultChecked={disclosureDefaults[toggle.name]}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gob-border-strong  text-gob-warning-text focus:ring-gob-warning focus:ring-offset-0"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium text-gob-text  group-hover:text-gob-warning-text  transition-colors">
                      {toggle.label}
                    </p>
                    <p className="text-xs text-gob-text-muted">{toggle.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {errorMessage && (
            <p className="text-sm text-gob-danger " role="alert">
              {errorMessage}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full px-4 py-3 rounded-lg bg-gob-warning  text-white font-medium hover:bg-gob-warning  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Marcando..." : "Marcar como perdida"}
          </button>
        </section>
      </WizardShell>
    </form>
  );
}
