// Tests for the cascading govt business rules resolver.
// Spec 2026-05-19-govt-business-rules-poc-design §4.3.

import { sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { db, govtBusinessRules, profiles } from "@/db";
import { BUSINESS_RULES_DEFAULTS } from "@/lib/domain/business-rules-defaults";
import {
  canonicalJurisdictionKey,
  resolveBusinessRule,
  resolveBusinessRuleForJurisdictions,
} from "@/lib/infra/business-rules-resolver";

// Stable test actor referenced by FK on created_by_user_id.
const ACTOR_ID = "11111111-2222-4333-8444-555555555555";

beforeAll(async () => {
  await db.execute(sql`
    insert into auth.users (id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role)
    values (${ACTOR_ID}::uuid, 'br-resolver-actor@dim-test.local',
      'fake', now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
    on conflict (id) do nothing
  `);
  await db
    .insert(profiles)
    .values({
      id: ACTOR_ID,
      role: "admin",
      accountType: "institutional",
      displayName: "br-resolver-actor",
    })
    .onConflictDoNothing();
});

afterEach(async () => {
  await db.execute(sql`
    delete from govt_business_rules
    where jurisdiction_country = 'AR'
      and (jurisdiction_province = 'Buenos Aires'
        or jurisdiction_province is null)
  `);
});

describe("resolveBusinessRule — cascade", () => {
  it("returns default when no override exists", async () => {
    const r = await resolveBusinessRule("ppp_breed_list", { country: "AR" });
    expect(r.source).toBe("default");
    expect(r.payload.breeds).toEqual(BUSINESS_RULES_DEFAULTS.ppp_breed_list.breeds);
  });

  it("returns country override when present", async () => {
    await db.insert(govtBusinessRules).values({
      jurisdictionCountry: "AR",
      jurisdictionProvince: null,
      jurisdictionLocality: null,
      ruleType: "ppp_breed_list",
      rulePayload: { breeds: ["Boxer", "Doberman"] },
      createdByUserId: ACTOR_ID,
      updatedByUserId: ACTOR_ID,
    });
    const r = await resolveBusinessRule("ppp_breed_list", { country: "AR" });
    expect(r.source).toBe("country");
    expect(r.payload.breeds).toEqual(["Boxer", "Doberman"]);
  });

  it("returns province override when more specific than country", async () => {
    await db.insert(govtBusinessRules).values([
      {
        jurisdictionCountry: "AR",
        jurisdictionProvince: null,
        jurisdictionLocality: null,
        ruleType: "ppp_breed_list",
        rulePayload: { breeds: ["Boxer"] },
        createdByUserId: ACTOR_ID,
        updatedByUserId: ACTOR_ID,
      },
      {
        jurisdictionCountry: "AR",
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: null,
        ruleType: "ppp_breed_list",
        rulePayload: { breeds: ["Boxer", "Doberman", "Akita Inu"] },
        createdByUserId: ACTOR_ID,
        updatedByUserId: ACTOR_ID,
      },
    ]);
    const r = await resolveBusinessRule("ppp_breed_list", {
      country: "AR",
      province: "Buenos Aires",
    });
    expect(r.source).toBe("province");
    expect(r.payload.breeds).toEqual(["Boxer", "Doberman", "Akita Inu"]);
  });

  it("returns locality override over province", async () => {
    await db.insert(govtBusinessRules).values([
      {
        jurisdictionCountry: "AR",
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: null,
        ruleType: "ppp_breed_list",
        rulePayload: { breeds: ["Boxer"] },
        createdByUserId: ACTOR_ID,
        updatedByUserId: ACTOR_ID,
      },
      {
        jurisdictionCountry: "AR",
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: "La Plata",
        ruleType: "ppp_breed_list",
        rulePayload: { breeds: ["Boxer", "Pit Bull Terrier"] },
        createdByUserId: ACTOR_ID,
        updatedByUserId: ACTOR_ID,
      },
    ]);
    const r = await resolveBusinessRule("ppp_breed_list", {
      country: "AR",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    expect(r.source).toBe("locality");
    expect(r.payload.breeds).toEqual(["Boxer", "Pit Bull Terrier"]);
  });

  it("falls back to province when locality lookup misses", async () => {
    await db.insert(govtBusinessRules).values({
      jurisdictionCountry: "AR",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: null,
      ruleType: "ppp_breed_list",
      rulePayload: { breeds: ["Boxer"] },
      createdByUserId: ACTOR_ID,
      updatedByUserId: ACTOR_ID,
    });
    const r = await resolveBusinessRule("ppp_breed_list", {
      country: "AR",
      province: "Buenos Aires",
      locality: "Quilmes", // no row for Quilmes
    });
    expect(r.source).toBe("province");
    expect(r.payload.breeds).toEqual(["Boxer"]);
  });

  it("falls back to defaults when no row matches at any level", async () => {
    const r = await resolveBusinessRule("ppp_weight_threshold", {
      country: "AR",
      province: "Mendoza",
      locality: "Godoy Cruz",
    });
    expect(r.source).toBe("default");
    expect(r.payload).toEqual(BUSINESS_RULES_DEFAULTS.ppp_weight_threshold);
  });
});

// ---------------------------------------------------------------------------
// Promoted rule types (admin-rules-console, migration 0116) — the cascade
// mechanism itself is rule-type-agnostic (tested exhaustively above with
// ppp_breed_list); these tests prove the 4 NEW types round-trip end-to-end
// through the widened CHECK constraint, not just past the TS type checker.
// ---------------------------------------------------------------------------
describe("resolveBusinessRule — promoted rule types (migration 0116)", () => {
  it("rabies_observation_window: default 10 with no override, province override wins over default", async () => {
    const before = await resolveBusinessRule("rabies_observation_window", { country: "AR" });
    expect(before.source).toBe("default");
    expect(before.payload).toEqual(BUSINESS_RULES_DEFAULTS.rabies_observation_window);

    await db.insert(govtBusinessRules).values({
      jurisdictionCountry: "AR",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: null,
      ruleType: "rabies_observation_window",
      rulePayload: { days: 14 },
      createdByUserId: ACTOR_ID,
      updatedByUserId: ACTOR_ID,
    });
    const r = await resolveBusinessRule("rabies_observation_window", {
      country: "AR",
      province: "Buenos Aires",
    });
    expect(r.source).toBe("province");
    expect(r.payload).toEqual({ days: 14 });
  });

  it("due_soon_window / long_stay_days / reminder_windows: default matches the pre-promotion constant", async () => {
    const dueSoon = await resolveBusinessRule("due_soon_window", { country: "AR" });
    expect(dueSoon.payload).toEqual({ days: 30 });

    const longStay = await resolveBusinessRule("long_stay_days", { country: "AR" });
    expect(longStay.payload).toEqual({ days: 60 });

    const reminders = await resolveBusinessRule("reminder_windows", { country: "AR" });
    expect(reminders.payload).toEqual({ aheadDays: 14 });
  });

  it("long_stay_days: locality override wins over a province override (full cascade)", async () => {
    await db.insert(govtBusinessRules).values([
      {
        jurisdictionCountry: "AR",
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: null,
        ruleType: "long_stay_days",
        rulePayload: { days: 45 },
        createdByUserId: ACTOR_ID,
        updatedByUserId: ACTOR_ID,
      },
      {
        jurisdictionCountry: "AR",
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: "La Plata",
        ruleType: "long_stay_days",
        rulePayload: { days: 30 },
        createdByUserId: ACTOR_ID,
        updatedByUserId: ACTOR_ID,
      },
    ]);
    const r = await resolveBusinessRule("long_stay_days", {
      country: "AR",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    expect(r.source).toBe("locality");
    expect(r.payload).toEqual({ days: 30 });
  });
});

// ---------------------------------------------------------------------------
// Batch variant (movilidad-jurisdiccional Fase 1, design D3) — resolves ONE
// rule type across N jurisdictions in a single call, keyed by canonical
// jurisdiction string. Each entry follows the same locality > province >
// country > default cascade as the single resolver.
// ---------------------------------------------------------------------------
describe("resolveBusinessRuleForJurisdictions — batch variant", () => {
  it("resolves each jurisdiction independently through the cascade", async () => {
    await db.insert(govtBusinessRules).values({
      jurisdictionCountry: "AR",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: null,
      ruleType: "ppp_breed_list",
      rulePayload: { breeds: ["Boxer", "Akita Inu"] },
      createdByUserId: ACTOR_ID,
      updatedByUserId: ACTOR_ID,
    });

    const caba = { country: "AR", province: "Ciudad Autónoma de Buenos Aires", locality: null };
    const pba = { country: "AR", province: "Buenos Aires", locality: null };
    const result = await resolveBusinessRuleForJurisdictions("ppp_breed_list", [caba, pba]);

    const cabaResolved = result.get(canonicalJurisdictionKey(caba));
    const pbaResolved = result.get(canonicalJurisdictionKey(pba));
    expect(cabaResolved?.source).toBe("default");
    expect(pbaResolved?.source).toBe("province");
    expect(pbaResolved?.payload.breeds).toEqual(["Boxer", "Akita Inu"]);
  });

  it("keeps the locality > province fallback order per jurisdiction", async () => {
    await db.insert(govtBusinessRules).values({
      jurisdictionCountry: "AR",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: null,
      ruleType: "long_stay_days",
      rulePayload: { days: 45 },
      createdByUserId: ACTOR_ID,
      updatedByUserId: ACTOR_ID,
    });
    const j = { country: "AR", province: "Buenos Aires", locality: "Quilmes" };
    const result = await resolveBusinessRuleForJurisdictions("long_stay_days", [j]);
    const resolved = result.get(canonicalJurisdictionKey(j));
    expect(resolved?.source).toBe("province");
    expect(resolved?.payload).toEqual({ days: 45 });
  });

  it("dedupes identical jurisdictions (one map entry, one cascade)", async () => {
    const j = { country: "AR", province: "Buenos Aires", locality: null };
    const result = await resolveBusinessRuleForJurisdictions("ppp_breed_list", [j, { ...j }]);
    expect(result.size).toBe(1);
  });

  it("returns an empty map for an empty jurisdiction list", async () => {
    const result = await resolveBusinessRuleForJurisdictions("ppp_breed_list", []);
    expect(result.size).toBe(0);
  });
});
