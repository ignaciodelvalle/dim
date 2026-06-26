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
import { LnInput, LnTextarea } from "@/components/ui/Field";

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
        <h1
          className="text-2xl font-semibold tracking-tight text-[var(--color-ln-ink)]"
          style={{ fontFamily: "var(--font-ln-serif)" }}
        >
          ¿Sobre quién?
        </h1>
        <p className="text-sm text-[var(--color-ln-mute)]">
          Esto es opcional, pero ayuda a la investigación. Si no sabés, podés saltearlo.
        </p>
      </div>

      {/* Main two cards */}
      <ul className="space-y-2">
        {SUBJECT_CARDS.map((card) => {
          const isSelected = subjectKind === card.value;
          return (
            <li key={card.value}>
              <label
                className={`flex items-center gap-3 rounded-[6px] border px-4 py-3.5 cursor-pointer transition-colors ${
                  isSelected
                    ? "border-[var(--color-ln-azul)] bg-[var(--color-ln-celeste-050)] shadow-[inset_0_0_0_1px_var(--color-ln-azul)]"
                    : "border-[var(--color-ln-line)] bg-[var(--color-ln-card)] hover:border-[var(--color-ln-line-strong)]"
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
                <span
                  className="text-xl leading-none flex-shrink-0 w-6 text-center"
                  aria-hidden="true"
                >
                  {card.icon}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-[var(--color-ln-ink)]">
                    {card.label}
                  </span>
                  <span className="block text-xs text-[var(--color-ln-mute)] mt-0.5">
                    {card.description}
                  </span>
                </span>
                <span
                  className={`flex-shrink-0 w-[18px] h-[18px] rounded-full border-2 ml-auto ${
                    isSelected
                      ? "border-[var(--color-ln-azul)] bg-[var(--color-ln-azul)] shadow-[inset_0_0_0_3px_white]"
                      : "border-[var(--color-ln-line-strong)]"
                  }`}
                  aria-hidden="true"
                />
              </label>
            </li>
          );
        })}
      </ul>

      {/* Tertiary: location / building */}
      <button
        type="button"
        onClick={() => onSubjectKindChange("location")}
        className={`w-full text-left rounded-[6px] border px-4 py-3 text-sm transition-colors ${
          subjectKind === "location"
            ? "border-[var(--color-ln-azul)] bg-[var(--color-ln-celeste-050)] shadow-[inset_0_0_0_1px_var(--color-ln-azul)] font-semibold text-[var(--color-ln-ink)]"
            : "border-dashed border-[var(--color-ln-line-strong)] text-[var(--color-ln-mute)] hover:border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)]"
        }`}
      >
        🏢 Edificio / persona / lugar específico
      </button>

      {/* Conditional fields */}
      {subjectKind === "registered_pet" && (
        <div className="space-y-3 rounded-[6px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] p-4">
          <div className="space-y-1.5">
            <label
              htmlFor="subjectPetToken"
              className="block text-xs font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)]"
              style={{ fontFamily: "var(--font-ln-mono)" }}
            >
              Código MiMAR o microchip{" "}
              <span className="text-[var(--color-ln-faint)] normal-case tracking-normal font-normal">
                (opcional)
              </span>
            </label>
            <LnInput
              id="subjectPetToken"
              name="subjectPetToken"
              type="text"
              placeholder="Ej: DIM-XXXX-XXXX o 15 dígitos del chip"
              value={subjectPetToken}
              onChange={(e) => onSubjectPetTokenChange(e.target.value)}
              className="font-mono uppercase"
              autoCapitalize="characters"
            />
            <p className="text-xs text-[var(--color-ln-mute)]">
              Si no lo sabés, no es obligatorio. Dejalo vacío.
            </p>
            <PetLookupPreview query={subjectPetToken} />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="subjectDescription"
              className="block text-xs font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)]"
              style={{ fontFamily: "var(--font-ln-mono)" }}
            >
              Descripción del animal
            </label>
            <LnTextarea
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
          <label
            htmlFor="subjectDescription"
            className="block text-xs font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)]"
            style={{ fontFamily: "var(--font-ln-mono)" }}
          >
            Describí al animal
          </label>
          <LnTextarea
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
          <label
            htmlFor="subjectDescription"
            className="block text-xs font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)]"
            style={{ fontFamily: "var(--font-ln-mono)" }}
          >
            Describí el lugar o situación
          </label>
          <LnTextarea
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
          className="text-sm text-[var(--color-ln-seal)] rounded-[4px] bg-[var(--color-ln-err-050)] border border-[var(--color-ln-err-100)] px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}

      <p className="text-xs text-[var(--color-ln-mute)] text-center">
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
    return <p className="text-xs text-[var(--color-ln-mute)]">Buscando…</p>;
  }
  if (!result || !result.found) return null;

  const statusLabel =
    result.petStatus === "lost"
      ? "perdida"
      : result.petStatus === "deceased"
        ? "fallecida"
        : "activa";

  return (
    <div className="rounded-[4px] border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] px-3 py-2 text-xs text-[var(--color-ln-ink)]">
      <p>
        ✓ Esta mascota está registrada como <span className="font-semibold">{result.petName}</span>{" "}
        <span className="text-[var(--color-ln-mute)]">({statusLabel})</span>
        {result.ownerInitials && (
          <>
            . Dueño:{" "}
            <span style={{ fontFamily: "var(--font-ln-mono)" }}>{result.ownerInitials}</span>
          </>
        )}
      </p>
    </div>
  );
}
