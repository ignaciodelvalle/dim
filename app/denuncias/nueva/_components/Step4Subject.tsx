"use client";

// Step 4 — Sobre quién (opcional pero recomendado).
// Two main cards: "Una mascota" / "Animal sin dueño / no lo sé".
// Tertiary option: "Edificio / persona / lugar" → subjectKind='location'.
//
// Chip / token lookup vivo (handoff P4-2a): debounced call to
// lookupPetForDenunciaAction. On match shows a small preview "Esta
// mascota está registrada como {nombre} ({estado}). Dueño:
// {iniciales}." — non-leaky projection from the public action.

import { useEffect, useState, useTransition } from "react";

import {
  type PublicLookupResult,
  lookupPetForDenunciaAction,
} from "@/app/actions/pet-lookup-public";
import { Input, Textarea } from "@/components/poncho";

const LOOKUP_DEBOUNCE_MS = 300;
const LOOKUP_MIN_LEN = 8;

export type SubjectKindWizard = "registered_pet" | "unowned_animal" | "location";

const SUBJECT_CARDS = [
  {
    value: "registered_pet" as SubjectKindWizard,
    label: "Una mascota",
    description: "El animal tiene o puede tener dueño",
    icon: "🐾",
  },
  {
    value: "unowned_animal" as SubjectKindWizard,
    label: "Animal sin dueño / no lo sé",
    description: "Callejero, abandonado, o no sé si tiene dueño",
    icon: "🐕",
  },
];

type Step4SubjectProps = {
  subjectKind: SubjectKindWizard | null;
  subjectPetToken: string;
  subjectDescription: string;
  onSubjectKindChange: (kind: SubjectKindWizard) => void;
  onSubjectPetTokenChange: (token: string) => void;
  onSubjectDescriptionChange: (desc: string) => void;
  error?: string | null;
};

export function Step4Subject({
  subjectKind,
  subjectPetToken,
  subjectDescription,
  onSubjectKindChange,
  onSubjectPetTokenChange,
  onSubjectDescriptionChange,
  error,
}: Step4SubjectProps) {
  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gob-text">¿Sobre quién?</h1>
        <p className="text-sm text-gob-text-muted">Opcional — nos ayuda a actuar más rápido.</p>
      </div>

      {/* Main two cards */}
      <ul className="space-y-2">
        {SUBJECT_CARDS.map((card) => {
          const isSelected = subjectKind === card.value;
          return (
            <li key={card.value}>
              <label
                className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 cursor-pointer transition-colors ${
                  isSelected
                    ? "border-gob-primary bg-gob-surface-alt"
                    : "border-gob-border hover:border-gob-border-strong"
                }`}
              >
                {/* Visually hidden radio — semantics carried by the label */}
                <input
                  type="radio"
                  name="subjectKindCard"
                  value={card.value}
                  checked={isSelected}
                  onChange={() => onSubjectKindChange(card.value)}
                  className="sr-only"
                />
                <span className="text-2xl leading-none flex-shrink-0 mt-0.5" aria-hidden="true">
                  {card.icon}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gob-text">{card.label}</span>
                  <span className="block text-xs text-gob-text-muted mt-0.5">
                    {card.description}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {/* Tertiary: location / building */}
      <button
        type="button"
        onClick={() => onSubjectKindChange("location")}
        className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors ${
          subjectKind === "location"
            ? "border-gob-primary bg-gob-surface-alt font-medium text-gob-text"
            : "border-dashed border-gob-border-strong text-gob-text-muted hover:border-gob-border-strong"
        }`}
      >
        🏢 Edificio / persona / lugar específico
      </button>

      {/* Conditional fields */}
      {subjectKind === "registered_pet" && (
        <div className="space-y-3 rounded-xl border border-gob-border p-4">
          <div className="space-y-1.5">
            <label htmlFor="subjectPetToken" className="block text-sm font-medium text-gob-text">
              Código MiMAR o microchip (opcional)
            </label>
            <Input
              id="subjectPetToken"
              name="subjectPetToken"
              type="text"
              placeholder="Ej: DIM-XXXX-XXXX o 15 dígitos del chip"
              value={subjectPetToken}
              onChange={(e) => onSubjectPetTokenChange(e.target.value)}
              className="font-mono uppercase"
              autoCapitalize="characters"
            />
            <p className="text-xs text-gob-text-muted">
              Si no lo sabés, no es obligatorio. Dejalo vacío.
            </p>
            <PetLookupPreview query={subjectPetToken} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="subjectDescription" className="block text-sm font-medium text-gob-text">
              Descripción del animal
            </label>
            <Textarea
              id="subjectDescription"
              name="subjectDescription"
              rows={3}
              placeholder="Especie, color, tamaño, señas particulares…"
              value={subjectDescription}
              onChange={(e) => onSubjectDescriptionChange(e.target.value)}
            />
          </div>
        </div>
      )}

      {subjectKind === "unowned_animal" && (
        <div className="space-y-1.5">
          <label htmlFor="subjectDescription" className="block text-sm font-medium text-gob-text">
            Describí al animal
          </label>
          <Textarea
            id="subjectDescription"
            name="subjectDescription"
            rows={3}
            placeholder="Especie, color, tamaño, señas particulares…"
            value={subjectDescription}
            onChange={(e) => onSubjectDescriptionChange(e.target.value)}
          />
        </div>
      )}

      {subjectKind === "location" && (
        <div className="space-y-1.5">
          <label htmlFor="subjectDescription" className="block text-sm font-medium text-gob-text">
            Describí el lugar o situación
          </label>
          <Textarea
            id="subjectDescription"
            name="subjectDescription"
            rows={3}
            placeholder="Dirección, edificio, características…"
            value={subjectDescription}
            onChange={(e) => onSubjectDescriptionChange(e.target.value)}
          />
        </div>
      )}

      {error && (
        <p
          className="text-sm text-gob-danger rounded-lg bg-gob-danger/10 border border-gob-danger/30 px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}

      <p className="text-xs text-gob-text-muted text-center">
        Podés saltear este paso. Tus datos anteriores ya son suficientes.
      </p>
    </section>
  );
}

// Debounced lookup against lookupPetForDenunciaAction. Renders a small
// preview chip when the query matches a registered pet; silent on misses
// (no "not found" copy — that's noisy when the user is mid-typing).
function PetLookupPreview({ query }: { query: string }) {
  const [result, setResult] = useState<PublicLookupResult | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < LOOKUP_MIN_LEN) {
      setResult(null);
      return;
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const r = await lookupPetForDenunciaAction(trimmed);
        setResult(r);
      });
    }, LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  if (pending) {
    return <p className="text-xs text-gob-text-muted">Buscando…</p>;
  }
  if (!result || !result.found) return null;

  const statusLabel =
    result.petStatus === "lost"
      ? "perdida"
      : result.petStatus === "deceased"
        ? "fallecida"
        : "activa";

  return (
    <div className="rounded-lg border border-gob-success/40 bg-gob-success/5 px-3 py-2 text-xs text-gob-text">
      <p>
        ✓ Esta mascota está registrada como <span className="font-semibold">{result.petName}</span>{" "}
        <span className="text-gob-text-muted">({statusLabel})</span>
        {result.ownerInitials && (
          <>
            . Dueño: <span className="font-mono">{result.ownerInitials}</span>
          </>
        )}
      </p>
    </div>
  );
}
