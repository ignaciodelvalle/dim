// Rule edit page.

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { OpCrumbs } from "@/components/ui/dashboard";
import { type GovtBusinessRuleType, db, govtBusinessRules } from "@/db";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";

import { RULE_FORM_REGISTRY, buildEditFormExtraProps } from "../../nueva/forms";

export const dynamic = "force-dynamic";

function decodeNullable(raw: string): string | null {
  if (raw === "_") return null;
  return decodeURIComponent(raw);
}

export default async function EditRulePage({
  params,
}: {
  params: Promise<{
    country: string;
    province: string;
    locality: string;
    ruleId: string;
  }>;
}) {
  await requireAdminOrRedirect();

  const {
    country: countryRaw,
    province: provinceRaw,
    locality: localityRaw,
    ruleId,
  } = await params;
  const country = decodeURIComponent(countryRaw);
  const province = decodeNullable(provinceRaw);
  const locality = decodeNullable(localityRaw);

  const [rule] = await db
    .select()
    .from(govtBusinessRules)
    .where(eq(govtBusinessRules.id, ruleId))
    .limit(1);
  if (!rule) notFound();

  const ruleType = rule.ruleType as GovtBusinessRuleType;
  const payload = rule.rulePayload as Record<string, unknown>;
  const initialNotes = rule.notes ?? "";

  const RuleForm = RULE_FORM_REGISTRY[ruleType];
  if (!RuleForm) notFound();

  const backHref = `/admin/jurisdicciones/${encodeURIComponent(country)}/${encodeURIComponent(province ?? "_")}/${encodeURIComponent(locality ?? "_")}/reglas`;

  const jurisdictionLabel = `${country} · ${province ?? "(nivel pais)"} · ${locality ?? "(toda la provincia)"}`;
  const extraProps = buildEditFormExtraProps(ruleType, payload);

  return (
    <div className="max-w-2xl space-y-6">
      <OpCrumbs
        items={[
          { label: "Jurisdicciones", href: "/admin/jurisdicciones" },
          { label: "Reglas", href: backHref },
          { label: "Editar regla" },
        ]}
      />

      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Editar regla</h1>
        <p className="text-[13px] text-ln-op-ink-2">{jurisdictionLabel}</p>
      </header>

      <RuleForm
        mode="edit"
        ruleId={rule.id}
        country={country}
        province={province}
        locality={locality}
        initialNotes={initialNotes}
        {...extraProps}
      />
    </div>
  );
}
