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
 *
 * Router-hot-path fix: this component is always mounted by page.tsx
 * regardless of `?sheet=` (verified — page.tsx never gates it behind
 * `sp.sheet`), so open state simply reacts to useSearchParams(), which Next
 * updates reactively on both the SSR-provided initial URL AND on
 * pushSheetUrl()'s shallow window.history.pushState calls from every
 * trigger (PetActionRow, LibretaFace's EmergenciaBlock
 * link, MasSheet — see lib/ui/sheet-nav.ts). `close()` uses closeSheetNav
 * instead of router.replace so closing never touches the router either.
 */

import { TurnoAntirrabicaSheet } from "@/components/pet-profile/TurnoAntirrabicaSheet";
import { LnButton } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/VaulSheet";
import { buildCloseSheetUrl } from "@/lib/ui/sheet-helpers";
import { closeSheetNav, closeSheetNavWithFullReload } from "@/lib/ui/sheet-nav";
import { useActionRedirect } from "@/lib/ui/use-action-redirect";
import { markLostActionLabel } from "@/lib/utils/format";
import { usePathname, useSearchParams } from "next/navigation";
import { useActionState, useCallback } from "react";

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
import type { PhysicalCredentialChannels } from "@/lib/domain/business-rules-defaults";
import {
  type EventFormState,
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
  // Disclosure prefs are no longer collected at mark time (lean audit
  // 2026-07-03 dedup) — LostDisclosureCard owns them; the mark applies the
  // pet's existing defaults server-side.
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
  /** Pet sex ('male' | 'female' | 'unknown') — flexes the mark-lost sheet
   * title and the lost share copy (ciclo-perdido sweep fix #2). */
  petSex: string | null;
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
    /**
     * Jurisdiction-resolved PPP breed list (resolveBusinessRule for the pet's
     * jurisdiction) so the sheet's inline "raza peligrosa" warning flags a
     * breed a locality ADDED via the admin console — parity with the
     * standalone /editar page. Display-only.
     */
    pppBreedList: readonly string[];
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
   * Physical credential channel availability for the pet's jurisdiction
   * (admin-rules-console ADR-5/R3.5) — resolved via
   * resolvePhysicalCredentialChannels. Same null-gating as chapitaData.
   */
  physicalCredentialChannels: PhysicalCredentialChannels | null;
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
  petSex,
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
  physicalCredentialChannels,
  emergencyContacts,
}: Props) {
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
    closeSheetNav(buildCloseSheetUrl(pathname, params));
  }, [pathname, searchParams]);

  // EmergencyContactSheet's onSaved (not its "×"/cancel onClose, which stays
  // on the regular shallow `close` above): the save mutates
  // `profiles.emergency_*`, which LibretaFace's EmergenciaBlock renders
  // server-side from page.tsx's initial SSR output. A shallow close never
  // re-fetches that RSC tree, so the card kept the old phone until a hard
  // reload — see closeSheetNavWithFullReload's docblock for why
  // router.refresh() isn't a safe fix either (same silent-drop defect,
  // engram #621/#622).
  const closeAfterEmergencyContactSave = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("text");
    closeSheetNavWithFullReload(buildCloseSheetUrl(pathname, params));
  }, [pathname, searchParams]);

  if (sheet === "anotar") {
    // REQ-4.4: org viewers never get an Anotar entry point. No trigger
    // renders for them (action row / footer CTA), and this is the
    // defense-in-depth backstop for a hand-typed URL.
    // REQ-9.3: a deceased pet never accepts new events — same backstop.
    if (accessPath !== "owner" || petStatus === "deceased") return null;
    // No-flash routing (flow audit + code review 2026-07-03): a resolvable
    // intent (?kind=… or matcher-recognized ?text=…) is redirected to its
    // target form by the SERVER (page.tsx, before render) so nothing flashes
    // and no client router.replace can silently drop the hop. By the time we
    // mount here the intent is unresolvable — open the anotar sheet with the
    // "no reconocemos" UI.
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
          petSex={petSex}
          createShareAction={shareAction}
          tier2={{
            isActive,
            isPermanent: tier2PublicPermanent,
            activeUntil: isActive && !tier2PublicPermanent ? activeUntilDate : null,
            enableAction: enable,
            revokeAction: revoke,
          }}
          isOwner={accessPath === "owner"}
          isLost={petStatus === "lost"}
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
          channels={physicalCredentialChannels}
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
          onSaved={closeAfterEmergencyContactSave}
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
        title={markLostActionLabel(petSex)}
        open
        onClose={close}
        side="right"
        size="lg"
      >
        <MarkLostWizard
          action={action}
          petName={petName}
          petSex={petSex}
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
          pppBreedList={editPetData.pppBreedList}
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
  action: (previous: EventFormState, formData: FormData) => Promise<EventFormState>;
  petName: string;
  onCancel: () => void;
}) {
  // N3 redirect contract: setPetFoundAction returns `redirectTo` on success
  // and this form performs the full document navigation (see
  // lib/ui/use-action-redirect.ts) — which also closes this sheet by loading
  // the profile URL without the ?sheet= param.
  const [state, formAction, isPending] = useActionState(action, { error: null });
  useActionRedirect(state.redirectTo);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-ln-ink-2)]">
        Vas a marcar a <strong>{petName}</strong> como encontrada. La credencial pública vuelve al
        modo identidad básica (Tier 0). Podés volver a marcarla como perdida si hace falta.
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-ln-err)]">
          {state.error}
        </p>
      )}
      <form action={formAction} className="flex gap-2">
        <LnButton type="submit" variant="ok" disabled={isPending}>
          {isPending ? "Guardando…" : "Confirmar"}
        </LnButton>
        <LnButton type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
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
