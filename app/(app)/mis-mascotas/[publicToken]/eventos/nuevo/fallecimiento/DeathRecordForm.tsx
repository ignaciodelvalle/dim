"use client";

import { Icon } from "@/components/Icon";
import { LnCallout } from "@/components/ui/DocElements";
import { LnField, LnInput, LnRadio, LnSelect, LnTextarea } from "@/components/ui/Field";
import {
  LnSheetAccordion,
  LnSheetBody,
  LnSheetFooter,
  LnSheetHeader,
  LnSubCard,
} from "@/components/ui/Sheet";
import { diseasesForSpecies, findDisease } from "@/lib/reference/diseases";
import { useActionRedirect } from "@/lib/ui/use-action-redirect";
import { useFormErrorFocus } from "@/lib/ui/use-form-error-focus";
import { useIdempotencyKey } from "@/lib/ui/use-idempotency-key";
import type { EventFormState } from "@/src/modules/events/actions";
import { useActionState, useState } from "react";
import { AttachmentField } from "../AttachmentField";

const initialState: EventFormState = { error: null };
type FormAction = (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
const FORM_ID = "death-record-form";

const facilityHints: Record<string, { label: string; placeholder: string }> = {
  cremation_collective: { label: "Crematorio", placeholder: "Nombre del crematorio" },
  cremation_individual_ashes: { label: "Crematorio", placeholder: "Nombre del crematorio" },
  authorized_cemetery: {
    label: "Cementerio",
    placeholder: "Nombre del cementerio o número de habilitación",
  },
  owner_burial: { label: "Ubicación (opcional)", placeholder: "Lugar del entierro" },
};

const defaultFacilityHint = { label: "Instalación", placeholder: "Veterinaria, crematorio, etc." };

/** Inline LN-styled checkbox */
function LnCheckbox({
  name,
  value,
  required,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  required?: boolean;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-[10px]">
      <input
        type="checkbox"
        name={name}
        value={value}
        required={required}
        checked={checked}
        onChange={onChange}
        className="mt-[2px] h-[14px] w-[14px] flex-shrink-0 accent-[var(--color-ln-azul)]"
      />
      <span className="text-[13px] text-[var(--color-ln-ink)]">{children}</span>
    </label>
  );
}

export function DeathRecordForm({
  action,
  species,
  defaults,
}: {
  action: FormAction;
  species: string | null;
  defaults?: { occurredAt: string | null; notes: string | null };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  // N3 redirect contract: the action returns `redirectTo` on success and the
  // form performs the full document navigation (see lib/ui/use-action-redirect.ts).
  useActionRedirect(state.redirectTo);
  const errorRef = useFormErrorFocus<HTMLParagraphElement>(state.error);
  const { key: idempotencyKey } = useIdempotencyKey();
  const today = new Date().toISOString().slice(0, 10);
  const [cause, setCause] = useState("");
  const [selectedDiseaseCode, setSelectedDiseaseCode] = useState("");
  const [confirmedByLab, setConfirmedByLab] = useState(false);
  const [causeDetail, setCauseDetail] = useState("");
  const [confirmedByVet, setConfirmedByVet] = useState(false);
  const [vetName, setVetName] = useState("");
  const [disposition, setDisposition] = useState("");
  const [deathAtClinic, setDeathAtClinic] = useState(false);
  const [vetContactedOwner, setVetContactedOwner] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [vetDecidedAlone, setVetDecidedAlone] = useState(false);
  const [ownerToPrivateCrematorium, setOwnerToPrivateCrematorium] = useState(false);
  const [facility, setFacility] = useState("");
  const [occurredAt, setOccurredAt] = useState(defaults?.occurredAt ?? today);
  const [notes, setNotes] = useState(defaults?.notes ?? "");

  const diseaseOptions = diseasesForSpecies(species);
  const selectedDiseaseDef = findDisease(selectedDiseaseCode);
  const isReportableDisease = selectedDiseaseDef?.reportable === true;

  const facilityHint = facilityHints[disposition] ?? defaultFacilityHint;
  const showOwnerBurialHint = disposition === "owner_burial";
  const showVetDecidedAlone = deathAtClinic && vetContactedOwner === "no";

  return (
    <>
      <LnSheetHeader
        tone="seal"
        icon={<Icon name="fallecimiento" decorative />}
        title="Registrar fallecimiento"
        subtitle="Libreta sanitaria oficial"
      />
      <LnSheetBody>
        <form id={FORM_ID} action={formAction} className="contents">
          <input type="hidden" name="clientIdempotencyKey" value={idempotencyKey} />

          <LnField label="Causa" required>
            {({ id, describedBy, invalid }) => (
              <LnSelect
                id={id}
                name="cause"
                required
                value={cause}
                onChange={(e) => {
                  setCause(e.target.value);
                  setSelectedDiseaseCode("");
                }}
                aria-describedby={describedBy}
                invalid={invalid}
              >
                <option value="">— Seleccioná —</option>
                <option value="known">Conocida</option>
                <option value="unknown">Desconocida</option>
                <option value="natural">Natural / vejez</option>
                <option value="disease">Enfermedad</option>
                <option value="accident">Accidente</option>
                <option value="euthanasia">Eutanasia</option>
                <option value="sudden">Repentina</option>
                <option value="violent">Violenta</option>
                <option value="other">Otra</option>
              </LnSelect>
            )}
          </LnField>

          {cause === "disease" && (
            <LnSubCard>
              <LnField label="Enfermedad" required>
                {({ id, describedBy, invalid }) => (
                  <LnSelect
                    id={id}
                    name="diseaseCode"
                    value={selectedDiseaseCode}
                    onChange={(e) => setSelectedDiseaseCode(e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  >
                    <option value="">Seleccionar enfermedad</option>
                    {diseaseOptions.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.label}
                      </option>
                    ))}
                  </LnSelect>
                )}
              </LnField>
              {isReportableDisease && (
                <LnCallout tone="warn">Reportable a autoridad sanitaria</LnCallout>
              )}
              <LnCheckbox
                name="confirmedByLab"
                value="true"
                checked={confirmedByLab}
                onChange={(e) => setConfirmedByLab(e.target.checked)}
              >
                Confirmado por laboratorio
              </LnCheckbox>
            </LnSubCard>
          )}

          <LnField label="Detalles de la causa">
            {({ id, describedBy }) => (
              <LnTextarea
                id={id}
                name="causeDetail"
                rows={2}
                placeholder="Detalles, si querés agregar"
                value={causeDetail}
                onChange={(e) => setCauseDetail(e.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </LnField>

          <LnCheckbox
            name="confirmedByVet"
            value="true"
            checked={confirmedByVet}
            onChange={(e) => setConfirmedByVet(e.target.checked)}
          >
            Confirmado por veterinario/a
          </LnCheckbox>

          <LnField label="Nombre del veterinario/a">
            {({ id, describedBy }) => (
              <LnInput
                id={id}
                name="vetName"
                type="text"
                placeholder="Dra. López, Dr. García..."
                value={vetName}
                onChange={(e) => setVetName(e.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </LnField>

          {/* Death at clinic section */}
          <LnSheetAccordion num="+" title="¿Falleció en una veterinaria?">
            <div className="flex flex-col gap-[10px]">
              <LnCheckbox
                name="deathAtClinic"
                value="true"
                checked={deathAtClinic}
                onChange={(e) => {
                  setDeathAtClinic(e.target.checked);
                  if (!e.target.checked) {
                    setVetContactedOwner("");
                    setVetDecidedAlone(false);
                    setClinicName("");
                  }
                }}
              >
                Falleció durante una estadía en la veterinaria
              </LnCheckbox>

              {deathAtClinic && (
                <>
                  <LnField label="Nombre de la clínica">
                    {({ id, describedBy }) => (
                      <LnInput
                        id={id}
                        name="clinicName"
                        type="text"
                        placeholder="Clínica Veterinaria…"
                        value={clinicName}
                        onChange={(e) => setClinicName(e.target.value)}
                        aria-describedby={describedBy}
                      />
                    )}
                  </LnField>

                  <div className="flex flex-col gap-[6px]">
                    <p className="font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
                      ¿El veterinario logró contactarte?
                    </p>
                    <div className="flex flex-col gap-[6px]">
                      {[
                        { value: "yes", label: "Sí, me contactaron" },
                        { value: "no", label: "No, no lograron contactarme" },
                        { value: "not_applicable", label: "No aplica" },
                      ].map((opt) => (
                        <LnRadio
                          key={opt.value}
                          name="vetContactedOwner"
                          value={opt.value}
                          checked={vetContactedOwner === opt.value}
                          onChange={(e) => setVetContactedOwner(e.target.value)}
                        >
                          {opt.label}
                        </LnRadio>
                      ))}
                    </div>
                  </div>

                  {showVetDecidedAlone && (
                    <LnCheckbox
                      name="vetDecidedAlone"
                      value="true"
                      checked={vetDecidedAlone}
                      onChange={(e) => setVetDecidedAlone(e.target.checked)}
                    >
                      El veterinario decidió la disposición sin poder contactarme
                    </LnCheckbox>
                  )}
                </>
              )}
            </div>
          </LnSheetAccordion>

          <LnCheckbox
            name="ownerToPrivateCrematorium"
            value="true"
            checked={ownerToPrivateCrematorium}
            onChange={(e) => setOwnerToPrivateCrematorium(e.target.checked)}
          >
            Llevé el cuerpo a un crematorio privado por mi cuenta
          </LnCheckbox>

          <LnField label="Método de disposición">
            {({ id, describedBy, invalid }) => (
              <LnSelect
                id={id}
                name="dispositionMethod"
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              >
                <option value="">—</option>
                <optgroup label="Recomendadas">
                  <option value="cremation_collective">Cremación colectiva</option>
                  <option value="cremation_individual_ashes">
                    Cremación individual (cenizas al propietario)
                  </option>
                  <option value="authorized_cemetery">Cementerio de animales autorizado</option>
                </optgroup>
                <optgroup label="No recomendadas">
                  <option value="owner_burial">Sepultura por el propietario</option>
                  <option value="household_waste">Residuos no especiales (basura)</option>
                </optgroup>
                <optgroup label="Otras">
                  <option value="rendering">Reciclaje sanitario</option>
                  <option value="unknown">No sé</option>
                </optgroup>
              </LnSelect>
            )}
          </LnField>

          {showOwnerBurialHint && (
            <LnCallout tone="warn">
              <strong className="block">Si vas a enterrarlo, te recomendamos:</strong>
              <ul className="mt-[6px] list-inside list-disc space-y-[3px]">
                <li>Profundidad suficiente para que ningún carroñero pueda excavar.</li>
                <li>
                  Asegurate que el animal no tenía enfermedades zoonóticas o contagiosas a otros
                  animales.
                </li>
                <li>Que no haya acuíferos cerca que se puedan contaminar.</li>
                <li>Elegí una zona remota.</li>
              </ul>
            </LnCallout>
          )}

          <LnField label={facilityHint.label}>
            {({ id, describedBy }) => (
              <LnInput
                id={id}
                name="facility"
                type="text"
                placeholder={facilityHint.placeholder}
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </LnField>

          <LnField label="Fecha" required>
            {({ id, describedBy, invalid }) => (
              <LnInput
                id={id}
                name="occurredAt"
                type="date"
                required
                mono
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </LnField>
          <LnField label="Notas">
            {({ id, describedBy }) => (
              <LnTextarea
                id={id}
                name="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </LnField>
          <AttachmentField />
          {state.error && (
            <p
              ref={errorRef}
              className="font-[var(--font-ln-mono)] text-[11.5px] text-[var(--color-ln-err)]"
              role="alert"
              tabIndex={-1}
            >
              {state.error}
            </p>
          )}
        </form>
      </LnSheetBody>
      <LnSheetFooter
        tone="seal"
        ctaLabel="Registrar fallecimiento"
        formId={FORM_ID}
        isPending={isPending}
      />
    </>
  );
}
