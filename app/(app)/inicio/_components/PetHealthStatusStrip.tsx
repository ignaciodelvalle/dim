// Per-pet health-status strip for /inicio (Item 5).
//
// Spec: docs/superpowers/specs/2026-06-18-owner-health-status-nudges-design.md
//
// Presentational / dumb: receives already-derived PetHealthStatus[] from the
// server component (lib/owner-nudges.ts) and renders one row per pet — a status
// badge ("Sin pendientes" / "N pendientes") plus its supportive nudges, each a direct
// owner action link. Encouraging, never alarming (spec D4). It surfaces ONLY
// the owner's own derived signals — no surveillance/authority data ever reaches
// this component (umbrella §6).

import Link from "next/link";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import type { Nudge, PetHealthStatus } from "@/lib/infra/owner-nudges";
import { capCount, speciesLabel } from "@/lib/utils/format";

function StatusBadge({ pending }: { pending: number }) {
  const ok = pending === 0;
  const cls = ok
    ? "border-[var(--color-ln-ok)] bg-[var(--color-ln-ok-050)] text-[var(--color-ln-ink)]"
    : "border-[var(--color-ln-warn)] bg-[var(--color-ln-warn-050)] text-[var(--color-ln-ink)]";
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center rounded-full border px-[8px] py-[1px] font-[var(--font-ln-mono)] text-xs uppercase tracking-[.05em] ${cls}`}
    >
      {/* "Sin pendientes", not "Al día" — AL DÍA is a compliance claim owned by
          deriveComplianceState; this badge only says no nudges are pending
          (QA round 2 2026-07-03 #4: three status truths for one pet). */}
      {ok ? "Sin pendientes" : `${pending} pendiente${pending !== 1 ? "s" : ""}`}
    </span>
  );
}

function NudgeRow({ nudge }: { nudge: Nudge }) {
  const dotClass =
    nudge.tone === "attention" ? "bg-[var(--color-ln-warn)]" : "bg-[var(--color-ln-celeste)]";
  return (
    <Link
      href={nudge.actionHref}
      className="-mx-[6px] flex items-center gap-[10px] rounded-[4px] px-[6px] py-[4px] no-underline transition-colors hover:bg-[var(--color-ln-stripe)]"
    >
      <span
        className={`h-[7px] w-[7px] flex-shrink-0 rounded-full ${dotClass}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 text-[12.5px] text-[var(--color-ln-ink)]">{nudge.label}</span>
      <span
        aria-hidden="true"
        className="flex-shrink-0 font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)]"
      >
        →
      </span>
    </Link>
  );
}

function PetStatusRow({ pet }: { pet: PetHealthStatus }) {
  return (
    <div className="flex flex-col gap-[8px] border-b border-[var(--color-ln-line-2)] py-[10px] last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-[10px]">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="min-w-0 truncate text-[13.5px] font-semibold text-[var(--color-ln-ink)] no-underline hover:underline"
        >
          {pet.name}
          <span className="ml-[6px] font-normal text-[var(--color-ln-mute)]">
            {speciesLabel(pet.species)}
          </span>
        </Link>
        <StatusBadge pending={pet.pendingCount} />
      </div>
      {pet.nudges.length > 0 && (
        <div className="flex flex-col gap-[2px]">
          {pet.nudges.map((n) => (
            <NudgeRow key={n.kind} nudge={n} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Owner health-status strip. Renders nothing when the owner has no pets — the
 * /inicio empty state already prompts to register a pet.
 */
export function PetHealthStatusStrip({ pets }: { pets: PetHealthStatus[] }) {
  if (pets.length === 0) return null;

  const pendingTotal = pets.reduce((sum, p) => sum + p.pendingCount, 0);

  return (
    <LnCard aria-labelledby="estado-sanitario-heading">
      <LnCardHead
        title={<span id="estado-sanitario-heading">Estado sanitario</span>}
        // UX 3.5 item 1: cap the aggregate at "99+" so a high-volume owner does
        // not see an alarming raw total (e.g. "1459 PENDIENTES") uppercased by
        // LnCardHead. Per-pet badges stay uncapped — those counts are bounded
        // and actionable. Pluralization still uses the real total.
        label={
          pendingTotal === 0
            ? "sin pendientes"
            : `${capCount(pendingTotal)} pendiente${pendingTotal !== 1 ? "s" : ""}`
        }
      />
      <LnCardBody>
        <div className="flex flex-col">
          {pets.map((pet) => (
            <PetStatusRow key={pet.petId} pet={pet} />
          ))}
        </div>
      </LnCardBody>
    </LnCard>
  );
}
