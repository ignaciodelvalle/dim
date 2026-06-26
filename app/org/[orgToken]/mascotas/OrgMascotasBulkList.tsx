"use client";

// Client component for the mascotas list. Mirrors the multi-select UI of
// BulkApprovalQueueList but for bulk vaccination, bulk eligibility, and
// bulk adoption-listing publish.
//
// When canEventWrite is true and ≥1 pets are selected, a sticky BulkActionBar
// appears with "Vacunar selección". Clicking it opens an inline
// BulkVaccinationForm. On submit it calls bulkVaccinateAction and shows a
// ResultPanel ("N vacunadas · M fallaron" + per-pet failure reasons +
// bulkActionId). Users without event.write see the list read-only.
//
// Sprint 8 PR2: added "Marcar elegibilidad" button (canIntake) that opens a
// BulkEligibilityForm inline. Only one form is open at a time. Both actions
// share the same selection set.
//
// Sprint 8 PR3: added "Publicar en adopción" button (canManageListing) that
// opens a BulkListingForm inline. Publish and unlist paths. Same selection set.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { BulkResult } from "@/app/actions/bulk-actions";
import {
  bulkPublishListingAction,
  bulkSetEligibilityAction,
  bulkVaccinateAction,
} from "@/app/actions/bulk-pet-events";
import { BULK_INELIGIBLE_REASONS } from "@/app/actions/bulk-vaccinate-types";
import { LnCheckbox } from "@/components/ui/Field";
import { OpStateBadge } from "@/components/ui/dashboard";
import { OrgMascotasPipelineBoard } from "./OrgMascotasPipelineBoard";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PetCardData = {
  petId: string;
  publicToken: string;
  name: string;
  species: string;
  breed: string | null;
  color: string | null;
  dateOfBirth: string | null;
  birthDateIsEstimated: boolean;
  status: string;
  adoptionEligible: boolean | null;
  adoptionListedAt: string | null;
  adoptionListingPausedAt: string | null;
  ownershipRole: string;
  startedAt: string;
};

type Props = {
  cards: PetCardData[];
  fosteredPetIds: string[];
  pendingProposalPetIds: string[];
  orgToken: string;
  canIntake: boolean;
  canAssignFoster: boolean;
  canEndFoster: boolean;
  canFinalizeAdoption: boolean;
  canTransfer: boolean;
  canReturnToOwner: boolean;
  canManageAdoptionListing: boolean;
  canEventWrite: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  owner: {
    label: "Dueño",
    className: "bg-ln-op-ok-bg text-ln-op-ok border border-ln-op-ok-bd",
  },
  shelter_custody: {
    label: "En custodia",
    className: "bg-ln-op-warn-bg text-ln-op-warn border border-ln-op-warn-bd",
  },
  foster: {
    label: "Tránsito",
    className: "bg-ln-op-blue-bg text-ln-op-azul border border-ln-op-blue-bd",
  },
  co_owner: {
    label: "Co-dueño",
    className: "bg-ln-op-stripe text-ln-op-mute border border-ln-op-line",
  },
  caretaker: {
    label: "Caretaker",
    className: "bg-ln-op-stripe text-ln-op-mute border border-ln-op-line",
  },
};

const SPECIES_LABELS: Record<string, string> = {
  dog: "Perro",
  cat: "Gato",
  other: "Otro",
};

const INELIGIBLE_REASON_LABELS: Record<(typeof BULK_INELIGIBLE_REASONS)[number], string> = {
  medical_treatment: "Tratamiento médico",
  behavioral_evaluation: "Evaluación conductual",
  recovery: "Recuperación",
  quarantine: "Cuarentena",
  legal_hold: "Retención legal",
  age: "Edad",
  pending_intake_eval: "Evaluación de ingreso pendiente",
  other: "Otro",
};

const BULK_MAX = 500;

function speciesLabel(s: string): string {
  return SPECIES_LABELS[s] ?? s;
}

function calcAge(dob: string): string {
  const birth = new Date(dob);
  const now = new Date();
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (months < 12) return `${Math.max(0, months)} meses`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths === 0) return `${years} año${years === 1 ? "" : "s"}`;
  return `${years} año${years === 1 ? "" : "s"} ${remMonths} m`;
}

// Derive OpStateBadge state from card data.
function deriveAdoptionState(
  card: PetCardData,
): "published" | "paused" | "draft" | "adopted" | null {
  if (card.status === "active" && card.adoptionListedAt && !card.adoptionListingPausedAt)
    return "published";
  if (card.adoptionListedAt && card.adoptionListingPausedAt) return "paused";
  if (card.adoptionEligible === true) return "draft";
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OrgMascotasBulkList({
  cards,
  fosteredPetIds,
  pendingProposalPetIds,
  orgToken,
  canIntake,
  canAssignFoster,
  canEndFoster,
  canFinalizeAdoption,
  canTransfer,
  canReturnToOwner,
  canManageAdoptionListing,
  canEventWrite,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"none" | "vaccinate" | "eligibility" | "listing">("none");
  const [lastResult, setLastResult] = useState<BulkResult | null>(null);
  const [lastResultType, setLastResultType] = useState<
    "vaccinate" | "eligibility" | "listing-publish" | "listing-unlist" | null
  >(null);
  // View toggle: "list" (default) or "board" (pipeline).
  const [view, setView] = useState<"list" | "board">("list");

  const fosteredSet = new Set(fosteredPetIds);
  const pendingProposalSet = new Set(pendingProposalPetIds);

  const canBulkSelect = canEventWrite || canIntake || canManageAdoptionListing;

  function toggle(token: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(cards.map((c) => c.publicToken)));
  }

  function clear() {
    setSelected(new Set());
    setMode("none");
    setLastResult(null);
    setLastResultType(null);
  }

  const allSelected = selected.size === cards.length && cards.length > 0;
  const someSelected = selected.size > 0;

  if (cards.length === 0) {
    return (
      <p className="text-[13px] text-ln-op-mute">
        Todavía no hay animales registrados a nombre de la organización.
      </p>
    );
  }

  return (
    <div className="space-y-3 pb-32">
      {/* View toggle: Lista / Tablero */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {canBulkSelect && view === "list" && (
          <div className="flex items-center gap-3 text-sm text-ln-op-mute">
            <button
              type="button"
              onClick={allSelected ? clear : selectAll}
              className="underline hover:text-ln-op-ink"
            >
              {allSelected ? "Deseleccionar todo" : `Seleccionar todo (${cards.length})`}
            </button>
          </div>
        )}
        {!canBulkSelect && <div />}

        <fieldset className="inline-flex rounded-[6px] border border-ln-op-line overflow-hidden text-sm p-0">
          <legend className="sr-only">Vista</legend>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            className={[
              "px-3 py-1.5 font-medium transition-colors",
              view === "list"
                ? "bg-ln-op-azul text-white"
                : "bg-ln-op-card text-ln-op-mute hover:text-ln-op-ink",
            ].join(" ")}
          >
            Lista
          </button>
          <button
            type="button"
            onClick={() => setView("board")}
            aria-pressed={view === "board"}
            className={[
              "px-3 py-1.5 font-medium transition-colors border-l border-ln-op-line",
              view === "board"
                ? "bg-ln-op-azul text-white"
                : "bg-ln-op-card text-ln-op-mute hover:text-ln-op-ink",
            ].join(" ")}
          >
            Tablero
          </button>
        </fieldset>
      </div>

      {/* Board view */}
      {view === "board" && (
        <OrgMascotasPipelineBoard
          cards={cards}
          fosteredPetIds={fosteredPetIds}
          orgToken={orgToken}
        />
      )}

      {/* List view */}
      {view === "list" && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map((card) => {
            const isSelected = selected.has(card.publicToken);
            const badge = ROLE_BADGE[card.ownershipRole] ?? ROLE_BADGE.shelter_custody;
            const ageInfo = card.dateOfBirth
              ? `${card.birthDateIsEstimated ? "~" : ""}${calcAge(card.dateOfBirth)}`
              : "edad desconocida";
            const hasFoster = fosteredSet.has(card.petId);
            const showFosterCta =
              canAssignFoster && card.ownershipRole === "shelter_custody" && !hasFoster;
            const showTransferCta =
              canTransfer &&
              (card.ownershipRole === "shelter_custody" || card.ownershipRole === "owner");
            const hasPendingProposal = pendingProposalSet.has(card.petId);
            const showReturnToOwnerCta =
              canReturnToOwner &&
              card.ownershipRole === "shelter_custody" &&
              card.status === "lost" &&
              !hasPendingProposal;
            const anyCta =
              showFosterCta ||
              (canEndFoster && hasFoster) ||
              (canFinalizeAdoption && card.ownershipRole === "shelter_custody") ||
              showTransferCta ||
              showReturnToOwnerCta;

            const adState = deriveAdoptionState(card);

            return (
              <li
                key={card.petId}
                className={`rounded-[6px] border p-3 space-y-2 ${
                  isSelected
                    ? "border-ln-op-azul bg-ln-op-blue-bg"
                    : "border-ln-op-line bg-ln-op-card"
                }`}
              >
                <div className="flex items-start gap-2">
                  {canBulkSelect && (
                    <LnCheckbox
                      id={`row-${card.publicToken}`}
                      checked={isSelected}
                      onChange={() => toggle(card.publicToken)}
                      aria-label={`Seleccionar ${card.name}`}
                      className="mt-1 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                    <Link
                      href={`/mis-mascotas/${card.publicToken}`}
                      className="flex-1 min-w-0 hover:underline"
                    >
                      <p className="text-md font-semibold text-ln-op-ink">{card.name}</p>
                      <p className="text-sm text-ln-op-mute">
                        {speciesLabel(card.species)}
                        {card.breed ? ` · ${card.breed}` : ""}
                        {card.color ? ` · ${card.color}` : ""}
                      </p>
                    </Link>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      {hasFoster && card.ownershipRole === "shelter_custody" && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${ROLE_BADGE.foster.className}`}
                        >
                          + tránsito
                        </span>
                      )}
                      {adState && <OpStateBadge state={adState} />}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-ln-op-mute">
                  {ageInfo} · ingreso{" "}
                  {new Date(card.startedAt).toLocaleDateString("es-AR", {
                    dateStyle: "medium",
                  })}
                </p>
                <p className="text-sm text-ln-op-mute">
                  <code className="font-ln-mono">{card.publicToken}</code>
                </p>
                {anyCta && (
                  <div className="pt-1 flex flex-wrap gap-2">
                    {showFosterCta && (
                      <Link
                        href={`/org/${orgToken}/mascotas/${card.publicToken}/foster`}
                        className="inline-block text-sm px-2 py-1 rounded-[4px] border border-ln-op-line bg-ln-op-stripe text-ln-op-ink hover:bg-ln-op-line-2"
                      >
                        Asignar tránsito
                      </Link>
                    )}
                    {canEndFoster && hasFoster && (
                      <Link
                        href={`/org/${orgToken}/mascotas/${card.publicToken}?sheet=fin-transito`}
                        className="inline-block text-sm px-2 py-1 rounded-[4px] border border-ln-op-line bg-ln-op-stripe text-ln-op-ink hover:bg-ln-op-line-2"
                      >
                        Cerrar tránsito
                      </Link>
                    )}
                    {canIntake && card.ownershipRole === "shelter_custody" && (
                      <Link
                        href={`/org/${orgToken}/mascotas/${card.publicToken}?sheet=elegibilidad`}
                        className="inline-block text-sm px-2 py-1 rounded-[4px] border border-ln-op-line bg-ln-op-stripe text-ln-op-ink hover:bg-ln-op-line-2"
                      >
                        {card.adoptionEligible === true
                          ? "Apta ✓"
                          : card.adoptionEligible === false
                            ? "NO apta"
                            : "Elegibilidad"}
                      </Link>
                    )}
                    {canManageAdoptionListing && card.ownershipRole === "shelter_custody" && (
                      <Link
                        href={`/org/${orgToken}/mascotas/${card.publicToken}/adoptar`}
                        className="inline-block text-sm px-2 py-1 rounded-[4px] border border-ln-op-line bg-ln-op-stripe text-ln-op-ink hover:bg-ln-op-line-2"
                      >
                        {card.adoptionListedAt && !card.adoptionListingPausedAt
                          ? "Publicada ✓"
                          : card.adoptionListedAt && card.adoptionListingPausedAt
                            ? "Pausada"
                            : "Publicar"}
                      </Link>
                    )}
                    {canFinalizeAdoption && card.ownershipRole === "shelter_custody" && (
                      <Link
                        href={`/org/${orgToken}/mascotas/${card.publicToken}/adoption`}
                        className="inline-block text-sm px-2 py-1 rounded-[4px] bg-ln-op-ok text-white hover:opacity-90"
                      >
                        Finalizar adopción
                      </Link>
                    )}
                    {showReturnToOwnerCta && (
                      <Link
                        href={`/org/${orgToken}/mascotas/${card.publicToken}?sheet=devolver-al-dueno`}
                        className="inline-block text-sm px-2 py-1 rounded-[4px] bg-ln-op-azul text-white hover:bg-ln-op-azul-700"
                      >
                        Devolver al dueño
                      </Link>
                    )}
                    {showTransferCta && (
                      <Link
                        href={`/org/${orgToken}/mascotas/${card.publicToken}/transfer`}
                        className="inline-block text-sm px-2 py-1 rounded-[4px] border border-ln-op-line bg-ln-op-stripe text-ln-op-ink hover:bg-ln-op-line-2"
                      >
                        Transferir
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {lastResult && (
        <ResultPanel
          result={lastResult}
          actionType={lastResultType ?? "vaccinate"}
          onDismiss={() => {
            setLastResult(null);
            setLastResultType(null);
          }}
        />
      )}

      {someSelected && canBulkSelect && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-ln-op-line bg-ln-op-card z-50">
          <div className="max-w-3xl mx-auto px-6 py-3 space-y-3">
            {mode === "none" && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px]">
                    <span className="font-medium">{selected.size}</span> seleccionada
                    {selected.size === 1 ? "" : "s"}
                    {selected.size > BULK_MAX && (
                      <span className="ml-2 text-ln-op-danger text-sm">(máx. {BULK_MAX})</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clear}
                    className="text-sm text-ln-op-mute hover:text-ln-op-ink"
                  >
                    Limpiar
                  </button>
                  {canEventWrite && (
                    <button
                      type="button"
                      onClick={() => setMode("vaccinate")}
                      disabled={selected.size > BULK_MAX}
                      className="px-3 py-1.5 rounded-[4px] text-[13px] bg-ln-op-azul text-white hover:bg-ln-op-azul-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Vacunar selección
                    </button>
                  )}
                  {canIntake && (
                    <button
                      type="button"
                      onClick={() => setMode("eligibility")}
                      disabled={selected.size > BULK_MAX}
                      className="px-3 py-1.5 rounded-[4px] text-[13px] bg-ln-op-celeste text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Marcar elegibilidad
                    </button>
                  )}
                  {canManageAdoptionListing && (
                    <button
                      type="button"
                      onClick={() => setMode("listing")}
                      disabled={selected.size > BULK_MAX}
                      className="px-3 py-1.5 rounded-[4px] text-[13px] bg-ln-op-ok text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Publicar en adopción
                    </button>
                  )}
                </div>
              </div>
            )}

            {mode === "vaccinate" && (
              <BulkVaccinationForm
                count={selected.size}
                pending={pending}
                onCancel={() => setMode("none")}
                onSubmit={(fields) => {
                  const tokens = Array.from(selected);
                  setLastResult(null);
                  setLastResultType(null);
                  startTransition(async () => {
                    const bulkActionId = crypto.randomUUID();
                    const result = await bulkVaccinateAction({
                      orgToken,
                      petPublicTokens: tokens,
                      bulkActionId,
                      ...fields,
                    });
                    setLastResult(result);
                    setLastResultType("vaccinate");
                    setMode("none");
                    setSelected(new Set());
                    router.refresh();
                  });
                }}
              />
            )}

            {mode === "eligibility" && (
              <BulkEligibilityForm
                count={selected.size}
                pending={pending}
                onCancel={() => setMode("none")}
                onSubmit={(fields) => {
                  const tokens = Array.from(selected);
                  setLastResult(null);
                  setLastResultType(null);
                  startTransition(async () => {
                    const bulkActionId = crypto.randomUUID();
                    const result = await bulkSetEligibilityAction({
                      orgToken,
                      petPublicTokens: tokens,
                      bulkActionId,
                      ...fields,
                    });
                    setLastResult(result);
                    setLastResultType("eligibility");
                    setMode("none");
                    setSelected(new Set());
                    router.refresh();
                  });
                }}
              />
            )}

            {mode === "listing" && (
              <BulkListingForm
                count={selected.size}
                pending={pending}
                onCancel={() => setMode("none")}
                onSubmit={(publish) => {
                  const tokens = Array.from(selected);
                  setLastResult(null);
                  setLastResultType(null);
                  startTransition(async () => {
                    const bulkActionId = crypto.randomUUID();
                    const result = await bulkPublishListingAction({
                      orgToken,
                      petPublicTokens: tokens,
                      bulkActionId,
                      publish,
                    });
                    setLastResult(result);
                    setLastResultType(publish ? "listing-publish" : "listing-unlist");
                    setMode("none");
                    setSelected(new Set());
                    router.refresh();
                  });
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BulkVaccinationForm ──────────────────────────────────────────────────────

type VaccinationFields = {
  vaccineName: string;
  occurredAt: string;
  brand?: string | null;
  batch?: string | null;
  administeredBy?: string | null;
  nextDueAt?: string | null;
};

function BulkVaccinationForm({
  count,
  pending,
  onCancel,
  onSubmit,
}: {
  count: number;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (fields: VaccinationFields) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [vaccineName, setVaccineName] = useState("");
  const [occurredAt, setOccurredAt] = useState(today);
  const [brand, setBrand] = useState("");
  const [batch, setBatch] = useState("");
  const [administeredBy, setAdministeredBy] = useState("");
  const [nextDueAt, setNextDueAt] = useState("");

  function handleSubmit() {
    onSubmit({
      vaccineName: vaccineName.trim(),
      occurredAt,
      brand: brand.trim() || null,
      batch: batch.trim() || null,
      administeredBy: administeredBy.trim() || null,
      nextDueAt: nextDueAt.trim() || null,
    });
  }

  const canSubmit = vaccineName.trim().length > 0 && occurredAt.length > 0;

  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium text-ln-op-ink">
        Vacunar {count} animal{count === 1 ? "" : "es"}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-sm text-ln-op-mute" htmlFor="bulk-vax-name">
            Vacuna <span className="text-ln-op-danger">*</span>
          </label>
          <input
            id="bulk-vax-name"
            type="text"
            value={vaccineName}
            onChange={(e) => setVaccineName(e.target.value)}
            placeholder="Ej. Cuádruple canina"
            className="w-full px-3 py-1.5 rounded-[4px] border border-ln-op-line bg-ln-op-card text-ln-op-ink text-[13px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-ln-op-mute" htmlFor="bulk-vax-date">
            Fecha de aplicación <span className="text-ln-op-danger">*</span>
          </label>
          <input
            id="bulk-vax-date"
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="w-full px-3 py-1.5 rounded-[4px] border border-ln-op-line bg-ln-op-card text-ln-op-ink text-[13px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-ln-op-mute" htmlFor="bulk-vax-brand">
            Marca (opcional)
          </label>
          <input
            id="bulk-vax-brand"
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Ej. Nobivac"
            className="w-full px-3 py-1.5 rounded-[4px] border border-ln-op-line bg-ln-op-card text-ln-op-ink text-[13px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-ln-op-mute" htmlFor="bulk-vax-batch">
            Lote (opcional)
          </label>
          <input
            id="bulk-vax-batch"
            type="text"
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            placeholder="Ej. L-2024-07"
            className="w-full px-3 py-1.5 rounded-[4px] border border-ln-op-line bg-ln-op-card text-ln-op-ink text-[13px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-ln-op-mute" htmlFor="bulk-vax-by">
            Aplicado por (opcional)
          </label>
          <input
            id="bulk-vax-by"
            type="text"
            value={administeredBy}
            onChange={(e) => setAdministeredBy(e.target.value)}
            placeholder="Ej. Dr. Gómez MP 1234"
            className="w-full px-3 py-1.5 rounded-[4px] border border-ln-op-line bg-ln-op-card text-ln-op-ink text-[13px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-ln-op-mute" htmlFor="bulk-vax-next">
            Próxima dosis (opcional)
          </label>
          <input
            id="bulk-vax-next"
            type="date"
            value={nextDueAt}
            onChange={(e) => setNextDueAt(e.target.value)}
            className="w-full px-3 py-1.5 rounded-[4px] border border-ln-op-line bg-ln-op-card text-ln-op-ink text-[13px]"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-3 py-1.5 rounded-[4px] text-[13px] border border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || !canSubmit}
          className="px-3 py-1.5 rounded-[4px] text-[13px] font-medium bg-ln-op-azul text-white hover:bg-ln-op-azul-700 disabled:opacity-50"
        >
          {pending ? "Registrando..." : "Confirmar vacunación"}
        </button>
      </div>
    </div>
  );
}

// ─── BulkEligibilityForm ──────────────────────────────────────────────────────

type EligibilityFields = {
  eligible: boolean;
  ineligibleReason?: (typeof BULK_INELIGIBLE_REASONS)[number] | null;
  ineligibleReasonNotes?: string | null;
  ineligibleUntilIso?: string | null;
};

function BulkEligibilityForm({
  count,
  pending,
  onCancel,
  onSubmit,
}: {
  count: number;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (fields: EligibilityFields) => void;
}) {
  const [eligible, setEligible] = useState<boolean>(true);
  const [ineligibleReason, setIneligibleReason] = useState<
    (typeof BULK_INELIGIBLE_REASONS)[number] | ""
  >("");
  const [ineligibleReasonNotes, setIneligibleReasonNotes] = useState("");
  const [ineligibleUntilIso, setIneligibleUntilIso] = useState("");

  const needsReason = !eligible;
  const needsNotes = ineligibleReason === "other";
  const canSubmit =
    eligible ||
    (ineligibleReason !== "" &&
      (ineligibleReason !== "other" || ineligibleReasonNotes.trim().length > 0));

  function handleSubmit() {
    onSubmit({
      eligible,
      ineligibleReason: eligible
        ? null
        : (ineligibleReason as (typeof BULK_INELIGIBLE_REASONS)[number]) || null,
      ineligibleReasonNotes: eligible ? null : ineligibleReasonNotes.trim() || null,
      ineligibleUntilIso: eligible ? null : ineligibleUntilIso.trim() || null,
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium text-ln-op-ink">
        Marcar elegibilidad — {count} animal{count === 1 ? "" : "es"}
      </p>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-[13px] cursor-pointer text-ln-op-ink">
          <input
            type="radio"
            name="bulk-elig-toggle"
            checked={eligible}
            onChange={() => {
              setEligible(true);
              setIneligibleReason("");
              setIneligibleReasonNotes("");
              setIneligibleUntilIso("");
            }}
            className="accent-ln-op-ok"
          />
          Apta para adopción
        </label>
        <label className="flex items-center gap-2 text-[13px] cursor-pointer text-ln-op-ink">
          <input
            type="radio"
            name="bulk-elig-toggle"
            checked={!eligible}
            onChange={() => setEligible(false)}
            className="accent-ln-op-danger"
          />
          No apta para adopción
        </label>
      </div>

      {needsReason && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-sm text-ln-op-mute" htmlFor="bulk-elig-reason">
              Razón <span className="text-ln-op-danger">*</span>
            </label>
            <select
              id="bulk-elig-reason"
              value={ineligibleReason}
              onChange={(e) =>
                setIneligibleReason(e.target.value as (typeof BULK_INELIGIBLE_REASONS)[number] | "")
              }
              className="w-full px-3 py-1.5 rounded-[4px] border border-ln-op-line bg-ln-op-card text-ln-op-ink text-[13px]"
            >
              <option value="">Seleccioná una razón</option>
              {BULK_INELIGIBLE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {INELIGIBLE_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-ln-op-mute" htmlFor="bulk-elig-until">
              No apta hasta (opcional)
            </label>
            <input
              id="bulk-elig-until"
              type="date"
              value={ineligibleUntilIso}
              onChange={(e) => setIneligibleUntilIso(e.target.value)}
              className="w-full px-3 py-1.5 rounded-[4px] border border-ln-op-line bg-ln-op-card text-ln-op-ink text-[13px]"
            />
          </div>

          {needsNotes && (
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm text-ln-op-mute" htmlFor="bulk-elig-notes">
                Notas <span className="text-ln-op-danger">*</span>
              </label>
              <input
                id="bulk-elig-notes"
                type="text"
                value={ineligibleReasonNotes}
                onChange={(e) => setIneligibleReasonNotes(e.target.value)}
                placeholder="Describí la situación"
                className="w-full px-3 py-1.5 rounded-[4px] border border-ln-op-line bg-ln-op-card text-ln-op-ink text-[13px]"
              />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-3 py-1.5 rounded-[4px] text-[13px] border border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || !canSubmit}
          className="px-3 py-1.5 rounded-[4px] text-[13px] font-medium bg-ln-op-celeste text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Confirmar elegibilidad"}
        </button>
      </div>
    </div>
  );
}

// ─── BulkListingForm ──────────────────────────────────────────────────────────

function BulkListingForm({
  count,
  pending,
  onCancel,
  onSubmit,
}: {
  count: number;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (publish: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium text-ln-op-ink">
        Publicar en adopción — {count} animal{count === 1 ? "" : "es"}
      </p>
      <p className="text-sm text-ln-op-mute">
        Solo se publicarán las mascotas que cumplan todos los requisitos (apta para adopción, sin
        disputas, sin observación sanitaria activa, etc.). Las que no cumplan aparecerán en el
        detalle de fallos con la razón específica.
      </p>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-3 py-1.5 rounded-[4px] text-[13px] border border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSubmit(false)}
          disabled={pending}
          className="px-3 py-1.5 rounded-[4px] text-[13px] border border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe disabled:opacity-50"
        >
          {pending ? "Procesando..." : "Despublicar selección"}
        </button>
        <button
          type="button"
          onClick={() => onSubmit(true)}
          disabled={pending}
          className="px-3 py-1.5 rounded-[4px] text-[13px] font-medium bg-ln-op-ok text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Publicando..." : "Confirmar publicación"}
        </button>
      </div>
    </div>
  );
}

// ─── ResultPanel ──────────────────────────────────────────────────────────────

function ResultPanel({
  result,
  actionType,
  onDismiss,
}: {
  result: BulkResult;
  actionType: "vaccinate" | "eligibility" | "listing-publish" | "listing-unlist";
  onDismiss: () => void;
}) {
  const nounSingular =
    actionType === "vaccinate"
      ? "vacunada"
      : actionType === "listing-publish"
        ? "publicada"
        : actionType === "listing-unlist"
          ? "despublicada"
          : "actualizada";
  const nounPlural =
    actionType === "vaccinate"
      ? "vacunadas"
      : actionType === "listing-publish"
        ? "publicadas"
        : actionType === "listing-unlist"
          ? "despublicadas"
          : "actualizadas";
  const noun = result.succeeded.length === 1 ? nounSingular : nounPlural;

  return (
    <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card p-3 space-y-2 text-[13px]">
      <div className="flex items-baseline justify-between">
        <p className="font-medium text-ln-op-ink">
          {result.succeeded.length} {noun} · {result.failed.length} fallaron
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-sm text-ln-op-mute hover:text-ln-op-ink"
        >
          Cerrar
        </button>
      </div>
      {result.failed.length > 0 && (
        <ul className="text-sm text-ln-op-danger space-y-0.5">
          {result.failed.map((f) => (
            <li key={f.id}>
              <span className="font-mono">{f.id}</span> — {f.reason}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ln-op-mute font-mono">bulk: {result.bulkActionId}</p>
    </div>
  );
}
