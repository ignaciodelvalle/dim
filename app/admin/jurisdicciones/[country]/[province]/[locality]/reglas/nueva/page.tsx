// Rule creation page. Driven by ?ruleType= querystring.
// Spec 2026-05-19-govt-business-rules-poc-design §6.3.

import Link from "next/link";

import { OpBreach, OpCrumbs } from "@/components/ui/dashboard";
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

  const backHref = `/admin/jurisdicciones/${encodeURIComponent(country)}/${encodeURIComponent(province ?? "_")}/${encodeURIComponent(locality ?? "_")}/reglas`;

  if (!ruleType || !(GOVT_BUSINESS_RULE_TYPES as readonly string[]).includes(ruleType)) {
    return (
      <div className="max-w-2xl space-y-4">
        <OpCrumbs
          items={[
            { label: "Jurisdicciones", href: "/admin/jurisdicciones" },
            { label: "Reglas", href: backHref },
            { label: "Nueva regla" },
          ]}
        />
        <OpBreach title="Falta ?ruleType= en la URL." />
        <Link
          href={backHref}
          className="text-[12px] font-semibold text-ln-op-azul no-underline underline-offset-4 hover:underline"
        >
          {"<- Volver"}
        </Link>
      </div>
    );
  }

  const jurisdictionLabel = `${country} · ${province ?? "(nivel pais)"} · ${locality ?? "(toda la provincia)"}`;

  return (
    <div className="max-w-2xl space-y-6">
      <OpCrumbs
        items={[
          { label: "Jurisdicciones", href: "/admin/jurisdicciones" },
          { label: "Reglas", href: backHref },
          { label: "Nueva regla" },
        ]}
      />

      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Nueva regla</h1>
        <p className="text-[13px] text-ln-op-ink-2">{jurisdictionLabel}</p>
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
  );
}
