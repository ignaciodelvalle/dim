// /gob/moderacion — Phase 0 placeholder (honest coming-soon).
//
// Roadmap: docs/design/handoffs/2026-07-07-govt-jurisdiction-moderation-sdd.md
//
// This is an intentionally STATIC surface: NO data, NO actions, NO queue. It
// states the future jurisdiction-scoped moderation capability so a govt user
// sees the intent in the demo, without implying anything is wired up yet. It is
// gated only by the /gob layout guard (requireAdminOrGovtOrRedirect) — no new
// authz/capability is introduced here (that lands in Phase 2 per the SDD).

import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody } from "@/components/ui/dashboard";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";

export const dynamic = "force-dynamic";

export default async function GobModeracionPage() {
  // Normal govt guard — same gate as every other /gob surface. No scoped query
  // runs here; the placeholder shows the same intent to any in-scope operator.
  await requireAdminOrGovtOrRedirect();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Moderación</p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Moderación de denuncias</h1>
        <p className="text-[13px] text-ln-op-mute">
          Las denuncias anónimas de tus localidades, antes de que se conviertan en casos.
        </p>
      </header>

      <OpCard>
        <OpCardBody>
          <LnEmptyState
            icon="denuncia"
            title="Próximamente"
            description="Vas a poder moderar las denuncias anónimas de tus localidades acá — hoy las modera el equipo de plataforma."
          />
        </OpCardBody>
      </OpCard>
    </div>
  );
}
