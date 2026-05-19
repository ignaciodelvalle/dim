// Embeddable section that surfaces open cases for a pet.
//
// Renders nothing when the pet has no open cases — keeps the host page
// quiet by default. When open cases exist, sits above the libreta and
// each row links to /casos/[publicCode] via CaseBadge.

import { CaseBadge } from "@/components/CaseBadge";
import { findOpenCasesForPetWithCodes } from "@/lib/case-queries";

interface Props {
  petId: string;
}

export async function PetOpenCasesSection({ petId }: Props) {
  const openCases = await findOpenCasesForPetWithCodes(petId);
  if (openCases.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-800 dark:bg-amber-950/40">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Casos abiertos {openCases.length > 1 ? `(${openCases.length})` : ""}
        </h2>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          Procedimientos activos que esta mascota tiene abiertos en MiMAR
        </span>
      </header>
      <ul className="flex flex-wrap gap-2">
        {openCases.map((c) => (
          <li key={c.id}>
            <CaseBadge publicCode={c.publicCode} caseKind={c.caseKind} status={c.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
