// Rule creation page. Driven by ?ruleType= querystring.
// Spec 2026-05-19-govt-business-rules-poc-design §6.3.

import Link from "next/link";

import { GOVT_BUSINESS_RULE_TYPES, type GovtBusinessRuleType } from "@/db";
import { POTENTIALLY_DANGEROUS_DOG_BREEDS } from "@/lib/breeds";

import { PppAttestationRegistriesForm } from "./PppAttestationRegistriesForm";
import { PppBreedListForm } from "./PppBreedListForm";
import { PppWeightThresholdForm } from "./PppWeightThresholdForm";

export const dynamic = "force-dynamic";

function decodeNullable(raw: string): string | null {
  if (raw === "_") return null;
  return decodeURIComponent(raw);
}

export default async function NewRulePage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string; province: string; locality: string }>;
  searchParams: Promise<{ ruleType?: string }>;
}) {
  const { country: countryRaw, province: provinceRaw, locality: localityRaw } = await params;
  const sp = await searchParams;
  const country = decodeURIComponent(countryRaw);
  const province = decodeNullable(provinceRaw);
  const locality = decodeNullable(localityRaw);

  const ruleType = sp.ruleType as GovtBusinessRuleType | undefined;
  if (!ruleType || !(GOVT_BUSINESS_RULE_TYPES as readonly string[]).includes(ruleType)) {
    return (
      <main className="px-6 py-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <Link
            href={`/admin/jurisdicciones/${encodeURIComponent(country)}/${encodeURIComponent(province ?? "_")}/${encodeURIComponent(locality ?? "_")}/reglas`}
            className="text-sm text-neutral-500"
          >
            ← Volver
          </Link>
          <p className="text-sm rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
            Falta ?ruleType= en la URL.
          </p>
        </div>
      </main>
    );
  }

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
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Nueva regla
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {country} · {province ?? "(nivel país)"} · {locality ?? "(toda la provincia)"}
          </p>
        </header>

        {ruleType === "ppp_breed_list" && (
          <PppBreedListForm
            mode="create"
            country={country}
            province={province}
            locality={locality}
            initialBreeds={[...POTENTIALLY_DANGEROUS_DOG_BREEDS]}
            initialNotes=""
          />
        )}
        {ruleType === "ppp_weight_threshold" && (
          <PppWeightThresholdForm
            mode="create"
            country={country}
            province={province}
            locality={locality}
            initialKg={25}
            initialAppliesIfBreedNotPPP={false}
            initialNotes=""
          />
        )}
        {ruleType === "ppp_attestation_required_registries" && (
          <PppAttestationRegistriesForm
            mode="create"
            country={country}
            province={province}
            locality={locality}
            initialRegistries={[]}
            initialNotes=""
          />
        )}
      </div>
    </main>
  );
}
