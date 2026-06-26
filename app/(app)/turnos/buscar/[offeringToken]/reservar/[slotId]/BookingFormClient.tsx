"use client";

// Client wrapper for the slot booking form.
// Surfaces server-action errors (e.g. race-condition "Sin cupo disponible.")
// using useActionState. On success, bookSlotAction redirects server-side.

import { useActionState } from "react";

import { type BookSlotResult, bookSlotAction } from "@/app/actions/booking";
import { LnButton } from "@/components/ui/Button";

type BookingState = { error: string | null };

const initialState: BookingState = { error: null };

// Adapter: useActionState requires (prevState, formData) => state.
// bookSlotAction redirects on success (throws NEXT_REDIRECT) so we only
// reach the return path when there is an error.
function makeFormAction(slotId: string) {
  return async (_prev: BookingState, formData: FormData): Promise<BookingState> => {
    const petId = String(formData.get("petId") ?? "").trim();
    if (!petId) return { error: "Seleccioná una mascota." };
    const result: BookSlotResult = await bookSlotAction(slotId, petId);
    if ("error" in result) return { error: result.error };
    // On success bookSlotAction calls redirect() which throws; we never reach here.
    return { error: null };
  };
}

export function BookingFormClient({
  slotId,
  userPets,
}: {
  slotId: string;
  userPets: Array<{ id: string; name: string; species: string }>;
}) {
  const formAction = makeFormAction(slotId);
  const [state, dispatch, pending] = useActionState(formAction, initialState);

  return (
    <form action={dispatch} className="flex flex-col gap-[16px]">
      <div>
        <label
          htmlFor="pet_select"
          className="mb-[6px] block font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]"
        >
          ¿Para qué mascota?
        </label>
        <select
          id="pet_select"
          name="petId"
          required
          className="w-full appearance-none rounded-[4px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-[12px] py-[10px] font-[var(--font-ln-sans)] text-[13.5px] text-[var(--color-ln-ink)] outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
        >
          <option value="">Elegí una mascota…</option>
          {userPets.map((pet) => (
            <option key={pet.id} value={pet.id}>
              {pet.name}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <p className="text-sm font-medium text-[var(--color-ln-err)]" role="alert">
          {state.error}
        </p>
      )}

      <LnButton type="submit" variant="primary" size="lg" block disabled={pending}>
        {pending ? "Reservando…" : "Confirmar reserva"}
      </LnButton>
    </form>
  );
}
