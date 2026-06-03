"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

// EventCatcher v3 — the home-screen entry point for logging a pet event.
//
// Changes from v2 (per design critique 2026-05-20):
//   - Avatars went from 26px → 72px. Pets are the most identifying element
//     on the home, hide them at thumbnail size betrays the product.
//   - Behavior split: first tap selects, second tap on the SAME pet opens
//     the profile (`/mis-mascotas/{token}`). Long-press (~550ms) also opens.
//     A small "↗ Abrir perfil" hint fades in on the selected chip so the
//     affordance is discoverable.
//   - Submit button uses the Poncho `success` variant (single primary
//     affirmative per page, per gob.ar Poncho rules). Argentine green.
//   - "Mis mascotas" list moved off the home; the pet picker IS the pet
//     list now. Use the second-tap to navigate to the full profile.
//
// The free-text → parsed event matcher has moved to a server action
// (`app/actions/quick-capture.ts`). EventCatcher calls it on submit and
// navigates directly to the resolved form URL. When no pattern matches,
// it falls back to `/anotar?text=...` so the CaptureBox page can surface
// the "no reconocemos eso" UI. Kind-based quick chips still use
// buildAnotarUrl → /anotar?kind=... (no text parsing needed).

import { quickCaptureAction } from "@/app/actions/quick-capture";
import { Button } from "@/components/poncho";
import type { EventType } from "@/db/schema";

/**
 * Pet state used to drive the avatar frame color in the chip row.
 *
 * Derived (not stored). The derivation precedence is:
 *   urgent    > attention > info > ok
 *
 * Mapping in v3:
 *   - urgent    — `status === "lost"`, active rabies observation,
 *                 or the pet is the subject of an open welfare denuncia.
 *   - attention — overdue vaccine / deworming reminder,
 *                 active custody dispute, observation day pending.
 *   - info      — in an adoption process (listed, application in flight)
 *                 or a foster placement.
 *   - ok        — no derivable signal. Neutral gray ring.
 *
 * Computed in `lib/owner-dashboard.ts` (see `fetchPetsForOwner`) so the
 * component stays purely presentational.
 */
export type PetState = "ok" | "info" | "attention" | "urgent";

export type EventCatcherPet = {
  id: string;
  name: string;
  publicToken: string;
  photoUrl: string | null;
  status: "active" | "lost" | "deceased";
  /** Derived state — drives the avatar ring color. Default "ok". */
  state?: PetState;
  /** Short caption below the name (e.g. "Vacuna vence", "Obs día 4/10"). */
  stateLabel?: string;
};

const PET_STATE_RING: Record<PetState, string> = {
  ok: "ring-gob-border",
  info: "ring-gob-info",
  attention: "ring-gob-warning",
  urgent: "ring-gob-danger",
};

const PET_STATE_LABEL: Record<PetState, string> = {
  ok: "text-gob-text-muted",
  info: "text-gob-info",
  attention: "text-gob-warning-text",
  urgent: "text-gob-danger",
};

const QUICK_LABELS: Partial<Record<EventType, string>> = {
  vaccination_administered: "Vacuna",
  weight_recorded: "Peso",
  vet_visit_logged: "Vet",
  medication_started: "Medicación",
  note_added: "Nota",
};

const QUICK_KINDS = Object.keys(QUICK_LABELS) as EventType[];

// Re-export so existing callers (tests, etc.) keep working. Definition lives
// in app/(app)/mis-mascotas/[publicToken]/anotar/handoff.ts (JSX-free).
import { buildAnotarUrl } from "@/app/(app)/mis-mascotas/[publicToken]/anotar/handoff";
export { buildAnotarUrl };

const DOUBLE_TAP_MS = 600;
const LONG_PRESS_MS = 550;

export function EventCatcher({ pets }: { pets: EventCatcherPet[] }) {
  const router = useRouter();
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const visiblePets = pets.filter((p) => p.status !== "deceased").slice(0, 8);
  const [activeId, setActiveId] = useState<string | undefined>(visiblePets[0]?.id);
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const lastTapRef = useRef<{ id: string; at: number }>({ id: "", at: 0 });

  const active = visiblePets.find((p) => p.id === activeId);

  if (visiblePets.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-gob-border-strong p-6 text-center text-sm text-gob-text-muted">
        <p className="mb-3">Todavía no cargaste ninguna mascota.</p>
        <a
          href="/mis-mascotas/nueva"
          className="inline-block rounded-full bg-gob-primary px-5 py-2 text-sm font-semibold text-white hover:bg-gob-primary-hover"
        >
          Agregar mi primera mascota
        </a>
      </section>
    );
  }

  function go(href: string) {
    router.push(href);
  }

  function onSelect(id: string) {
    const now = Date.now();
    const isAlreadyActive = id === activeId;
    const recent = now - lastTapRef.current.at < DOUBLE_TAP_MS && lastTapRef.current.id === id;
    if (isAlreadyActive && recent) {
      const pet = visiblePets.find((p) => p.id === id);
      if (pet) go(`/mis-mascotas/${pet.publicToken}`);
      return;
    }
    setActiveId(id);
    lastTapRef.current = { id, at: now };
    taRef.current?.focus();
  }

  function onLongPress(id: string) {
    const pet = visiblePets.find((p) => p.id === id);
    if (pet) go(`/mis-mascotas/${pet.publicToken}`);
  }

  function onSubmit() {
    if (!active || text.trim().length < 3) return;
    const token = active.publicToken;
    const trimmed = text.trim();
    startTransition(async () => {
      const { url } = await quickCaptureAction(token, trimmed);
      // If the action matched a pattern, go straight to the form. Otherwise
      // fall back to /anotar?text=... so CaptureBox can surface the
      // "no reconocemos eso" UI — identical to the previous behavior.
      go(url ?? `/mis-mascotas/${token}/anotar?text=${encodeURIComponent(trimmed)}`);
    });
  }

  function onQuick(kind: EventType) {
    if (!active) return;
    go(buildAnotarUrl(active.publicToken, { kind, text: text.trim() || undefined }));
  }

  return (
    <section className="rounded-2xl border border-gob-border bg-white p-4">
      <h2 className="sr-only">Anotar un evento</h2>

      <PetChipRow
        pets={visiblePets}
        activeId={activeId}
        onSelect={onSelect}
        onLongPress={onLongPress}
      />

      {/* Active-pet line (Chunk H PR2). Persistent signal — the placeholder
          disappears as soon as the user starts typing. */}
      {active && (
        <p className="mb-2 text-xs text-gob-text-muted">
          Anotando para <span className="font-medium text-gob-text">{active.name}</span>
        </p>
      )}

      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onSubmit();
        }}
        placeholder={active ? `${active.name} — ¿qué pasó?` : "Describí el evento"}
        rows={3}
        className="w-full resize-y rounded-xl border border-gob-border bg-white p-3 text-sm text-gob-text outline-none focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30"
        aria-label="Describí el evento"
      />

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {/* Quick-action chips — square corners (Chunk H PR2) to differentiate
            from the round pet chips (radio semantic). Bigger touch target
            (Chunk H PR3): py-2 + text-sm clears 38px. Disabled style uses
            neutral background instead of opacity to maintain WCAG AA contrast. */}
        {QUICK_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onQuick(k)}
            disabled={!active || isPending}
            className="rounded-md border border-gob-border bg-white px-3 py-2 text-sm font-medium text-gob-text-gray transition-colors hover:bg-gob-surface-alt disabled:bg-gob-surface-alt disabled:text-gob-text-muted"
          >
            {QUICK_LABELS[k]}
          </button>
        ))}
        <div className="ml-auto" />
        <Button
          variant="success"
          size="md"
          onClick={onSubmit}
          disabled={!active || text.trim().length < 3 || isPending}
        >
          {isPending ? "Abriendo…" : "Anotar"}
        </Button>
      </div>

      {/* Mobile-aware tip (Chunk H PR3): hidden on touch-only devices that
          have no Ctrl key. The @media(hover:hover) query matches devices
          with a precise pointer (mouse / trackpad). */}
      <p className="mt-2 hidden text-[11px] text-gob-text-muted [@media(hover:hover)]:block">
        Tap dos veces en una mascota para abrir su perfil · Ctrl + Enter para anotar.
      </p>
    </section>
  );
}

function PetChipRow({
  pets,
  activeId,
  onSelect,
  onLongPress,
}: {
  pets: EventCatcherPet[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onLongPress: (id: string) => void;
}) {
  // PR3: ref map for roving tabindex — focus the newly-active chip after
  // arrow-key navigation. Each chip registers its button via ref.
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  function onChipRowKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const idx = pets.findIndex((p) => p.id === activeId);
    if (idx === -1 || pets.length === 0) return;
    const next =
      e.key === "ArrowRight" ? (idx + 1) % pets.length : (idx - 1 + pets.length) % pets.length;
    const nextPet = pets[next];
    onSelect(nextPet.id);
    chipRefs.current.get(nextPet.id)?.focus();
  }

  return (
    <ul
      role="radiogroup"
      aria-label="Mascota"
      onKeyDown={onChipRowKey}
      className="mb-4 flex gap-3 overflow-x-auto pb-2 pt-1"
      style={{ scrollSnapType: "x mandatory" }}
    >
      {pets.map((p) => (
        <PetChip
          key={p.id}
          pet={p}
          active={p.id === activeId}
          onSelect={() => onSelect(p.id)}
          onLongPress={() => onLongPress(p.id)}
          buttonRef={(el) => {
            if (el) chipRefs.current.set(p.id, el);
            else chipRefs.current.delete(p.id);
          }}
        />
      ))}
    </ul>
  );
}

function PetChip({
  pet,
  active,
  onSelect,
  onLongPress,
  buttonRef,
}: {
  pet: EventCatcherPet;
  active: boolean;
  onSelect: () => void;
  onLongPress: () => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startPress() {
    pressTimer.current = setTimeout(onLongPress, LONG_PRESS_MS);
  }
  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  return (
    <li className="shrink-0" style={{ scrollSnapAlign: "start" }}>
      <button
        ref={buttonRef}
        type="button"
        aria-pressed={active}
        tabIndex={active ? 0 : -1}
        onClick={onSelect}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => {
          e.preventDefault();
          onLongPress();
        }}
        aria-label={pet.stateLabel ? `${pet.name}, ${pet.stateLabel}` : pet.name}
        className={`flex w-24 flex-col items-center gap-1.5 rounded-2xl p-2 transition-colors active:scale-[0.97] ${
          active ? "bg-gob-info/10" : "bg-transparent hover:bg-gob-surface-alt"
        }`}
      >
        <span
          className={`relative flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full ring-[3px] transition-shadow ${PET_STATE_RING[pet.state ?? "ok"]}`}
        >
          {pet.photoUrl ? (
            <img src={pet.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-gob-surface-alt text-2xl font-semibold text-gob-text-gray">
              {pet.name.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <span className="text-[13px] font-medium leading-tight text-gob-text">{pet.name}</span>
        {pet.stateLabel ? (
          <span
            className={`text-[10px] font-medium leading-tight ${PET_STATE_LABEL[pet.state ?? "ok"]}`}
          >
            {pet.stateLabel}
          </span>
        ) : (
          <span
            aria-hidden
            className={`text-[10px] font-medium leading-tight text-gob-info transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
          >
            ↗ Abrir perfil
          </span>
        )}
      </button>
    </li>
  );
}
