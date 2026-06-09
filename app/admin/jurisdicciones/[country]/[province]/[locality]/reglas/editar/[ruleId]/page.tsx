// Rule edit page.

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OpCrumbs } from "@/components/ui/dashboard";
import { type GovtBusinessRuleType, db, govtBusinessRules } from "@/db";

import { PppAttestationRegistriesForm } from "../../nueva/PppAttestationRegistriesForm";
import { PppBreedListForm } from "../../nueva/PppBreedListForm";
import { PppWeightThresholdForm } from "../../nueva/PppWeightThresholdForm";

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

  const backHref = `/admin/jurisdicciones/${encodeURIComponent(country)}/${encodeURIComponent(province ?? "_")}/${encodeURIComponent(locality ?? "_")}/reglas`;

  const jurisdictionLabel = `${country} · ${province ?? "(nivel pais)"} · ${locality ?? "(toda la provincia)"}`;

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

      {ruleType === "ppp_breed_list" && (
        <PppBreedListForm
          mode="edit"
          ruleId={rule.id}
          country={country}
          province={province}
          locality={locality}
          initialBreeds={Array.isArray(payload.breeds) ? (payload.breeds as string[]) : []}
          initialNotes={initialNotes}
        />
      )}
      {ruleType === "ppp_weight_threshold" && (
        <PppWeightThresholdForm
          mode="edit"
          ruleId={rule.id}
          country={country}
          province={province}
          locality={locality}
          initialKg={typeof payload.kg === "number" ? payload.kg : null}
          initialAppliesIfBreedNotPPP={Boolean(payload.appliesIfBreedNotPPP)}
          initialNotes={initialNotes}
        />
      )}
      {ruleType === "ppp_attestation_required_registries" && (
        <PppAttestationRegistriesForm
          mode="edit"
          ruleId={rule.id}
          country={country}
          province={province}
          locality={locality}
          initialRegistries={
            Array.isArray(payload.registries)
              ? (payload.registries as { id: string; label: string; required: boolean }[])
              : []
          }
          initialNotes={initialNotes}
        />
      )}
    </div>
  );
}
