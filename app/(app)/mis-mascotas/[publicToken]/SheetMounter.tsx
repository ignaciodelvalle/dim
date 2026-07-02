"use client";

/**
 * SheetMounter — deep-link driven quick-capture sheets for the pet detail page.
 *
 * Opens the appropriate form Sheet based on `?sheet=<id>` URL state.
 * Closing removes the `sheet` (and `text`) params from the URL via router.replace.
 *
 * Supported sheet IDs:
 *   vacuna | peso | sintoma | medicacion | nota | anotar
 *   mostrar-tier2 | compartir-libreta | transferir-mascota
 *
 * NOTE: Full reminder pre-fill (initialVaccineName / sourceReminderId) is
 * intentionally omitted from the VaccinationForm sheet path. The full route
 * at /eventos/nuevo/vacuna/page.tsx does the reminder lookup — the sheet is
 * opt-in quick-capture only. The reminder-linked vaccination flow continues
 * to use the dedicated route.
 *
 * NOTE: SymptomForm accepts `freeText` and `onsetAt` prefill slots via searchParams.
 * These are forwarded from buildCaptureDeeplink when the symptom_observed intent fires.
 *
 * `anotar` (pet-document-redesign D1, ADR-5): hosts CaptureBox + the full
 * discoverability list (CaptureOptionsList) — the same content the /anotar
 * fallback page renders, now the PRIMARY in-profile entry point. Owner-only;
 * org viewers never reach this branch (no trigger renders for them — see
 * page.tsx action row + PetAnotarFooterCta).
 */

import { TurnoAntirrabicaSheet } from "@/components/pet-profile/TurnoAntirrabicaSheet";
import { LnButton } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/VaulSheet";
import { buildCloseSheetUrl } from "@/lib/ui/sheet-helpers";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { CaptureBox } from "./anotar/CaptureBox";
import { CaptureOptionsList } from "./anotar/CaptureOptionsList";
import { MedicationStartForm } from "./eventos/nuevo/medicacion-inicio/MedicationStartForm";
import { NoteForm } from "./eventos/nuevo/nota/NoteForm";
import { WeightForm } from "./eventos/nuevo/peso/WeightForm";
import { SymptomForm } from "./eventos/nuevo/sintoma/SymptomForm";
import { VaccinationForm } from "./eventos/nuevo/vacuna/VaccinationForm";
import { MarkLostWizard } from "./perdida/MarkLostWizard";

import { createLibretaShareAction } from "@/app/actions/libreta-share";
import { enableTier2PublicAction, revokeTier2PublicAction } from "@/app/actions/tier2-public";
import { PetForm } from "@/components/PetForm";
import type { Pet } from "@/db";
import {
  createMedicationStartAction,
  createNoteAction,
  createSymptomObservedAction,
  createVaccinationAction,
  createWeightAction,
  setPetFoundAction,
  setPetLostAction,
} from "@/src/modules/events/actions";
import { updatePetAction } from "@/src/modules/pets/actions";

import type { EmergencyContactValues } from "@/components/pet-profile/EmergencyContactFields";
import { PhysicalTagInterestSheet } from "./_chapita/PhysicalTagInterestSheet";
import { EmergencyContactSheet } from "./_emergencia/EmergencyContactSheet";
import { MasSheet } from "./_more/MasSheet";
import { MergedShareSheet } from "./_share/MergedShareSheet";
import { TransferSenderForm } from "./_transfer/TransferSenderForm";

type MarkLostData = {
  discloseFirstNameWhenLost: boolean;
  disclosePhoneWhenLost: boolean;
  discloseEmailWhenLost: boolean;
  discloseLastLocationWhenLost: boolean;
  allowFinderFormWhenLost: boolean;
  petHasMicrochip: boolean;
  petHasTattoo: boolean;
  petColor: string | null;
  petDistinguishingFeatures: string | null;
  petJurisdictionProvince: string | null;
  petJurisdictionLocality: string | null;
};

type Props = {
  petToken: string;
  petName: string;
  species: string;
  /** ISO string of pet.tier2PublicEnabledUntil — null when not set. */
  tier2PublicEnabledUntil: string | null;
  /** Whether the permanent "siempre" option is active (tier2PublicPermanent column). */
  tier2PublicPermanent: boolean;
  /** Data required by MarkLostForm. Null when pet is not active (already lost or deceased). */
  markLostData: MarkLostData | null;
  /** Data required by the editar-mascota sheet. Always set. */
  editPetData: {
    existingPet: Pet;
    existingPhotoUrl: string | null;
  };
  /** Pet status — needed to gate the marcar-encontrada sheet. */
  petStatus: "active" | "lost" | "deceased";
  /** Two-face redesign (2026-07-01) — required by the "⋯ Más" sheet (MasSheet). */
  accessPath: "owner" | "org";
  ownershipRole: string | null;
  hasPendingReturnProposal: boolean;
  /**
   * physical-tag-interest state for the owner viewer (pet-document-redesign
   * ADR-17b). Null for org viewers / deceased pets — the chapita branch
   * denies those before this is ever read.
   */
  chapitaData: { interested: boolean; requestedAt: Date | null } | null;
  /**
   * Current vet/emergency contact values for the `?sheet=emergencia` sheet
   * (pet-document-redesign ADR-13). Owner-only — null for org viewers, same
   * gating page.tsx already applies to `viewerContacts`.
   */
  emergencyContacts: EmergencyContactValues | null;
};

export function SheetMounter({
  petToken,
  petName,
  species,
  tier2PublicEnabledUntil,
  tier2PublicPermanent,
  markLostData,
  editPetData,
  petStatus,
  accessPath,
  ownershipRole,
  hasPendingReturnProposal,
  chapitaData,
  emergencyContacts,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sheet = searchParams.get("sheet");
  const text = searchParams.get("text") ?? undefined;
  // Slot params forwarded by buildCaptureDeeplink when coming from CaptureBox / deeplinks.
  const kg = searchParams.get("kg") ?? undefined;
  const occurredAt = searchParams.get("occurredAt") ?? undefined;
  const notes = searchParams.get("notes") ?? undefined;
  // Symptom-specific prefill slots (symptom_observed registry entry).
  const freeText = searchParams.get("freeText") ?? undefined;
  const onsetAt = searchParams.get("onsetAt") ?? undefined;
  // anotar-specific prefill: forwarded event kind (e.g. from EventCatcher's
  // handoff, mirrors the `/anotar?kind=` fallback-page contract).
  const kind = searchParams.get("kind") ?? undefined;

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("text");
    router.replace(buildCloseSheetUrl(pathname, params));
  }, [router, pathname, searchParams]);

  if (sheet === "anotar") {
    // REQ-4.4: org viewers never get an Anotar entry point. No trigger
    // renders for them (action row / footer CTA), and this is the
    // defense-in-depth backstop for a hand-typed URL.
    // REQ-9.3: a deceased pet never accepts new events — same backstop.
    if (accessPath !== "owner" || petStatus === "deceased") return null;
    return (
      <Sheet id="anotar" title={`Anotar algo de ${petName}`} open onClose={close} size="lg">
        <div className="space-y-7">
          <CaptureBox
            petPublicToken={petToken}
            petName={petName}
            initialText={text}
            initialKind={kind}
          />
          <div className="flex items-center gap-3 text-xs text-[var(--color-ln-mute)]">
            <div className="h-px flex-1 bg-[var(--color-ln-stripe)]" />
            <span>o elegí directamente</span>
            <div className="h-px flex-1 bg-[var(--color-ln-stripe)]" />
          </div>
          <CaptureOptionsList petPublicToken={petToken} />
        </div>
      </Sheet>
    );
  }

  if (sheet === "vacuna") {
    const action = createVaccinationAction.bind(null, petToken);
    return (
      <Sheet id="vacuna" title="Registrar vacuna" open onClose={close}>
        <VaccinationForm
          action={action}
          species={species}
          defaults={{ occurredAt: null, notes: text ?? null }}
        />
      </Sheet>
    );
  }

  if (sheet === "peso") {
    const action = createWeightAction.bind(null, petToken);
    return (
      <Sheet id="peso" title="Registrar peso" open onClose={close}>
        <WeightForm
          action={action}
          defaults={{
            kg: kg ?? null,
            occurredAt: occurredAt ?? null,
            notes: notes ?? text ?? null,
          }}
        />
      </Sheet>
    );
  }

  if (sheet === "sintoma") {
    const action = createSymptomObservedAction.bind(null, petToken);
    return (
      <Sheet id="sintoma" title="Registrar síntoma" open onClose={close}>
        <SymptomForm
          action={action}
          petName={petName}
          defaults={{ freeText: freeText ?? null, onsetAt: onsetAt ?? null }}
        />
      </Sheet>
    );
  }

  if (sheet === "medicacion") {
    const action = createMedicationStartAction.bind(null, petToken);
    return (
      <Sheet id="medicacion" title="Inicio de medicación" open onClose={close}>
        <MedicationStartForm
          action={action}
          species={species}
          defaultNotes={notes ?? text}
          defaultOccurredAt={occurredAt}
        />
      </Sheet>
    );
  }

  if (sheet === "nota") {
    const action = createNoteAction.bind(null, petToken);
    return (
      <Sheet id="nota" title="Nota" open onClose={close}>
        <NoteForm
          action={action}
          defaults={{ text: text ?? null, occurredAt: occurredAt ?? null }}
        />
      </Sheet>
    );
  }

  if (sheet === "turno-antirrabica") {
    return (
      <Sheet id="turno-antirrabica" title="Programar antirrábica" open onClose={close}>
        <TurnoAntirrabicaSheet petToken={petToken} />
      </Sheet>
    );
  }

  // "compartir" — the merged share sheet (design ADR-7): public QR link +
  // expiring share link (formerly compartir-libreta) + Tier 2 medical view
  // toggle (formerly mostrar-tier2), fused into one affordance. The two old
  // sheet ids are kept below as deep-link ALIASES routing into this same
  // sheet — see the "Sheets map" table in design.md.
  if (sheet === "compartir" || sheet === "compartir-libreta" || sheet === "mostrar-tier2") {
    const now = new Date();
    const activeUntilDate = tier2PublicEnabledUntil ? new Date(tier2PublicEnabledUntil) : null;
    const isActive = tier2PublicPermanent || (!!activeUntilDate && activeUntilDate > now);
    const enable = enableTier2PublicAction.bind(null, petToken);
    const revoke = revokeTier2PublicAction.bind(null, petToken);
    // Wrap the action so the sheet only supplies expiresInDays + label;
    // petPublicToken is captured from the outer scope.
    const shareAction = (input: { expiresInDays: number | null; label: string | null }) =>
      createLibretaShareAction({ petPublicToken: petToken, ...input });
    return (
      <Sheet id="compartir" title="Compartir" open onClose={close}>
        <MergedShareSheet
          petPublicToken={petToken}
          petName={petName}
          createShareAction={shareAction}
          tier2={{
            isActive,
            isPermanent: tier2PublicPermanent,
            activeUntil: isActive && !tier2PublicPermanent ? activeUntilDate : null,
            enableAction: enable,
            revokeAction: revoke,
          }}
          isOwner={accessPath === "owner"}
        />
      </Sheet>
    );
  }

  if (sheet === "chapita") {
    // REQ-11.2/REQ-9.3: owner-only, never for a deceased pet (ordering a
    // physical tag for a deceased pet is nonsensical) — defense-in-depth
    // backstop for a hand-typed URL, same pattern as the anotar branch.
    if (accessPath !== "owner" || petStatus === "deceased" || !chapitaData) return null;
    return (
      <Sheet id="chapita" title="Chapa física" open onClose={close}>
        <PhysicalTagInterestSheet
          petPublicToken={petToken}
          petName={petName}
          initialInterested={chapitaData.interested}
          initialRequestedAt={chapitaData.requestedAt}
        />
      </Sheet>
    );
  }

  if (sheet === "emergencia") {
    // ADR-13/REQ-9 (Phase 5): owner-only, same shape as the chapita branch's
    // defense-in-depth guard for a hand-typed URL.
    if (accessPath !== "owner" || !emergencyContacts) return null;
    return (
      <Sheet id="emergencia" title="Contactos de emergencia" open onClose={close}>
        <EmergencyContactSheet
          petPublicToken={petToken}
          initialValues={emergencyContacts}
          onSaved={close}
        />
      </Sheet>
    );
  }

  if (sheet === "mas") {
    return (
      <Sheet id="mas" title="Más" open onClose={close}>
        <MasSheet
          pet={{ species, status: petStatus, publicToken: petToken }}
          accessPath={accessPath}
          ownershipRole={ownershipRole}
          hasPendingReturnProposal={hasPendingReturnProposal}
        />
      </Sheet>
    );
  }

  if (sheet === "transferir-mascota") {
    return (
      <Sheet id="transferir-mascota" title="Transferir mascota" open onClose={close}>
        <TransferStub petName={petName} petToken={petToken} />
      </Sheet>
    );
  }

  if (sheet === "marcar-perdida") {
    if (!markLostData) return null; // pet not active — flow doesn't apply
    const action = setPetLostAction.bind(null, petToken);
    return (
      <Sheet
        id="marcar-perdida"
        title="Marcar como perdida"
        open
        onClose={close}
        side="right"
        size="lg"
      >
        <MarkLostWizard
          action={action}
          disclosureDefaults={{
            discloseFirstNameWhenLost: markLostData.discloseFirstNameWhenLost,
            disclosePhoneWhenLost: markLostData.disclosePhoneWhenLost,
            discloseEmailWhenLost: markLostData.discloseEmailWhenLost,
            discloseLastLocationWhenLost: markLostData.discloseLastLocationWhenLost,
            allowFinderFormWhenLost: markLostData.allowFinderFormWhenLost,
          }}
          petName={petName}
          petPublicToken={petToken}
          petHasMicrochip={markLostData.petHasMicrochip}
          petHasTattoo={markLostData.petHasTattoo}
          petColor={markLostData.petColor}
          petDistinguishingFeatures={markLostData.petDistinguishingFeatures}
          petJurisdictionProvince={markLostData.petJurisdictionProvince}
          petJurisdictionLocality={markLostData.petJurisdictionLocality}
        />
      </Sheet>
    );
  }

  if (sheet === "editar-mascota") {
    const action = updatePetAction.bind(null, petToken);
    return (
      <Sheet
        id="editar-mascota"
        title={`Editar ${petName}`}
        open
        onClose={close}
        side="right"
        size="lg"
      >
        <PetForm
          action={action}
          existingPet={editPetData.existingPet}
          existingPhotoUrl={editPetData.existingPhotoUrl}
        />
      </Sheet>
    );
  }

  if (sheet === "marcar-encontrada") {
    // WP-6: instead of returning null (silent no-op) when the pet is not lost,
    // render a lean friendly message so the user understands why the flow does
    // not apply and can navigate back to the profile.
    if (petStatus !== "lost") {
      return (
        <Sheet
          id="marcar-encontrada"
          title="Marcar como encontrada"
          open
          onClose={close}
          side="right"
          size="md"
        >
          <PetNotLostNotice petName={petName} petToken={petToken} onClose={close} />
        </Sheet>
      );
    }
    const action = setPetFoundAction.bind(null, petToken);
    return (
      <Sheet
        id="marcar-encontrada"
        title="Marcar como encontrada"
        open
        onClose={close}
        side="right"
        size="md"
      >
        <MarkFoundConfirmation action={action} petName={petName} onCancel={close} />
      </Sheet>
    );
  }

  // Unknown or absent sheet param — render nothing.
  return null;
}

// ---------------------------------------------------------------------------
// MarkFoundConfirmation — inline confirmation form for the marcar-encontrada sheet
// ---------------------------------------------------------------------------

function MarkFoundConfirmation({
  action,
  petName,
  onCancel,
}: {
  action: () => Promise<void>;
  petName: string;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-ln-ink-2)]">
        Vas a marcar a <strong>{petName}</strong> como encontrada. La credencial pública vuelve al
        modo identidad básica (Tier 0). Podés volver a marcarla como perdida si hace falta.
      </p>
      <form action={action} className="flex gap-2">
        <LnButton type="submit" variant="ok">
          Confirmar
        </LnButton>
        <LnButton type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </LnButton>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PetNotLostNotice — shown when marcar-encontrada is triggered but the pet
// is not currently marked as lost (WP-6 no-op fix).
// ---------------------------------------------------------------------------

function PetNotLostNotice({
  petName,
  petToken,
  onClose,
}: {
  petName: string;
  petToken: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-ln-ink-2)]">
        <strong>{petName}</strong> no figura como perdida, así que no hay nada que marcar como
        encontrada.
      </p>
      <div className="flex gap-2">
        <LnButton type="button" variant="ghost" onClick={onClose}>
          Volver al perfil
        </LnButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TransferStub — owner→owner handshake form (P3-2)
// ---------------------------------------------------------------------------

function TransferStub({ petName, petToken }: { petName: string; petToken: string }) {
  return <TransferSenderForm petName={petName} petToken={petToken} />;
}
