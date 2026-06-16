// Captura rápida — Libreta Nacional redesign.
// Presentation only; CaptureBox client component unchanged.

import Link from "next/link";

import { buildCaptureDeeplink } from "@/lib/event-capture-registry";
import { requireOwnedPetByToken } from "@/lib/pets";
import { CaptureBox } from "./CaptureBox";
import { ALL_CAPTURE_OPTIONS } from "./handoff";

export default async function CapturePage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ text?: string; kind?: string }>;
}) {
  const { publicToken } = await params;
  const { text, kind } = await searchParams;
  const session = await requireOwnedPetByToken(publicToken);
  const { pet } = session;

  const token = pet.publicToken;
  const today = new Date().toISOString().slice(0, 10);

  // Build all option hrefs once (server-side, no client JS needed for the list).
  const optionsWithHref = ALL_CAPTURE_OPTIONS.map((opt) => {
    let href: string;
    if (opt.routeOverride) {
      href = `/mis-mascotas/${token}${opt.routeOverride}`;
    } else {
      href =
        buildCaptureDeeplink(opt.eventType, token, { occurredAt: today }) ??
        `/mis-mascotas/${token}`;
    }
    return { ...opt, href };
  });

  // Group by category for section rendering.
  const categories = Array.from(new Set(ALL_CAPTURE_OPTIONS.map((o) => o.category)));

  return (
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href={`/mis-mascotas/${token}`}
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← {pet.name}
      </Link>

      {/* Header */}
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Anotar algo de {pet.name}
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Contanos qué pasó. Te llevamos al formulario correcto con los datos que pudimos
          identificar. Si preferís, abajo tenés atajos para los eventos más comunes.
        </p>
      </div>

      <CaptureBox petPublicToken={token} petName={pet.name} initialText={text} initialKind={kind} />

      {/* WP-7: Full discoverability list — all loggable events and owner flows,
          grouped by category, driven by ALL_CAPTURE_OPTIONS + registry so it
          stays in sync automatically. */}
      <div className="mt-[40px] space-y-[28px]">
        <div className="flex items-center gap-3 text-xs text-[var(--color-ln-mute)]">
          <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
          <span>o elegí directamente</span>
          <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
        </div>

        {categories.map((category) => {
          const items = optionsWithHref.filter((o) => o.category === category);
          return (
            <section key={category}>
              <h2 className="mb-[8px] font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
                {category}
              </h2>
              <ul className="divide-y divide-[var(--color-ln-stripe)] rounded-[4px] border border-[var(--color-ln-line-strong)] overflow-hidden">
                {items.map((opt) => (
                  <li key={`${opt.eventType}-${opt.routeOverride ?? ""}`}>
                    <Link
                      href={opt.href}
                      className="flex items-center justify-between px-[14px] py-[10px] text-[13px] text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)] transition-colors"
                    >
                      <span>{opt.label}</span>
                      <span className="text-[var(--color-ln-mute)] text-[11px]">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
