"use client";

// FutureLedgerList — renders the PRÓXIMO section of Face 2 (Libreta): active
// reminders, confirmed appointments, and pending medication doses merged and
// sorted ascending by dueAt (see libreta-future.helpers.ts). Each row exposes
// its one action per design: "Marcar dada" (medication), a reschedule link
// (appointment), or "Programar turno" (a due/over rabies reminder).

import { LnLinkButton } from "@/components/ui/LinkButton";
import { useActionRedirect } from "@/lib/ui/use-action-redirect";
import { AR_TIME_ZONE } from "@/lib/utils/format";
import { type EventFormState, markMedicationDoseTakenAction } from "@/src/modules/events/actions";
import Link from "next/link";
import { useActionState } from "react";
import type { FutureLedgerItem } from "./libreta-future.helpers";

const KIND_ICON: Record<FutureLedgerItem["kind"], string> = {
  reminder: "💉",
  appointment: "🏥",
  medication: "💊",
};

function formatDueAt(date: Date): string {
  // timeZone pinned — see AR_TIME_ZONE. This runs during SSR (UTC) and again on
  // hydration (browser zone); without the pin, a due date near midnight flips
  // calendar day between the two renders → React #418.
  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: AR_TIME_ZONE,
  });
}

// MarkDoseForm — "Marcar dada" per medication row. The action returns
// `redirectTo` on success (N3 contract) and the form performs the full
// document navigation; errors render inline under the button.
function MarkDoseForm({ reminderId }: { reminderId: string }) {
  const initialState: EventFormState = { error: null };
  const [state, formAction, isPending] = useActionState(
    markMedicationDoseTakenAction,
    initialState,
  );
  useActionRedirect(state.redirectTo);

  return (
    <form action={formAction}>
      <input type="hidden" name="reminderId" value={reminderId} />
      <button
        type="submit"
        disabled={isPending}
        className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] px-2.5 py-1.5 font-[var(--font-ln-sans)] text-sm font-medium text-[var(--color-ln-azul)] transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {isPending ? "Guardando…" : "Marcar dada"}
      </button>
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-[var(--color-ln-err)]">
          {state.error}
        </p>
      )}
    </form>
  );
}

function FutureLedgerRowAction({
  item,
  petPublicToken,
}: {
  item: FutureLedgerItem;
  petPublicToken: string;
}) {
  if (!item.action) return null;

  if (item.action.type === "mark-dose") {
    return <MarkDoseForm reminderId={item.action.reminderId} />;
  }

  if (item.action.type === "reschedule") {
    return (
      <Link
        href={item.action.href}
        // prefetch=false: same rationale as EventTimeline.tsx's row link —
        // this list also lives inside the always-mounted (possibly
        // off-screen) Libreta face, so eager prefetch of every row's action
        // link is wasted connection-pool pressure that can starve a real
        // in-flight navigation (see EventTimeline.tsx for the full
        // incident writeup).
        prefetch={false}
        className="shrink-0 font-[var(--font-ln-mono)] text-xs uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        Ver turno →
      </Link>
    );
  }

  return (
    <LnLinkButton
      href={`/mis-mascotas/${petPublicToken}?sheet=turno-antirrabica`}
      prefetch={false}
      className="shrink-0"
    >
      Programar turno
    </LnLinkButton>
  );
}

export function FutureLedgerList({
  items,
  petPublicToken,
}: {
  items: FutureLedgerItem[];
  petPublicToken: string;
}) {
  if (items.length === 0) return null;

  return (
    <div data-section="future-ledger">
      <p className="mb-2 font-[var(--font-ln-mono)] text-xs uppercase tracking-[.06em] font-semibold text-[var(--color-ln-mute)]">
        Próximo
      </p>
      <ul className="divide-y divide-[var(--color-ln-line)]">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2.5">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-ln-stripe)] text-sm"
            >
              {KIND_ICON[item.kind]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[var(--color-ln-ink)]">
                {item.label}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--color-ln-mute)]">
                {formatDueAt(item.dueAt)}
              </span>
            </span>
            <FutureLedgerRowAction item={item} petPublicToken={petPublicToken} />
          </li>
        ))}
      </ul>
    </div>
  );
}
