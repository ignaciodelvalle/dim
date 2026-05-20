// Tests for the cascading govt business rules resolver.
// Spec 2026-05-19-govt-business-rules-poc-design §4.3.

import { sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { db, govtBusinessRules, profiles } from "@/db";
import { BUSINESS_RULES_DEFAULTS } from "@/lib/business-rules-defaults";
import { resolveBusinessRule } from "@/lib/business-rules-resolver";

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
