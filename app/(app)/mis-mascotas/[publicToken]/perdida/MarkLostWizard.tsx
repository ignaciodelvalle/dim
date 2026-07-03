"use client";

// MarkLostWizard — Libreta Nacional redesign (seal/red tone, §10 handoff).
//
// Collects location + reconocimiento detail only. Disclosure preferences
// (name/phone/email/location/finder-form) are NOT set here anymore (lean
// audit 2026-07-03 dedup): they lived here AND in LostDisclosureCard, so the
// same 5 toggles had two editors. Marking a pet lost now applies the pet's
// existing (privacy-sensible default) disclosure prefs — setPetLostAction's
// parseDisclosurePrefsFromForm falls back to petDefaults when the form
// carries no disclosure fields — and LostDisclosureCard (always rendered in
// the lost block post-mark) is the single place to tune them.

import { useRef, useState, useTransition } from "react";

import { Icon } from "@/components/Icon";
import { LocationFields } from "@/components/LocationFields";
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
import { LnSuccessScreen } from "@/components/ui/SuccessScreen";
import { TATTOO_LOCATIONS } from "@/lib/reference/lookups";
import type { EventFormState } from "@/src/modules/events/actions";

type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;

export function MarkLostWizard({
  action,
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
  petName: string;
  petPublicToken: string;
  petHasMicrochip: boolean;
  petHasTattoo: boolean;
  petColor: string | null;
  petDistinguishingFeatures: string | null;
  petJurisdictionProvince: string | null;
  petJurisdictionLocality: string | null;
}) {
  // Detail step is conditional — pets with chip or tattoo skip it, leaving a
  // single-step location form.
  const showDetailsStep = !petHasMicrochip && !petHasTattoo;
  const totalSteps = showDetailsStep ? 2 : 1;
  const stepLabels = showDetailsStep
    ? ["¿Dónde la viste?", "Datos para reconocerla"]
    : ["¿Dónde la viste?"];

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
    // No disclosure fields are submitted — setPetLostAction applies the pet's
    // existing (default) prefs, and LostDisclosureCard edits them afterward.
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
      <LnSuccessScreen
        title={`Activamos la búsqueda de ${petName}`}
        description="Su perfil público ya muestra el aviso con tus datos de contacto habituales. En su perfil podés ajustar qué información se ve (teléfono, ubicación, email)."
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
        icon={<Icon name="lupa" decorative />}
        title={`Marcar ${petName} como perdida`}
        subtitle={`Paso ${step} de ${totalSteps} · ${stepLabels[step - 1]}`}
      />
      <LnSheetBody>
        {/* Step progress bar */}
        <div className="flex gap-[6px]">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n) => (
            <div
              key={`step-${n}`}
              className={[
                "h-[3px] flex-1 rounded-full transition-colors",
                n <= step ? "bg-[var(--color-ln-seal)]" : "bg-[var(--color-ln-line-strong)]",
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
