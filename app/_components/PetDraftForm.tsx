"use client";

// Inline "create your pet" mini-form on the public landing (app/page.tsx).
//
// The visitor types name + species + breed; we persist to localStorage under
// PET_DRAFT_KEY and navigate to /signup. SignupForm reads the same key on
// mount and pre-fills its step-2 PetForm so the visitor doesn't retype.
//
// Why localStorage and not anonymous Supabase auth: we don't want junk pets
// in the DB from tire-kickers, and we don't want the plumbing of linking
// anon identities. Photo is intentionally NOT collected here — Files don't
// serialize, and the signup step-2 PetForm already asks for it.
//
// Schema is versioned (`v: 1`) so future drafts can be migrated or ignored
// without crashing reads.

import { breedsForSpecies } from "@/lib/breeds";
import { inputClass, labelClass } from "@/lib/form-classes";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export const PET_DRAFT_KEY = "mimar_pet_draft_v1";

export type PetDraft = {
  v: 1;
  name: string;
  // Resolved species value (matches pets.species). Empty string means
  // "other / not specified" — the visitor will pick the sub-species on
  // signup step 2.
  species: "dog" | "cat" | "" | "other";
  breed: string;
  savedAt: string; // ISO
};

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export function readPetDraft(): PetDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PET_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PetDraft>;
    if (parsed?.v !== 1) return null;
    if (typeof parsed.name !== "string") return null;
    const savedAtIso = typeof parsed.savedAt === "string" ? parsed.savedAt : null;
    if (savedAtIso) {
      const age = Date.now() - new Date(savedAtIso).getTime();
      if (Number.isFinite(age) && age > STALE_AFTER_MS) {
        try {
          window.localStorage.removeItem(PET_DRAFT_KEY);
        } catch {}
        return null;
      }
    }
    return {
      v: 1,
      name: parsed.name,
      species: (parsed.species ?? "") as PetDraft["species"],
      breed: typeof parsed.breed === "string" ? parsed.breed : "",
      savedAt: savedAtIso ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearPetDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PET_DRAFT_KEY);
  } catch {
    // ignore — localStorage may be unavailable in private mode
  }
}

export function PetDraftForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [speciesGroup, setSpeciesGroup] = useState<"" | "dog" | "cat" | "other">("");
  const [breed, setBreed] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Rehydrate from localStorage on mount so a visitor who came back later
  // doesn't lose what they typed.
  useEffect(() => {
    const draft = readPetDraft();
    if (!draft) return;
    setName(draft.name);
    if (draft.species === "dog" || draft.species === "cat") {
      setSpeciesGroup(draft.species);
    } else if (draft.species === "other") {
      setSpeciesGroup("other");
    }
    setBreed(draft.breed);
  }, []);

  // Persist on every change. Debouncing would be overkill — payload is tiny
  // and the form is short-lived.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!name && !speciesGroup && !breed) return;
    const draft: PetDraft = {
      v: 1,
      name,
      species: speciesGroup === "other" ? "other" : speciesGroup,
      breed,
      savedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(PET_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, [name, speciesGroup, breed]);

  const breedOptions = useMemo(() => {
    if (speciesGroup === "dog" || speciesGroup === "cat") return breedsForSpecies(speciesGroup);
    return [];
  }, [speciesGroup]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !speciesGroup) return;
    setSubmitting(true);
    // The draft is already in localStorage thanks to the persist effect;
    // we just navigate. SignupForm picks it up from there.
    router.push("/signup");
  }

  const canSubmit = !!name.trim() && !!speciesGroup && !submitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="draft-name" className={labelClass}>
          ¿Cómo se llama tu mascota?
        </label>
        <input
          id="draft-name"
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          required
          placeholder="Firulais"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="draft-species" className={labelClass}>
          Especie
        </label>
        <select
          id="draft-species"
          value={speciesGroup}
          onChange={(e) => {
            const next = e.target.value as "" | "dog" | "cat" | "other";
            setSpeciesGroup(next);
            setBreed("");
          }}
          required
          className={inputClass}
        >
          <option value="">Elegí una</option>
          <option value="dog">Perro</option>
          <option value="cat">Gato</option>
          <option value="other">Otra</option>
        </select>
      </div>

      {(speciesGroup === "dog" || speciesGroup === "cat") && (
        <div className="space-y-1.5">
          <label htmlFor="draft-breed" className={labelClass}>
            Raza <span className="text-xs text-neutral-500">(opcional)</span>
          </label>
          <input
            id="draft-breed"
            name="breed"
            type="text"
            list="draft-breed-options"
            value={breed}
            onChange={(e) => setBreed(e.target.value)}
            placeholder="Empezá a tipear o elegí…"
            className={inputClass}
          />
          <datalist id="draft-breed-options">
            {breedOptions.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full px-4 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Llevándote a crear cuenta…" : "Crear cuenta gratis y guardar"}
      </button>

      <p className="text-xs text-neutral-500 dark:text-neutral-500 text-center">
        Te llevamos a registrarte; ya completaremos lo demás (foto, peso, etc.) en el siguiente
        paso.
      </p>
    </form>
  );
}
