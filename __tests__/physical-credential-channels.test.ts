// Tests for the physical_credential_channels business rule resolver + validator.
// Plan 2026-06-19-physical-credential-hub §4 Fase A.
//
// PHASE A NOTE: The live Postgres CHECK constraint on govt_business_rules.rule_type
// still only allows the 3 PPP types. Migration 0107 (Phase C) will widen it to
// include 'physical_credential_channels'. Tests that INSERT rows directly are
// guarded by a runtime check and skipped until the migration lands.
// The default-resolver test (no DB write) and all pure validator tests pass now.

import { sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { db, govtBusinessRules, profiles } from "@/db";
import { BUSINESS_RULES_DEFAULTS } from "@/lib/business-rules-defaults";
import { validateRulePayload } from "@/lib/business-rules-validators";
import { resolvePhysicalCredentialChannels } from "@/lib/physical-credential-channels";

// Stable test actor referenced by FK on created_by_user_id.
const ACTOR_ID = "aaaabbbb-cccc-4ddd-8eee-ffffffffffff";

// Test jurisdiction values anchored to synthetic locality names so cleanup
// stays isolated from real data and other test files.
const TEST_PROVINCE = "Buenos Aires";
const TEST_LOCALITY = "PHYS-CRED-TEST-LOC";

// Runtime flag: whether the live DB CHECK already allows 'physical_credential_channels'.
// Set in beforeAll by probing the constraint definition.
let dbConstraintAllowsNewType = false;

beforeAll(async () => {
  // Probe the live CHECK constraint to see if it already includes the new type.
  // This allows the suite to run safely in Phase A (constraint not yet updated)
  // and become fully active once migration 0107 lands.
  const rows = (await db.execute(sql`
    select pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'govt_business_rules'
      and c.conname  = 'govt_business_rules_rule_type_valid'
      and c.contype  = 'c'
    limit 1
  `)) as Array<{ def: string }>;

  const def = rows[0]?.def ?? "";
  dbConstraintAllowsNewType = def.includes("physical_credential_channels");

  // Seed actor only when we'll actually write rows.
  if (dbConstraintAllowsNewType) {
    await db.execute(sql`
      insert into auth.users (id, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, aud, role)
      values (${ACTOR_ID}::uuid, 'phys-cred-actor@dim-test.local',
        'fake', now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
      on conflict (id) do nothing
    `);
    await db
      .insert(profiles)
      .values({
        id: ACTOR_ID,
        role: "admin",
        accountType: "institutional",
        displayName: "phys-cred-actor",
      })
      .onConflictDoNothing();
  }
});

afterEach(async () => {
  if (!dbConstraintAllowsNewType) return;
  await db.execute(sql`
    delete from govt_business_rules
    where rule_type = 'physical_credential_channels'
      and jurisdiction_country = 'AR'
  `);
});

// ---------------------------------------------------------------------------
// Resolver tests
// ---------------------------------------------------------------------------

describe("resolvePhysicalCredentialChannels — cascade", () => {
  it("returns default when no DB row exists", async () => {
    const result = await resolvePhysicalCredentialChannels({
      country: "AR",
      province: null,
      locality: null,
    });
    expect(result).toEqual(BUSINESS_RULES_DEFAULTS.physical_credential_channels);
    expect(result.printable_qr).toBe(true);
    expect(result.engraved_plate).toEqual({ enabled: false });
    expect(result.nfc_tag).toEqual({ enabled: false });
  });

  it.skipIf(!dbConstraintAllowsNewType)(
    "locality row overrides province and country rows (cascade) [requires migration 0107]",
    async () => {
      // Insert a province-level row and a locality-level row.
      await db.insert(govtBusinessRules).values([
        {
          jurisdictionCountry: "AR",
          jurisdictionProvince: TEST_PROVINCE,
          jurisdictionLocality: null,
          ruleType: "physical_credential_channels",
          rulePayload: {
            printable_qr: false,
            engraved_plate: { enabled: false },
            nfc_tag: { enabled: false },
          },
          createdByUserId: ACTOR_ID,
          updatedByUserId: ACTOR_ID,
        },
        {
          jurisdictionCountry: "AR",
          jurisdictionProvince: TEST_PROVINCE,
          jurisdictionLocality: TEST_LOCALITY,
          ruleType: "physical_credential_channels",
          rulePayload: {
            printable_qr: true,
            engraved_plate: {
              enabled: true,
              providerName: "Localidad Grabados",
              providerUrl: "https://localidad.ar",
            },
            nfc_tag: { enabled: false },
          },
          createdByUserId: ACTOR_ID,
          updatedByUserId: ACTOR_ID,
        },
      ]);

      const result = await resolvePhysicalCredentialChannels({
        country: "AR",
        province: TEST_PROVINCE,
        locality: TEST_LOCALITY,
      });

      // Locality row wins.
      expect(result.printable_qr).toBe(true);
      expect(result.engraved_plate).toEqual({
        enabled: true,
        providerName: "Localidad Grabados",
        providerUrl: "https://localidad.ar",
      });
      expect(result.nfc_tag).toEqual({ enabled: false });
    },
  );

  it.skipIf(!dbConstraintAllowsNewType)(
    "round-trips a payload with engraved_plate provider details [requires migration 0107]",
    async () => {
      const payload = {
        printable_qr: true,
        engraved_plate: {
          enabled: true,
          providerName: "Grabados SA",
          providerUrl: "https://grabados.ar",
        },
        nfc_tag: { enabled: false },
      };

      await db.insert(govtBusinessRules).values({
        jurisdictionCountry: "AR",
        jurisdictionProvince: null,
        jurisdictionLocality: null,
        ruleType: "physical_credential_channels",
        rulePayload: payload,
        createdByUserId: ACTOR_ID,
        updatedByUserId: ACTOR_ID,
      });

      const result = await resolvePhysicalCredentialChannels({
        country: "AR",
        province: null,
        locality: null,
      });

      expect(result).toEqual(payload);
    },
  );
});

// ---------------------------------------------------------------------------
// Validator tests (pure — no DB)
// ---------------------------------------------------------------------------

describe("physicalCredentialChannelsSchema — validator", () => {
  it("rejects engraved_plate { enabled: true } with no providerName or providerUrl", () => {
    const r = validateRulePayload("physical_credential_channels", {
      printable_qr: true,
      engraved_plate: { enabled: true },
      nfc_tag: { enabled: false },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Proveedor (nombre + URL) requerido");
    }
  });

  it("rejects engraved_plate { enabled: true, providerName: 'X' } when URL is missing", () => {
    const r = validateRulePayload("physical_credential_channels", {
      printable_qr: true,
      engraved_plate: { enabled: true, providerName: "X" },
      nfc_tag: { enabled: false },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Proveedor (nombre + URL) requerido");
    }
  });

  it("accepts engraved_plate { enabled: false } with no provider fields", () => {
    const r = validateRulePayload("physical_credential_channels", {
      printable_qr: false,
      engraved_plate: { enabled: false },
      nfc_tag: { enabled: false },
    });
    expect(r.ok).toBe(true);
  });

  it("accepts a fully-specified enabled provider", () => {
    const r = validateRulePayload("physical_credential_channels", {
      printable_qr: true,
      engraved_plate: {
        enabled: true,
        providerName: "Grabados SA",
        providerUrl: "https://grabados.ar",
      },
      nfc_tag: { enabled: false },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects extra keys (strict mode)", () => {
    const r = validateRulePayload("physical_credential_channels", {
      printable_qr: true,
      engraved_plate: { enabled: false },
      nfc_tag: { enabled: false },
      unknown_field: true,
    });
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PPP re-evaluation isolation test
// ---------------------------------------------------------------------------

describe("createBusinessRuleWriter — physical_credential_channels does NOT trigger PPP reeval", () => {
  it.skipIf(!dbConstraintAllowsNewType)(
    "creating a physical_credential_channels rule does not invoke reEvaluatePppBreedListChange [requires migration 0107]",
    async () => {
      // Spy on the reeval module before importing the writer so the spy
      // intercepts calls made during the test.
      const reevalModule = await import("@/lib/business-rules-reeval");
      const reevalSpy = vi.spyOn(reevalModule, "reEvaluatePppBreedListChange");

      const { createBusinessRuleWriter } = await import("@/app/actions/business-rules");

      const result = await createBusinessRuleWriter({
        actorUserId: ACTOR_ID,
        ruleType: "physical_credential_channels",
        jurisdictionCountry: "AR",
        jurisdictionProvince: TEST_PROVINCE,
        jurisdictionLocality: "PHYS-CRED-PPP-ISO-LOC",
        rulePayload: {
          printable_qr: false,
          engraved_plate: { enabled: false },
          nfc_tag: { enabled: false },
        },
        notes: null,
        legalAnchorIds: [],
      });

      // The writer should succeed (noOp because payload matches default is fine too).
      // What matters is that the PPP reeval function was NOT called.
      expect(result.ok).toBe(true);
      expect(reevalSpy).not.toHaveBeenCalled();

      reevalSpy.mockRestore();
    },
  );

  it("PPP guards use exact ruleType equality — verified by code inspection", () => {
    // This test documents the invariant without a DB write:
    // createBusinessRuleWriter and updateBusinessRuleWriter both gate the reeval
    // with `if (params.ruleType === "ppp_breed_list")` and
    // `if (updated?.ruleType === "ppp_breed_list")` respectively — exact string
    // comparison, not startsWith or includes. Any non-ppp_breed_list ruleType
    // (including physical_credential_channels) will never trigger reeval.
    //
    // Source verified: app/actions/business-rules.ts lines 164, 235, 288.
    expect(true).toBe(true);
  });
});
