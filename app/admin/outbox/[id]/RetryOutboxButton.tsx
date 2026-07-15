"use client";

// Manual-retry button for a single outbox row (Cowork A1).
//
// The retry action gave zero feedback: it reset next_retry_at/status server-side
// but the page didn't refresh and nothing confirmed the click, so an operator
// re-clicked thinking it had failed. This client island follows the established
// admin action-feedback pattern (ModerationActions / ResetCredentialsButton):
// useTransition to drive the server action, disable the button while pending,
// then show an inline confirmation. router.refresh() pulls the revalidated SSR
// so "Próximo reintento" updates in place without a manual reload.

import { useState, useTransition } from "react";

import { OpButton } from "@/components/ui/dashboard";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";
import { AR_TIME_ZONE } from "@/lib/utils/format";

import { retryOutboxRowAction } from "../actions";

function formatScheduled(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: AR_TIME_ZONE,
  });
  if (sameDay) return `HOY ${time}`;
  const date = d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: AR_TIME_ZONE,
  });
  return `${date} ${time}`;
}

export function RetryOutboxButton({ rowId }: { rowId: string }) {
  const [pending, startTransition] = useTransition();
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await retryOutboxRowAction(rowId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setScheduledAt(result.scheduledAt ?? null);
      // Tier A full-document navigation (router.refresh is fenced, nav
      // burn-down N2): reload the detail so the SSR "Próximo reintento" /
      // "Estado" fields show the new schedule immediately.
      navigateAfterActionSuccess(`/admin/outbox/${rowId}`);
    });
  }

  return (
    <span className="mt-2 block space-y-2">
      <OpButton type="button" variant="primary" onClick={submit} disabled={pending}>
        {pending ? "Programando…" : "Reintentar ahora"}
      </OpButton>
      {scheduledAt && !error && (
        <output className="block text-[var(--text-sm)] font-semibold text-ln-op-ok">
          Reintento programado para {formatScheduled(scheduledAt)}. El cron de drenaje lo procesa en
          el próximo ciclo (máximo 5 min).
        </output>
      )}
      {error && <output className="block text-[var(--text-sm)] text-ln-op-danger">{error}</output>}
    </span>
  );
}
