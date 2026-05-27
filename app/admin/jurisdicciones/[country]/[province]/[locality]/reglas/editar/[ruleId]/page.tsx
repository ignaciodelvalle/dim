// Rule edit page.

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

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

  return (
    <main className="px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href={`/admin/jurisdicciones/${encodeURIComponent(country)}/${encodeURIComponent(province ?? "_")}/${encodeURIComponent(locality ?? "_")}/reglas`}
          className="text-sm text-neutral-500"
        >
          ← Volver
        </Link>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-gob-text">Editar regla</h1>
          <p className="text-sm text-gob-text-gray">
            {country} · {province ?? "(nivel país)"} · {locality ?? "(toda la provincia)"}
          </p>
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
    </main>
  );
}
