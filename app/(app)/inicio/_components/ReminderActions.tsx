"use client";

// ReminderActions — Posponer + Agendar + Registrar buttons (handoff P4-4).
//
// Client island wrapping the server actions. "Posponer" calls
// snoozeReminderAction with optimistic UI (the reminder hides
// immediately; if the action fails it reappears via router.refresh).
// "Agendar" navigates to /turnos/buscar with prefilters so the user
// books a real appointment for the vaccine. "Registrar" keeps the
// existing in-place capture flow via the vacuna sheet.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { snoozeReminderAction } from "@/app/actions/reminders";

interface Props {
  reminderId: string;
  petToken: string;
  title: string;
  /** Visual variant — controls primary button styling. */
  variant: "banner" | "row";
}

export function ReminderActions({ reminderId, petToken, title, variant }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerHref = `/mis-mascotas/${petToken}?sheet=vacuna&text=${encodeURIComponent(title)}`;
  const scheduleHref = `/turnos/buscar?pet=${petToken}&service=vaccine`;

  if (hidden) return null;

  function postpone() {
    setError(null);
    // Optimistic hide — the reminder fades from the section immediately.
    // If the server fails, surface the error and re-show.
    setHidden(true);
    startTransition(async () => {
      const result = await snoozeReminderAction(reminderId);
      if ("error" in result && result.error) {
        setHidden(false);
        setError(result.error);
        return;
      }
      // Refresh server data so the next render reflects the new snoozed_until.
      router.refresh();
    });
  }

  const buttonBase =
    "inline-flex shrink-0 items-center justify-center rounded-full text-xs font-semibold";

  return (
    <div className={variant === "banner" ? "flex flex-wrap items-center gap-2" : "flex gap-1.5"}>
      <a
        href={scheduleHref}
        className={`${buttonBase} px-3 py-1.5 border border-gob-border text-gob-text hover:bg-gob-surface-alt`}
      >
        Agendar
      </a>
      <button
        type="button"
        onClick={postpone}
        disabled={pending}
        className={`${buttonBase} px-3 py-1.5 text-gob-text-muted hover:text-gob-text disabled:opacity-50`}
      >
        {pending ? "Posponiendo…" : "Posponer 7 días"}
      </button>
      <a
        href={registerHref}
        className={`${buttonBase} ${
          variant === "banner" ? "px-5 py-2 text-sm" : "px-3 py-1.5"
        } bg-gob-primary text-white hover:bg-gob-primary-hover`}
      >
        Registrar
      </a>
      {error && (
        <span className="text-xs text-gob-danger ml-2" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
