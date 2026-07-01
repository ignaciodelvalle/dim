import Link from "next/link";

import { CasesWidget, adaptWorkflow } from "@/components/CasesWidget";
import { fetchOpenWorkflows, fetchPreviousWorkflows } from "@/lib/analytics/owner-dashboard";
import { requireUserOrRedirect } from "@/lib/auth-guards";

// Full cases history — the destination for the home "Ver historial →" link.
// Shows the owner's open cases plus the closed/past ones (resolved across all
// domains via fetchPreviousWorkflows).

export default async function CasosPage() {
  const { user } = await requireUserOrRedirect();
  const [open, previous] = await Promise.all([
    fetchOpenWorkflows(user.id),
    fetchPreviousWorkflows(user.id, 50),
  ]);
  const openRows = open.map(adaptWorkflow);
  const pastRows = previous.map(adaptWorkflow);

  return (
    <div className="mx-auto max-w-4xl px-[32px] py-[28px] pb-[48px]">
      <div className="mb-[24px]">
        <Link
          href="/inicio"
          className="text-[13px] text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          ← Volver al inicio
        </Link>
        <h1 className="m-0 mt-[8px] font-[var(--font-ln-serif)] text-[34px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Mis casos
        </h1>
        <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
          Todos tus casos: los abiertos y el historial de cerrados y pasados.
        </p>
      </div>

      <div className="space-y-[20px]">
        <CasesWidget title="Abiertos" cases={openRows} emptyText="No tenés casos abiertos." />
        <CasesWidget
          title="Historial"
          cases={pastRows}
          emptyText="Todavía no hay casos cerrados o pasados."
        />
      </div>
    </div>
  );
}
