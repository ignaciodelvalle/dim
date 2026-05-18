import Link from "next/link";

import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { fetchLostPets } from "@/lib/govt-dashboards";

import { LostFiltersBar } from "./_components/LostFiltersBar";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatRelative(date: Date | null): string {
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / DAY_MS);
  if (days <= 0) {
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    return hours <= 0 ? "hace minutos" : `hace ${hours} h`;
  }
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
}

export default async function GobPerdidasPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; species?: string }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const sp = await searchParams;
  const days = Math.max(1, Math.min(365, Number(sp.days ?? 30) || 30));
  const since = new Date(Date.now() - days * DAY_MS);
  const species = sp.species ? sp.species : null;

  const lost = await fetchLostPets({ role: profile.role }, jurisdictions, {
    since,
    species: species ?? undefined,
  });

  const noScope = profile.role === "govt" && jurisdictions.length === 0;

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Pérdidas
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Mascotas marcadas como perdidas dentro de tu cobertura.
          </p>
        </header>

        {noScope && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            Tu cuenta no tiene localidades asignadas. Pedí a un administrador que te asigne al menos
            una.
          </div>
        )}

        <LostFiltersBar days={days} species={species} />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Resultados ({lost.length})
          </h2>
          {lost.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No hay mascotas perdidas en este período.
            </p>
          ) : (
            <ul className="space-y-2">
              {lost.map((p) => (
                <li
                  key={p.petId}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {p.petName}{" "}
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          · {p.species}
                        </span>
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {p.locality ?? "—"}, {p.province ?? "—"}
                      </p>
                      {p.ownerDisplayName && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          Dueño/a: {p.ownerDisplayName}
                        </p>
                      )}
                      {p.lastSeenLat != null && p.lastSeenLng != null && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          Última ubicación:{" "}
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${p.lastSeenLat}&mlon=${p.lastSeenLng}#map=16/${p.lastSeenLat}/${p.lastSeenLng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-50"
                          >
                            {p.lastSeenLat.toFixed(4)}, {p.lastSeenLng.toFixed(4)}
                          </a>
                        </p>
                      )}
                    </div>
                    <div className="text-right space-y-1 whitespace-nowrap">
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                        {formatRelative(p.markedLostAt)}
                      </p>
                      <Link
                        href={`/p/${p.petPublicToken}`}
                        className="inline-block text-xs underline underline-offset-2 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
                      >
                        Ver credencial
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
