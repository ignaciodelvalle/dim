"use client";

// Two-step confirmation button for "Marcar como encontrada".
//
// State machine:
//   idle       → user clicks → confirming
//   confirming → user clicks "Confirmar" → action fires (form submit)
//   confirming → user clicks "Cancelar"  → idle
//
// Using a client component keeps the logic minimal: a single useState
// toggle. The actual server action is still invoked via a plain form
// submit so it participates in the standard Next.js progressive-
// enhancement path.

import { setPetFoundAction } from "@/app/actions/events";
import { useState } from "react";

type State = "idle" | "confirming";

export function MarkFoundButton({ publicToken }: { publicToken: string }) {
  const [state, setState] = useState<State>("idle");

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => setState("confirming")}
        className="px-4 py-2 rounded-lg bg-green-700 dark:bg-green-600 text-white text-sm font-medium hover:bg-green-800 dark:hover:bg-green-700 transition-colors"
      >
        Marcar como encontrada
      </button>
    );
  }

  // confirming state — show confirm / cancel pair
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-neutral-700 dark:text-neutral-300">
        Confirmar que la encontraste?
      </span>
      <form action={setPetFoundAction.bind(null, publicToken)}>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-green-700 dark:bg-green-600 text-white text-sm font-medium hover:bg-green-800 dark:hover:bg-green-700 transition-colors"
        >
          Confirmar
        </button>
      </form>
      <button
        type="button"
        onClick={() => setState("idle")}
        className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}
