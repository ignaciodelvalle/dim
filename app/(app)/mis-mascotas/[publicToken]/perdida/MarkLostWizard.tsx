"use client";

// MarkLostWizard — Libreta Nacional redesign (seal/red tone, §10 handoff).
// Presentation ONLY: 3-step wizard structure, formRef pattern, step logic,
// action call, field names, and submit logic are untouched.

import { useRef, useState, useTransition } from "react";

import { LnCallout } from "@/components/ui/DocElements";
import { LnField, LnInput, LnSelect, LnTextarea } from "@/components/ui/Field";
import {
  LnGroupLabel,
  LnSheetAccordion,
  LnSheetBody,
  LnSheetFooter,
  LnSheetHeader,
  LnSubCard,
} from "@/components/ui/Sheet";
import { LnToggle } from "@/components/ui/Toggle";
import { LocationFields } from "@/components/LocationFields";
import { SuccessScreen } from "@/components/poncho/SuccessScreen";
import { TATTOO_LOCATIONS } from "@/lib/lookups";
import type { DisclosurePrefsInput, EventFormState } from "@/src/modules/events/actions";

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

const DISCLOSURE_TOGGLES: Array<{
  name: keyof DisclosurePrefsInput;
  formName: string;
  label: string;
  description: string;
  defaultOn: boolean;
}> = [
  {
    name: "discloseFirstNameWhenLost",
    formName: "disclose_first_name_when_lost",
    label: "Tu nombre",
    description: "Quienes encuentren a tu mascota verán tu nombre de pila.",
    defaultOn: true,
  },
  {
    name: "disclosePhoneWhenLost",
    formName: "disclose_phone_when_lost",
    label: "Tu teléfono",
    description: "La credencial pública mostrará un botón directo para llamarte.",
    defaultOn: true,
  },
  {
    name: "discloseEmailWhenLost",
    formName: "disclose_email_when_lost",
    label: "Tu email",
    description: "Se mostrará un enlace de contacto por correo electrónico.",
    defaultOn: false,
  },
  {
    name: "discloseLastLocationWhenLost",
    formName: "disclose_last_location_when_lost",
    label: "Última ubicación conocida",
    description: "Ayuda a orientar la búsqueda en el barrio correcto.",
    defaultOn: true,
  },
  {
    name: "allowFinderFormWhenLost",
    formName: "allow_finder_form_when_lost",
    label: "Formulario de quien la encontró",
    description:
      "Permite que alguien te avise a través de la credencial sin necesitar tu contacto.",
    defaultOn: true,
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

  // Disclosure toggles state (LnToggle is controlled)
  const [disclosure, setDisclosure] = useState<Record<string, boolean>>({
    disclose_first_name_when_lost: disclosureDefaults.discloseFirstNameWhenLost,
    disclose_phone_when_lost: disclosureDefaults.disclosePhoneWhenLost,
    disclose_email_when_lost: disclosureDefaults.discloseEmailWhenLost,
    disclose_last_location_when_lost: disclosureDefaults.discloseLastLocationWhenLost,
    allow_finder_form_when_lost: disclosureDefaults.allowFinderFormWhenLost,
  });

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
    // Sync controlled toggle state into formData before submit.
    // (Hidden inputs in the form only capture the initial defaultChecked;
    // LnToggle is controlled so we write the current values here.)
    for (const [k, v] of Object.entries(disclosure)) {
      formData.set(k, v ? "on" : "");
    }
    // Signal to setPetLostAction to skip the redirect.
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
    const printHref = `/mis-mascotas/${petPublicToken}/cartel`;
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

  const isLastStep = step === totalSteps;

  return (
    <>
      <LnSheetHeader
        tone="seal"
        icon="🔍"
        title={`Marcar ${petName} como perdida`}
        subtitle={`Paso ${step} de ${totalSteps} · ${stepLabels[step - 1]}`}
      />
      <LnSheetBody>
        {/* Step progress bar */}
        <div className="flex gap-[6px]">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={[
                "h-[3px] flex-1 rounded-full transition-colors",
                i < step
                  ? "bg-[var(--color-ln-seal)]"
                  : "bg-[var(--color-ln-line-strong)]",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          ))}
        </div>

        <form ref={formRef} className="contents">
          {/* Step 1 — Location. Always rendered (hidden when inactive) to preserve
              uncontrolled field values across step transitions. */}
          <section
            data-section="step-location"
            className={step === 1 ? "flex flex-col gap-[14px]" : "sr-only"}
            aria-hidden={step !== 1}
          >
            <p className="text-[12.5px] text-[var(--color-ln-mute)]">
              Marcá el lugar y la hora aproximada del último avistaje. La ubicación se vuelve parte
              de la credencial pública para orientar la búsqueda.
            </p>

            <LocationFields
              mode="l2"
              biasProvince={petJurisdictionProvince}
              biasLocality={petJurisdictionLocality}
              useMyLocationVariant="primary"
            />

            <LnField label="Detalles">
              {({ id, describedBy }) => (
                <LnTextarea
                  id={id}
                  name="reason"
                  rows={3}
                  placeholder="Cualquier detalle que pueda ayudar (collar, comportamiento, hora aproximada)"
                  aria-describedby={describedBy}
                />
              )}
            </LnField>
          </section>

          {/* Step 2 — Enriched details (conditional — only when no chip/tattoo). */}
          {showDetailsStep && (
            <section
              data-section="step-details"
              className={step === 2 ? "flex flex-col gap-[14px]" : "sr-only"}
              aria-hidden={step !== 2}
            >
              <LnCallout tone="azul" title="Sin chip ni tatuaje, estos detalles son clave">
                Cualquiera que la encuentre sin documentación va a depender de cómo se ve.
              </LnCallout>

              <LnSubCard heading="Identidad">
                <LnGroupLabel>Aspecto físico</LnGroupLabel>
                <LnField label="Color y pelaje">
                  {({ id, describedBy }) => (
                    <LnInput
                      id={id}
                      name="enriched_color"
                      type="text"
                      defaultValue={petColor ?? ""}
                      placeholder="Ej: marrón con manchas blancas en el pecho"
                      aria-describedby={describedBy}
                    />
                  )}
                </LnField>
                <LnField label="Marcas o características distintivas">
                  {({ id, describedBy }) => (
                    <LnTextarea
                      id={id}
                      name="enriched_distinguishing_features"
                      rows={2}
                      defaultValue={petDistinguishingFeatures ?? ""}
                      placeholder="Ej: mancha negra en la oreja derecha, cola corta"
                      aria-describedby={describedBy}
                    />
                  )}
                </LnField>
              </LnSubCard>

              <LnSubCard heading="Al momento de perderse">
                <LnField label="Accesorios que llevaba">
                  {({ id, describedBy }) => (
                    <LnInput
                      id={id}
                      name="enriched_accessories_when_lost"
                      type="text"
                      placeholder="Ej: collar rojo con placa, campera azul"
                      aria-describedby={describedBy}
                    />
                  )}
                </LnField>
                <LnField label="Comportamiento y temperamento">
                  {({ id, describedBy }) => (
                    <LnTextarea
                      id={id}
                      name="enriched_behavior_notes"
                      rows={2}
                      placeholder="Ej: se asusta de los autos, responde a su nombre"
                      aria-describedby={describedBy}
                    />
                  )}
                </LnField>
                <LnField label="Contexto del último avistaje">
                  {({ id, describedBy }) => (
                    <LnTextarea
                      id={id}
                      name="enriched_last_seen_context"
                      rows={2}
                      placeholder="Ej: salió por la puerta cuando abrimos el portón"
                      aria-describedby={describedBy}
                    />
                  )}
                </LnField>
              </LnSubCard>

              <LnSubCard heading="Microchip (opcional)">
                <LnField
                  label="Número de microchip"
                  hint="Si te acordás que tiene chip pero nunca lo cargaste, ingresalo acá."
                >
                  {({ id, describedBy }) => (
                    <LnInput
                      id={id}
                      name="enriched_microchip_id"
                      type="text"
                      mono
                      placeholder="Ej: 982000411234567"
                      aria-describedby={describedBy}
                    />
                  )}
                </LnField>
              </LnSubCard>

              <LnSubCard heading="Tatuaje (opcional)">
                <LnField label="Código del tatuaje">
                  {({ id, describedBy }) => (
                    <LnInput
                      id={id}
                      name="enriched_tattoo_code"
                      type="text"
                      mono
                      placeholder="Ej: K9-2014-A"
                      aria-describedby={describedBy}
                    />
                  )}
                </LnField>
                <LnField label="Ubicación">
                  {({ id, describedBy, invalid }) => (
                    <LnSelect
                      id={id}
                      name="enriched_tattoo_location"
                      defaultValue=""
                      aria-describedby={describedBy}
                      invalid={invalid}
                    >
                      <option value="">Seleccionar</option>
                      {TATTOO_LOCATIONS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </LnSelect>
                  )}
                </LnField>
                <LnField label="Descripción">
                  {({ id, describedBy }) => (
                    <LnTextarea
                      id={id}
                      name="enriched_tattoo_description"
                      rows={2}
                      placeholder="Ej: campaña de castración 2018"
                      aria-describedby={describedBy}
                    />
                  )}
                </LnField>
              </LnSubCard>
            </section>
          )}

          {/* Final step — disclosure toggles. */}
          <section
            data-section="step-disclosure"
            className={step === totalSteps ? "flex flex-col gap-[12px]" : "sr-only"}
            aria-hidden={step !== totalSteps}
          >
            <LnSubCard heading="Preferencias de divulgación">
              <p className="text-[12px] text-[var(--color-ln-mute)]">
                ¿Qué información mostramos en tu credencial pública mientras esté perdida? Podés
                cambiar esto en cualquier momento.
              </p>
              <div className="flex flex-col gap-[8px]">
                {DISCLOSURE_TOGGLES.map((toggle) => (
                  <LnToggle
                    key={toggle.formName}
                    variant="amber"
                    checked={disclosure[toggle.formName] ?? toggle.defaultOn}
                    onChange={(v) =>
                      setDisclosure((prev) => ({ ...prev, [toggle.formName]: v }))
                    }
                    label={toggle.label}
                    description={toggle.description}
                  />
                ))}
              </div>
              {/* Hidden inputs so formData picks up toggle state when JS reads FormData */}
              {DISCLOSURE_TOGGLES.map((toggle) => (
                <input
                  key={toggle.formName}
                  type="hidden"
                  name={toggle.formName}
                  value={disclosure[toggle.formName] ?? toggle.defaultOn ? "on" : ""}
                />
              ))}
            </LnSubCard>
          </section>

          {errorMessage && (
            <p
              className="font-[var(--font-ln-mono)] text-[11.5px] text-[var(--color-ln-err)]"
              role="alert"
            >
              {errorMessage}
            </p>
          )}
        </form>
      </LnSheetBody>

      {/* Footer — step navigation */}
      <div className="flex items-center gap-[10px] border-t border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] px-[18px] py-[13px]">
        {step > 1 && (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[3px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-[14px] py-[8px] text-[12.5px] font-semibold text-[var(--color-ln-ink)] transition-colors hover:bg-[var(--color-ln-stripe)]"
          >
            ← Atrás
          </button>
        )}
        <div className="flex-1" />
        {!isLastStep ? (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[3px] border border-[var(--color-ln-warn)] bg-[var(--color-ln-warn)] px-[16px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continuar →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            aria-busy={isPending || undefined}
            className="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[3px] border border-[var(--color-ln-seal)] bg-[var(--color-ln-seal)] px-[16px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? (
              <>
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
                Marcando...
              </>
            ) : (
              "Marcar como perdida"
            )}
          </button>
        )}
      </div>
    </>
  );
}
