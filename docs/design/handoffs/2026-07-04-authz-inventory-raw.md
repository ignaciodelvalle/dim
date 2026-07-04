# Authorization-parity audit — raw inventory

Mechanical extraction only. No severity judgment. `⚠` = an ID param accepted by
the action has **no visible caller-scoping** in the file itself (guard is
role-only, or the ID is forwarded to a delegate without a local WHERE clause
tying it to the caller). Where scoping happens inside a delegated
`application/*` use-case (out of grep scope per the task), that is noted as
"delegated — not visible in this file", which is *not* the same claim as
"unscoped" — it means the human pass must open the use-case to confirm.

Legend: **ForUser/ForAuthority/Writer/-From-** suffixed exports are skipped as
rows (per task instructions) but noted as delegation targets under their
public-action row.

Total files scanned: 58 real action files under `app/actions/*.ts` (61 minus
2 `.test.ts` files minus `bulk-vaccinate-types.ts`, a pure type re-export shim
with zero server actions) + 8 `src/modules/**/actions.ts` files = **66 files**.

---

## app/actions/scans.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `logScanAction` :19 | `@no-auth-required`: "auth is optional...anonymous scans are valid; auth.getUser() used only to flag self-scans" (comment, no guard call in this file) | `publicToken` | NONE VISIBLE — delegates entirely to `logScan(publicToken)` in `src/modules/pets/application/scans/log-scan.ts` ⚠ | none in this file (delegated) |

## app/actions/lost-mode.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `setPetDisclosurePrefsAction` :14 | `requirePetAccess(publicToken)` | `publicToken` | Scoped by guard; `access.pet.id` derived from the validated access object, not from caller input | none (delegates to `setPetDisclosurePrefs`) |

## app/actions/pet-lookup-public.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `lookupPetForDenunciaAction` :20 | `@no-auth-required`: "anonymous pet lookup — public search for denuncia filing requires no account" | none (free-text `query`) | N/A — public search, no resource id | none (read-only) |

## app/actions/decomiso-pet-lookup.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `lookupPetForDecomisoAction` :20 | `requireDecomisoPrincipal()` | none (free-text `query`) | Role-based only; N/A for resource id | none (read-only) |

## app/actions/revocation-evidence.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `uploadRevocationEvidence` :19 | `@no-auth-required`: "caller passes actorUserId; the role check (admin\|govt) runs inside the delegated use-case and IS the auth gate" — spread args (`...Parameters<typeof _uploadEvidence>`), signature opaque in this file | `actorUserId` (inside delegate signature `(actorUserId, input)`) | Delegate `src/modules/organizations/application/revocations/upload-evidence.ts:40-44`: `.where(eq(profiles.id, actorUserId))` then role check `profile.role !== "admin" && profile.role !== "govt"`. **`actorUserId` is caller-supplied, not derived from `auth.getUser()` anywhere in the call chain** ⚠ | `attachments` (insert, all domain FKs NULL) |

## app/actions/rule-impact-preview.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `previewRuleImpact` :19 | `requireAdminOrRedirect()` | none (jurisdiction/rule shape in `input`, admin-global by design) | N/A — admin-wide read | none (read-only) |

## app/actions/quick-capture.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `quickCaptureAction` :20 | `@no-auth-required`: "no auth needed — public token identifies the pet; no account required" | `publicToken` | NONE VISIBLE in this file — delegates to `quickCapture(publicToken, text)` with no guard call ⚠ | none in this file (delegated) |

## app/actions/claim.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `claimStubProfileAction` :21 | `@no-auth-required`: "auth enforced inside the delegated use-case (auth.getUser() runs after the security-gate check that must precede it)" | none visible (`formData`) | NONE VISIBLE — delegated to `claimStubProfile` | none in this file |

## app/actions/ppp-export-caba.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `generatePppExportAction` :22 | `@no-auth-required`: "auth enforced inside the delegated use-case (requireUserOrRedirect() is the first call...)" | `petPublicToken` | NONE VISIBLE in this file — delegated to `generatePppExport` | none (read-only export) |

## app/actions/tier2-public.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `enableTier2PublicAction` :15 | `requirePetAccess(publicToken)` | `publicToken` | Scoped — `access.pet` from validated access | none in this file (delegated) |
| `revokeTier2PublicAction` :24 | `requirePetAccess(publicToken)` | `publicToken` | Scoped — `access.pet` from validated access | none in this file (delegated) |

## app/actions/omnibox-search.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `searchOmniboxAction` :19 | `requireAdminOrGovtOrRedirect()` | none (free-text `query`) | Role-based, admin/govt-global search | none (read-only) |
| `searchOmniboxOrgAction` :24 | `requireOrgAccessByToken(orgToken)` | `orgToken` | Scoped — `session` resolved from token | none (read-only) |

## app/actions/password-reset.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `requestPasswordResetAction` :24 | `@no-auth-required`: "anonymous password-reset request" — spread args | none visible (opaque signature) | N/A (pre-auth flow) | none in this file |
| `updatePasswordAction` :31 | `@no-auth-required`: "auth enforced inside the delegated use-case (supabase.auth.getUser() validates the recovery session...)" | none visible (opaque) | NONE VISIBLE in this file | none in this file |

## app/actions/physical-tag-interest.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `togglePhysicalTagInterestAction` :25 | `requirePetAccess(petPublicToken)` + explicit `access.accessPath !== "owner"` check | `petPublicToken` | Scoped — owner-only enforced inline | none in this file (delegated) |

## app/actions/pet-tab-data.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `getLibretaFaceData` :28 | `requirePetAccess(publicToken)` | `publicToken` | Scoped — accepts `accessPath === "org"` too (documented intentional widening; activeShares stays owner-gated inside the use-case) | none (read-only) |

## app/actions/reactivate-lost-search.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `reactivateLostSearchAction` :12 | `requirePetAccess(publicToken)` + explicit `accessPath !== "owner"` check | `publicToken` | Scoped — owner-only enforced inline, `pet.id` from validated access | none in this file (delegated to `reactivateLostSearch`) |

## app/actions/subject-rights.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `exportMySubjectDataAction` :24 | `@no-auth-required`: "requireUserOrRedirect() gates the export" (inside delegate) — spread args | none visible | NONE VISIBLE in this file | none in this file |
| `eraseMySubjectDataAction` :31 | `@no-auth-required`: same pattern | none visible | NONE VISIBLE in this file | none in this file |

## app/actions/pet-sighting.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `reportPetSightingAction` :30 | `@no-auth-required`: "anonymous sighting report — no account needed" | `publicToken` | N/A — intentionally anonymous/public action | none in this file (delegated) |

## app/actions/public.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `notifyOwnerOfFoundPetAction` :30 | `@no-auth-required`: "anonymous 'found pet' notification — anyone scanning a QR can invoke it" | `publicToken` | N/A — intentionally anonymous/public action | none in this file (delegated) |

## app/actions/intake.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `createIntakeAction` :28 | `requireCapability("intake.create")` | `orgToken` | Scoped — `organization` from capability resolution passed to use-case | none in this file (delegated) |

## app/actions/checkin.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `recordPostAdoptionCheckinAction` :29 | `requirePetAccess(publicToken)` + explicit `accessPath !== "owner"` check | `publicToken` | Scoped — owner-only enforced inline | none in this file (delegated) |

## app/actions/apply-intent.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `startApplyIntentAction` :25 | `@no-auth-required`: "auth enforced inside the delegated use-case (auth.getUser() runs after the pet-listability check)" | `petToken` | NONE VISIBLE in this file | none |
| `startApplyIntentFormAction` :32 | same as above (delegates to the same chain) | none visible (`formData`) | NONE VISIBLE in this file | none |
| `dismissApplyIntentAction` :41 | `@no-auth-required`: "cookie clear — no auth needed...only deletes two short-lived cookies from the caller's own browser session" | none | N/A — self-scoped by cookie jar | none |

## app/actions/performed-by.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `searchVetsAndClinicsAction` :31 | `requireUserOrRedirect()` | none (free-text `query`) | `user.id` passed to delegate | none (read-only) |
| `__resetPerformedByRateLimitForTests` :41 | `@no-auth-required`: "test-only reset helper" | none | N/A | none |

## app/actions/bulk-adoption-actions.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `bulkApproveAdoptionApplicationsAction` :36 | `requireOrgAccessByToken(input.orgToken)` | `orgToken`, `applicationEventIds[]` | `orgToken` scoped by guard; each `applicationEventId` re-validated per-item by looping `approveAdoptionApplicationAction(orgToken, {applicationEventId,...})` (see adoption/actions.ts row) — confirmed scoped downstream | none in this file (delegates) |
| `bulkRejectAdoptionApplicationsAction` :41 | `requireOrgAccessByToken(input.orgToken)` | same as above | Same per-item delegation pattern | none in this file |

## app/actions/notifications.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `markNotificationReadAction` :31 | local `requireUser()` → `supabase.auth.getUser()` + null check | `notificationId` | NONE VISIBLE in this file — `user.id` passed to `_markNotificationRead(user.id, notificationId)`; ownership check delegated ⚠ | none in this file |
| `archiveNotificationAction` :36 | same | `notificationId` | Same as above ⚠ | none in this file |
| `markAllNotificationsReadAction` :41 | same | none | N/A (self-scoped, all own notifications) | none in this file |

## app/actions/auth.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `signupAction` :26 | `@no-auth-required`: "pre-authentication entrypoint" | none visible | N/A | none |
| `completeIdentityAction` :31 | `@no-auth-required`: "supabase.auth.getUser() gates the write" | none visible | NONE VISIBLE in this file | none |
| `loginAction` :36 | `@no-auth-required`: pre-auth | none visible | N/A | none |
| `logoutAction` / `logoutAndReturnAction` :41,46 | `@no-auth-required`: "invalidates whatever session exists" | none | N/A | none |

## app/actions/sign-timeline-attachments.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `signTimelineAttachmentsForPet` :34 | `@no-auth-required`: "delegates entirely to signTimelineAttachments which calls requirePetAccess before touching the DB" | `petPublicToken`, `eventIds[]` | NONE VISIBLE in this file — guard is one level down | none in this file |
| `signTimelineAttachments` :44 | `@no-auth-required`: "requirePetAccess runs after input validation...that must precede it" | `petPublicToken`, `eventIds[]` | NONE VISIBLE in this file | none in this file |

## app/actions/approval-requests.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `withdrawApprovalRequestForUser` :31 | **NONE** — raw `(userId, requestId)`, matches `ForUser` skip pattern but has no separate wrapper calling it besides `withdrawApprovalRequestAction` below; comment says "used by integration tests" but it is exported from a `"use server"` file, so it is reachable as a callable action from any client bundle that imports it ⚠ | `userId`, `requestId` | NONE VISIBLE — `requestId` forwarded raw to `_withdrawApprovalRequestForUser` | none in this file |
| `withdrawApprovalRequestAction` :42 | `requireUserOrRedirect()` | `requestId` | `user.id` passed to `withdrawApprovalRequestForUser`; `requestId` ownership check delegated (not visible in this file) ⚠ | none in this file |

## app/actions/localities.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `searchLocalitiesAction` :32 | `requireUserOrRedirect()` | none | N/A | none (read-only) |
| `searchLocalitiesPublicAction` :43 | `@no-auth-required`: "public INDEC reference data...no PII" | none | N/A | none (read-only) |
| `__resetRateLimitForTests` :51 | `@no-auth-required`: test-only | none | N/A | none |

## app/actions/microchip.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `replaceMicrochipForUser` :35 | **NONE** — raw `(userId, rawInput)`, matches `ForUser` skip pattern, delegated-to by `replaceMicrochipAction` below | `userId` | NONE VISIBLE in this file | none in this file |
| `replaceMicrochipAction` :46 | `supabase.auth.getUser()` + null check | none extra | `user.id` passed to writer; pet/microchip target resolved from `rawInput` inside the delegate (not visible here) ⚠ | none in this file |

## app/actions/amendment.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `amendEventAction` :39 | `requireAlivePetAccess(input.publicToken)` | `publicToken` (event id inside `input`) | Scoped — `access.pet`/`access.user` from validated access | none in this file (delegated) |
| `fetchLatestAmendmentsForEvents` :55 | `@no-auth-required`: "pure projection query; caller must scope to pet.id from an already-authenticated context" — spread args | event ids (opaque, spread) | NONE VISIBLE in this file — trusts caller ⚠ | none (read-only) |

## app/actions/bulk-actions.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `bulkApproveRequestsAction` :42 | `requireAdminOrGovtOrRedirect()` | none extra (`input` items) | Role-based only, per-item scoping delegated to `bulkApproveRequests` | none in this file |
| `bulkRejectRequestsAction` :50 | `@no-auth-required`: "requireAdminOrGovtOrRedirect runs after reason-length validation" — delegated | none extra | NONE VISIBLE in this file — guard one level down | none in this file |
| `bulkRevokeAction` :57 | `@no-auth-required`: same pattern | none extra | NONE VISIBLE in this file | none in this file |

## app/actions/dni-verification.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `verifyDniForUser` :38 | **NONE** — raw `(userId, rawDni)`, `ForUser`-pattern, delegated-to by `verifyDniAction` | `userId` | NONE VISIBLE in this file | none in this file |
| `verifyDniAction` :46 | `requireUserOrRedirect()` | none extra | `user.id` used directly (self-scoped, no cross-user id param) | none in this file |

## app/actions/geocoding.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `geocodeAddressAction` / `reverseGeocodeAction` :32,39 | `requireUserOrRedirect()` (guard called, result discarded) | none | N/A (no resource id, pure external lookup) | none |
| `geocodeAddressPublicAction` / `reverseGeocodePublicAction` :53,61 | `@no-auth-required`: "anonymous...IP rate-limited" | none | N/A | none |

## app/actions/admin-org-verification.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `verifyOrgForAuthority` / `unverifyOrgForAuthority` :31,38 | **NONE** — raw `(actorUserId, input)`, `ForAuthority`-pattern, delegated-to below | `organizationId` | NONE VISIBLE in this file | none in this file |
| `verifyOrgAction` :49 | `requireAdminOrRedirect()` | `organizationId` (in `input`) | Role-based only; `organizationId` forwarded raw, no local WHERE clause — admin is global by design, but not visible-scoped in this file ⚠ | none in this file |
| `unverifyOrgAction` :62 | `requireAdminOrRedirect()` | `organizationId` | Same as above ⚠ | none in this file |

## app/actions/slot-materialization.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `materializeAllActiveSlots` :38 | `@no-auth-required`: "cron writer — invoked by the cron route without a user session" | none | N/A — cron/system path, no auth expected in this file; relies on the cron route being CRON_SECRET-gated (not verified in this file) | none in this file |
| `materializeSlotsForOffering` :46 | `@no-auth-required`: same cron rationale | `offeringId` | NONE VISIBLE — no guard, no scoping in this file ⚠ | none in this file |
| `materializeOfferingNowAction` :59 | `@no-auth-required`: "auth enforced inside the delegated use-case (requireCapability runs after offering validation that supplies organizationId)" | `offeringToken` | NONE VISIBLE in this file — guard one level down | none in this file |
| `blockSlotAction` :65 | `requireOrgAccessByToken(input.orgToken)` + `getGrantedCapabilities` check for `"appointment.manage"` | `orgToken`, `slotId` | `orgToken`→`organizationId` scoped by guard and injected into the call (`{...input, organizationId: organization.id}`); **`slotId` itself is not verified to belong to that org in this file** ⚠ | none in this file (delegated to `_blockSlot`) |

## app/actions/service-dog.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `upsertServiceDogAction` :45 | `requireUserOrRedirect()` | `petPublicToken` (in `input`) | NONE VISIBLE in this file — `user.id` passed but pet-ownership check delegated ⚠ | none in this file |
| `submitServiceDogVerificationRequestAction` :52 | `requireUserOrRedirect()` | `petPublicToken` (in `input`) | NONE VISIBLE in this file ⚠ | none in this file |
| `setServiceDogVisibilityAction` :59 | `requireUserOrRedirect()` | `petPublicToken` | NONE VISIBLE in this file ⚠ | none in this file |
| `retireServiceDogAction` :67 | `requireUserOrRedirect()` | `petPublicToken` | NONE VISIBLE in this file ⚠ | none in this file |
| `revokeServiceDogCredentialAction` :74 | `requireUserOrRedirect()` | `petPublicToken` (in `input`) | NONE VISIBLE in this file ⚠ | none in this file |

## app/actions/pet-claim.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `lookupForClaimForUser` / `submitClaimDisputeForUser` / `submitFreeClaimForUser` :39,43,47 | **NONE** — raw args, `ForUser`-pattern, delegated-to below | varies | NONE VISIBLE in this file | none in this file |
| `lookupForClaimAction` :55 | `requireUserOrRedirect()` | none (microchip/tattoo value) | N/A | none |
| `submitClaimDisputeAction` :63 | `requireUserOrRedirect()` | `petToken` (in `input`) | NONE VISIBLE in this file — `user.id` passed, dispute scoping delegated ⚠ | none in this file |
| `submitFreeClaimAction` :72 | `requireUserOrRedirect()` | `petToken` (in `input`) | NONE VISIBLE in this file ⚠ | none in this file |

## app/actions/admin-decisions.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `approveRequestForAuthority` / `rejectRequestForAuthority` / `logRequestViewedForAuthority` :33,42,51 | **NONE** — raw `(actorUserId, publicToken, ...)`, `ForAuthority`-pattern, delegated-to below | `publicToken` | NONE VISIBLE in this file | none in this file |
| `approveRequestAction` :62 | `requireAdminOrGovtOrRedirect()` | `publicToken` | Role-based only; `publicToken` forwarded raw, jurisdiction/ownership scoping delegated ⚠ | none in this file |
| `rejectRequestAction` :74 | `requireAdminOrGovtOrRedirect()` | `publicToken` | Same as above ⚠ | none in this file |

## app/actions/chip-match.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `confirmChipMatchAction` :33 | branches: `actorMode==="refugio"` → `requireCapability("intake.create")`; `actorMode==="vecino"` → `requireUserOrRedirect()` | `matchedPetToken`, `orgToken` | `orgToken`/`auth` resolved by capability guard for refugio path; `session.user.id` for vecino path — both forwarded to writer, no local WHERE clause on `matchedPetToken` in this file ⚠ | none in this file |
| `confirmChipMatchAsRefugioWriter` / `confirmChipMatchAsVecinoWriter` :76,82 | **NONE** — raw spread args, `Writer`-pattern, delegated-to by `confirmChipMatchAction` above | opaque | NONE VISIBLE in this file | none in this file |

## app/actions/booking.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `bookSlotWriter` :37 | **NONE** — raw spread args, `Writer`-pattern, delegated-to by `bookSlotAction` below | opaque | NONE VISIBLE | none in this file |
| `bookSlotAction` :47 | `requireUserOrRedirect()` + explicit ownership query | `slotId`, `petId` | **Good example** — `.where(sql\`${ownerships.ownerUserId} = ${user.id} AND ${ownerships.petId} = ${petId} AND ${ownerships.endedAt} IS NULL\`)` :57-61 | none in this file (delegates to writer) |
| `cancelAppointmentByOwnerAction` :75 | `requireUserOrRedirect()` | `appointmentToken` | NONE VISIBLE in this file — `user.id` + `appointmentToken` both forwarded to `_cancelAppointmentByOwner`, scoping delegated | none in this file |

## app/actions/profile.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `updateProfileForUser` / `uploadAvatarForUser` :38,42 | **NONE** — raw spread args, `ForUser`-pattern, delegated-to below | none (own profile) | N/A | none in this file |
| `updateProfileAction` :50 | `requireUserOrRedirect()` | none | N/A (self-scoped, own profile) | none in this file |
| `uploadAvatarAction` :66 | `requireUserOrRedirect()` | none | N/A | none in this file |
| `updateEmergencyContactsAction` :83 | `requireUserOrRedirect()` | `petPublicToken` param **declared but never forwarded** to `_updateEmergencyContactsForUser(user.id, input)` — only used for `revalidatePath` | NONE VISIBLE — the actual pet target must live inside `input: UpdateEmergencyContactsInput`; not confirmed in this file ⚠ | none in this file |

## app/actions/profile-self-service.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `vetSelfResignForUser` / `govtSelfDeactivateForUser` / `updatePrivacyPrefForUser` / `selfDeactivatePersonalAccountForUser` :39-55 | **NONE** — raw spread args, `ForUser`-pattern, delegated-to below | none (self only) | N/A | none in this file |
| `vetSelfResignAction` / `govtSelfDeactivateAction` / `updatePrivacyPrefAction` / `selfDeactivatePersonalAccountAction` :61-95 | `requireUserOrRedirect()` (all four) | none | N/A — all self-scoped (`user.id`) | none in this file |

## app/actions/reminders.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `createVaccineReminderAction` :34 | `requireOwnedPetByToken(publicToken)` | `publicToken` | Scoped — `session.pet.id` from validated ownership | none in this file (delegated) |
| `deleteVaccineReminderAction` :44 | `requireOwnedPetByToken(publicToken)` | `publicToken`, `reminderId` | `publicToken` scoped by guard; **`reminderId` forwarded raw to `_delete(session.pet.id, publicToken, reminderId)` — not verified to belong to that pet in this file** ⚠ | none in this file |
| `snoozeReminderAction` :52 | `supabase.auth.getUser()` + null check | `reminderId` | NONE VISIBLE in this file — `user.id` + `reminderId` both forwarded to `_snooze`, ownership check delegated ⚠ | none in this file |

## app/actions/pregnancy.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `recordPregnancyStartedWriter` / `recordPregnancyEndedWriter` :44,50 | **NONE** — raw params, `Writer`-pattern, delegated-to below | `pet` object (in params) | NONE VISIBLE | none in this file |
| `recordPregnancyStartedAction` :60 | `requireAlivePetAccess(publicToken)` | `publicToken` | Scoped — `access.pet`/`access.user` from validated access | none in this file (delegated) |
| `recordPregnancyEndedAction` :100 | `requireAlivePetAccess(publicToken)` | `publicToken` | Scoped — same pattern | none in this file (delegated) |

## app/actions/custody-disputes.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `openDisputeFromEvent` :74 | **NONE** (comment: "Auth is the caller's responsibility — openDisputeFromEvent is server-side only"); not a genuine public action, but exported as async pass-through to satisfy `"use server"` constraint | `petId`, `preCreatedCaseId` | NONE VISIBLE — trusts caller (only called from `pet-claim.ts`, itself `"use server"`) ⚠ | none in this file (delegated) |
| `addDisputePartyAction` :100 | `requireAdminOrGovtOrRedirect()` | `disputeToken` (in `input`) | Role-based only; scoping delegated to `addDisputePartyUseCase` ⚠ | none in this file |
| `resolveDisputeAction` :109 | `requireAdminOrGovtOrRedirect()` | `disputeToken` (in `input`) | Same pattern ⚠ | none in this file |
| `withdrawDisputeAction` :121 | `requireAdminOrGovtOrRedirect()` | `disputeToken` (in `input`) | Same pattern ⚠ | none in this file |
| `lookupTransferTargetAction` :133 | `requireAdminOrGovtOrRedirect()` | none | N/A (read-only lookup) | none |
| `escalateDisputeAction` :140 | `requireAdminOrGovtOrRedirect()` | `disputeToken` (in `input`) | Same pattern ⚠ | none in this file |

## app/actions/admin-institutional.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `createInstitutionalAccountForAuthority` / `deactivateAdminForAuthority` / `deactivateGovtForAuthority` / `resetInstitutionalCredentialsForAuthority` / `assignGovtLocalityForAuthority` :37-75 | **NONE** — raw `(actorUserId, input)`, `ForAuthority`-pattern, delegated-to below | `targetAdminUserId`/`targetGovtUserId`/`targetUserId` | NONE VISIBLE in this file | none in this file |
| `createInstitutionalAccountAction` :81 | `requireAdminOrRedirect()` | none (creates new account) | N/A | none in this file |
| `deactivateAdminAction` :96 | `requireAdminOrRedirect()` | `targetAdminUserId` | Role-based only; target forwarded raw ⚠ | none in this file |
| `deactivateGovtAction` :110 | `requireAdminOrRedirect()` | `targetGovtUserId` | Same ⚠ | none in this file |
| `resetInstitutionalCredentialsAction` :124 | `requireAdminOrRedirect()` | `targetUserId` | Same ⚠ | none in this file |
| `assignGovtLocalityAction` :132 | `requireAdminOrRedirect()` | `targetUserId` | Same ⚠ | none in this file |

## app/actions/upgrade.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `requestVetUpgradeForUser` / `createOrganizationForUser` :44,51 | **NONE** — raw `(userId, input)`, `ForUser`-pattern, delegated-to below | none (creates new) | N/A | none in this file |
| `requestVetUpgradeAction` :62 | `supabase.auth.getUser()` + null check | none | N/A (self-scoped) | none in this file |
| `createOrganizationAction` :94 | `supabase.auth.getUser()` + null check | none | N/A (creates new org) | none in this file |
| `createClinicAction` :136 | `supabase.auth.getUser()` + null check | `result.organizationId` (returned from own create call, not caller input) | N/A — reads back the org it just created: `.where(eq(organizations.id, result.organizationId))` :171 | `organizations` (via `_createOrg`, not directly in this file) |

## app/actions/return-to-owner-form.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| all 5 (`actorCancelProposalFormAction`, `ownerAcceptReturnFormAction`, `ownerProposeReturnToOrgFormAction`, `ownerRejectReturnFormAction`, `proposeReturnToOwnerFormAction`) :27-59 | `@no-auth-required` per-function comments naming the guard inside the delegated form-adapter (`requireUserOrRedirect` / `requireOrgAccessByToken` depending on `actorMode`) — spread args | opaque (spread) | NONE VISIBLE in this file | none in this file |

## app/actions/alert-firings.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `evaluateAndRecordFiringsForAllAdmins` :45 | `@no-auth-required`: "cron/internal writer — invoked by the CRON_SECRET-gated /api/cron/evaluate-alerts route" | none | N/A | none in this file |
| `recordFiringsForUser` :51 | **NONE visible** — spread args, no `@no-auth-required` annotation despite being unguarded ⚠ | opaque | NONE VISIBLE | none in this file |
| `acknowledgeFiringAction` / `openInvestigationFiringAction` / `registerFollowupFiringAction` / `contactAuthorityFiringAction` / `resolveFiringAction` / `dismissFiringAction` :84-144 | local `requireAdminUser()` → `auth.getUser()` + role check `profile.role !== "admin"` :59-77 | `firingId` (all six) | Role-based only (admin, global); `firingId` forwarded raw with no per-request scope check in this file ⚠ | none in this file |

## app/actions/alert-subscriptions.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `createAlertSubscriptionForUser` / `deleteAlertSubscriptionForUser` / `toggleAlertSubscriptionForUser` :34-49 | **NONE** — raw spread args, `ForUser`-pattern, delegated-to below | `id` (subscription id) | NONE VISIBLE in this file | none in this file |
| `createAlertSubscriptionAction` :83 | local `requireAdminUser()` (role check `profile.role !== "admin"`, :56-77) | none (creates new) | N/A | none in this file |
| `deleteAlertSubscriptionAction` :105 | same `requireAdminUser()` | `id` (form field) | Role-based only; `id` forwarded raw to `_deleteAlertSubscriptionForUser(auth.userId, id)`, no ownership check in this file ⚠ | none in this file |
| `toggleAlertSubscriptionAction` :116 | same `requireAdminUser()` | `id` (form field) | Same pattern ⚠ | none in this file |

## app/actions/admin-revocations.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `claimAttachmentsForAudit` :38 | **NONE** visible — spread args, utility re-export | opaque | NONE VISIBLE | none in this file |
| `revokeVetRoleForAuthority` / `revokeOrgVerificationForAuthority` / `revokeGovtLocalityForAuthority` :48-82 | **NONE** — raw `(actorUserId, input)`, `ForAuthority`-pattern, delegated-to below | `targetUserId`/`organizationId`/`govtAssignmentId` | NONE VISIBLE in this file | none in this file |
| `revokeVetRoleAction` :88 | `requireAdminOrGovtOrRedirect()` | `targetUserId` | Role-based only; forwarded raw ⚠ | none in this file |
| `revokeOrgVerificationAction` :105 | `requireAdminOrGovtOrRedirect()` | `organizationId` | Same ⚠ | none in this file |
| `revokeGovtLocalityAction` :122 | `requireAdminOrGovtOrRedirect()` | `govtAssignmentId` | Same ⚠ | none in this file |

## app/actions/admin-proposals.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `logPiiQueryForAuthority` :39 | **NONE** — raw `(actorUserId, ...)` | none (logging only) | N/A | none in this file |
| `logPiiReadSafely` :52 | `@no-auth-required`: "only callers are /gob list pages already gated by the /gob layout guard" | none | N/A | none in this file |
| `proposeVetUpgradeForUser` / `proposeOrgVerificationForOrg` :61,76 | **NONE** — raw `(actorUserId, input)`, `ForUser/ForOrg`-pattern, delegated-to below | `targetUserId` / `organizationId` | NONE VISIBLE in this file | none in this file |
| `proposeVetUpgradeAction` :87 | `requireAdminOrGovtOrRedirect()` | `targetUserId` (in `input`) | Role-based only; forwarded raw ⚠ | none in this file |
| `proposeOrgVerificationAction` :104 | `requireAdminOrGovtOrRedirect()` | `organizationId` (in `input`) | Same ⚠ | none in this file |
| `logPiiQueryAction` :121 | `requireAdminOrGovtOrRedirect()` | none | N/A (logging own query) | none in this file |

## app/actions/tattoo.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `createTattooForUser` :50 | **NONE** — raw `(petId, userId, ...)`, `ForUser`-pattern, delegated-to below | `petId` | NONE VISIBLE | none in this file |
| `createTattooAction` :79 | `requireAlivePetAccess(publicToken)` | `publicToken` | Scoped — `pet.id`/`user.id` from validated access | none in this file (delegated) |

## app/actions/business-rules.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `createBusinessRuleWriter` / `updateBusinessRuleWriter` / `deleteBusinessRuleWriter` :53-69 | **NONE** — raw params, `Writer`-pattern, delegated-to below | `ruleId` (update/delete) | NONE VISIBLE | none in this file |
| `createBusinessRuleAction` :117 | `requireAdminOrRedirect()` | none (creates new) | N/A | none in this file |
| `updateBusinessRuleAction` :154 | `requireAdminOrRedirect()` | `ruleId` | Role-based only; `ruleId` forwarded raw to `_updateBusinessRuleWriter`, no local WHERE clause ⚠ | none in this file |
| `deleteBusinessRuleAction` :186 | `requireAdminOrRedirect()` | `ruleId` | Same pattern ⚠ | none in this file |

## app/actions/libreta-share.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `createLibretaShareForUser` / `revokeLibretaShareForUser` / `logLibretaShareViewForToken` :48-67 | **NONE** — raw args, `ForUser`-pattern (create/revoke), delegated-to below | `shareTokenRowId` (revoke) | NONE VISIBLE | none in this file |
| `createLibretaShareAction` :73 | `supabase.auth.getUser()` + null check | `petPublicToken` (in `input`) | NONE VISIBLE in this file — `user.id` passed, pet-ownership check delegated ⚠ | none in this file |
| `revokeLibretaShareAction` :89 | `supabase.auth.getUser()` + null check | `shareTokenRowId` | NONE VISIBLE in this file — `user.id` + `shareTokenRowId` both forwarded, ownership check delegated ⚠ | none in this file |
| `logLibretaShareViewAction` :109 | `@no-auth-required`: "viewer telemetry from a public share link. The token itself is the credential" | `shareToken` | N/A — token-as-credential is the intended design | none in this file |
| `getActiveLibretaSharesAction` :127 | `requirePetAccess(petPublicToken)` + explicit `accessPath !== "owner"` → early-returns empty | `petPublicToken` | Scoped — owner-only enforced inline | none (read-only) |

## app/actions/service-offerings.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `createServiceOfferingForOrg` / `approveServiceOfferingForAuthority` / `rejectServiceOfferingForAuthority` / `updateOfferingCapacityWriter` :52-102 | **NONE** — raw params, comment: "No auth logic — callers are trusted (server-side only)"; `ForOrg/ForAuthority/Writer`-patterns, delegated-to below | `orgId`, `publicToken`, `offeringId` | NONE VISIBLE | none in this file |
| `createServiceOfferingAction` :108 | `requireCapability("service_offering.create")` | none (creates new) | Scoped — `organization` from capability resolution | none in this file |
| `approveServiceOfferingAction` :171 | `supabase.auth.getUser()` + role check `profile.role !== "admin" && !== "govt"` | `publicToken` | Role-based only; `publicToken` forwarded raw to `approveServiceOfferingForAuthorityUC`, no local WHERE clause ⚠ | none in this file |
| `pauseServiceOfferingAction` :204 | `requireCapability("service_offering.create")` + explicit `organization.publicToken !== orgToken` check | `orgToken`, `publicToken` (offering) | `orgToken` scoped inline; `organization.id` passed to use-case alongside offering `publicToken` — WHERE clause combining both not visible in this file | none in this file |
| `unpauseServiceOfferingAction` :225 | same pattern as pause | same | Same | none in this file |
| `archiveServiceOfferingAction` :246 | same pattern | same | Same | none in this file |
| `rejectServiceOfferingAction` :267 | `supabase.auth.getUser()` + role check (mirrors approve) | `publicToken` | Same as approve ⚠ | none in this file |
| `updateOfferingCapacityAction` :306 | `requireCapability("service_offering.create")` + explicit `organization.publicToken !== orgToken` check | `orgToken`, `offeringPublicToken` | **Good example** — `.where(and(eq(serviceOfferings.publicToken, offeringPublicToken), eq(serviceOfferings.organizationId, organization.id)))` :323-327 | none in this file (delegates to writer) |

## app/actions/return-to-owner.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `proposeReturnToOwnerAction` :51 | branches: refugio → `requireOrgAccessByToken(orgToken)` + `custody.transfer` capability check; vecino → `requireUserOrRedirect()` | `petPublicToken`, `orgToken` | Scoped per branch | none in this file (delegated) |
| `proposeReturnAsRefugioWriter` / `proposeReturnAsVecinoWriter` :89,102 | **NONE** — raw args, `Writer`-pattern, delegated-to by action above | `petPublicToken` | NONE VISIBLE | none in this file |
| `ownerAcceptReturnAction` :114 | `requireUserOrRedirect()` | `petPublicToken` | NONE VISIBLE in this file — forwarded raw to `ownerAcceptReturnWriter` | none in this file |
| `ownerAcceptReturnWriter` :123 | **NONE** — `Writer`-pattern | `petPublicToken` | NONE VISIBLE | none in this file |
| `ownerRejectReturnAction` :134 | `requireUserOrRedirect()` | `petPublicToken` | NONE VISIBLE in this file | none in this file |
| `actorCancelProposalAction` :161 | `requireUserOrRedirect()`, and if `orgToken` given also `requireOrgAccessByToken(orgToken)` | `petPublicToken`, `orgToken` | `orgToken` scoped when present; `petPublicToken` forwarded raw | none in this file |
| `fetchPendingReturnProposalForOwner` :199 | `@no-auth-required`: "callers must have pre-authorized the owner context" | `petId`, `ownerUserId` | NONE VISIBLE in this file — trusts caller ⚠ | none (read-only) |
| `fetchPendingOwnerReturnProposalForOrg` :222 | `@no-auth-required`: "callers must have pre-authorized org context" | `petId`, `orgId` | NONE VISIBLE in this file ⚠ | none (read-only) |
| `ownerProposeReturnToOrgAction` :233 | `requireUserOrRedirect()` | `petPublicToken` | Explicit ownership query: `.where(and(eq(ownerships.petId, petRow.id), eq(ownerships.ownerUserId, user.id), isNull(ownerships.endedAt)))` :256-262 — scoped | none in this file |
| `orgAcceptOwnerReturnAction` :296 | `requireOrgAccessByToken(orgToken)` + `custody.transfer` capability check | `orgToken`, `petPublicToken` | `orgToken` scoped by guard; `petPublicToken` forwarded raw | none in this file |
| `orgRejectOwnerReturnAction` :333 | same pattern | same | Same | none in this file |
| `loadProposalContext` :376 | `@no-auth-required`: "read-only context loader. The calling page must auth-gate...before calling this" | `petId` | NONE VISIBLE in this file — trusts caller ⚠ | none (read-only) |

## app/actions/decomiso.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `resolveGovtOrgForUser` :83 | **NONE** — directly exported, no guard, no `@no-auth-required` annotation ⚠ | `userId` | NONE VISIBLE — raw lookup by caller-supplied `userId`, callable as a server action by any importer | none (read-only) |
| `executeDecomisoAction` :114 | `requireDecomisoPrincipal()` | `petPublicToken`, `intendedReceiverOrganizationId` | Explicit jurisdiction check :191-197 (`session.jurisdictions.some((j) => j.province === petProvince)`) for govt role | `attachments` (via Storage), `notifications`, plus event/case rows via `executeDecomiso` use-case in tx |
| `acceptDecomisoHandoffAction` :315 | resolve org by token → `requireCapability("org.transfer.accept", receiverOrgByToken.id)` + explicit `organization.publicToken !== input.receiverOrgToken` re-check | `receiverOrgToken`, `casePublicCode` | **Good example** — capability pinned to the specific org id resolved from the token, plus defense-in-depth re-check | `notifications` (via `acceptDecomisoHandoffInTx`) |
| `rejectDecomisoHandoffAction` :383 | same pattern as accept | same | Same | `notifications` |
| `reassignDecomisoToAnotherReceiverAction` :451 | `requireDecomisoPrincipal()` | `casePublicCode`, `newReceiverOrgId` | **Good example** — explicit `caseRow.openedByOrganizationId !== govtOrg.id` check :493 | `notifications` |

---

## src/modules/pets/actions.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `createPetAction` :79 | `supabase.auth.getUser()` + null check | none (creates new pet) | N/A | pets (via `registerPet` use-case, not directly in this file) |
| `updatePetAction` :222 | `requirePetAccess(publicToken)` | `publicToken` | Scoped — `existingPet` from validated access, `existingPet.id` passed to use-case | pets (via `updatePet` use-case) |

## src/modules/adoption/actions.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `setAdoptionEligibilityAction` :73 | `requireCapability("intake.create")` (no explicit orgId — defaults to session's active org) | `petPublicToken` | NONE VISIBLE in this file — pet-to-org scoping delegated to `setAdoptionEligibility` use-case ⚠ | none in this file |
| `setAdoptionListingStatusAction` :113 | `requireCapability("adoption.listing.manage")` (no orgId) | `petPublicToken` | Same pattern ⚠ | none in this file |
| `updateAdoptionListingContentAction` :159 | `requireCapability("adoption.listing.manage")` (no orgId) | `petPublicToken` | Same pattern ⚠ | none in this file |
| `submitAdoptionApplicationAction` :214 | `supabase.auth.getUser()`, **no null check** (comment: "auth is checked inside the use-case (applicant=null means no session)") | `petPublicToken` | N/A — intentionally public/anonymous-capable action | none in this file |
| `withdrawAdoptionApplicationAction` :275 | `supabase.auth.getUser()`, no null check (same pattern) | `applicationEventId` | NONE VISIBLE in this file — `applicant: user?{userId}:null` passed, ownership check delegated to use-case ⚠ | none in this file |
| `approveAdoptionApplicationAction` :310 | `requireCapability("adoption.review")` + explicit `organization.publicToken !== orgToken` check | `orgToken`, `applicationEventId` | `orgToken` scoped inline; `applicationEventId`→org match not visible in this file (delegated to use-case with `organization` context) | none in this file |
| `rejectAdoptionApplicationAction` :346 | same pattern as approve | same | Same | none in this file |
| `requestInfoAdoptionApplicationAction` :391 | `requireCapability("adoption.review")` + explicit `organization.publicToken !== orgToken` check | `orgToken`, `applicationEventId` | **Good example** — `AdoptionRepository.findApplicationForReview(input.applicationEventId, organization.id)` :413-416 | `case_events`-style intervention note via `insertInfoRequestedNote` |
| `finalizeAdoptionAction` :474 | `requireCapability("adoption.finalize")` — **unlike its siblings, does NOT check `organization.publicToken !== orgToken`** | `orgToken`, `publicToken` (pet) | `orgToken` URL param is never cross-checked against the capability-resolved organization in this file ⚠ (inconsistent with `approveAdoptionApplicationAction`/`rejectAdoptionApplicationAction`/`requestInfoAdoptionApplicationAction` in the same file, which all have the explicit check) | none in this file (delegated) |

## src/modules/surveillance/actions.ts

File has an explicit "AUTH SCOPE CONTRACT" header comment mapping each action to its guard — reproduced per-row below.

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `reportBiteAction` :88 | `requireAlivePetAccess(publicToken)` | `publicToken` | Scoped — `pet`/`user` from validated access | none in this file (delegated to `reportBite` use-case) |
| `ownerCloseRabiesObservationAction` :201 | `requireAlivePetAccess(publicToken)` | `publicToken` | Scoped, same pattern | none in this file |
| `reportBiteFromOrgAction` :239 | `requireCapability("bite.report")` | `orgToken`, `petPublicTokenRaw` (form field) | `orgToken` scoped by capability; pet resolved by `repo.findPetByToken(petPublicTokenRaw)` with **no org-ownership check on the pet itself in this file** ⚠ | none in this file |
| `professionalCloseRabiesObservationAction` :370 | `requireAdminOrGovtOrRedirect()` | `petPublicToken` | Jurisdiction scoping delegated to `professionalCloseObservation` use-case per file header comment ("govt scoped to jurisdiction in use-case") — not visible in this file | none in this file |
| `openOutbreakInvestigationAction` / `addInvestigationNoteAction` / `escalateInvestigationAction` / `closeInvestigationAction` :469-557 | `requireAdminOrGovtOrRedirect()` (all four) | `casePublicCode` (last three) | Jurisdiction scoping ("isInScope") delegated to each use-case per file header comment — not visible in this file ⚠ | audit_log rows (inside use-case tx, per comment) |

## src/modules/foster/actions.ts

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `assignFosterAction` :70 | `requireCapability("foster.assign")` — **no orgId arg**, defaults to session's own active org; `orgToken` URL param never compared against `organization.publicToken` ⚠ | `orgToken`, `publicToken` (pet) | NONE VISIBLE in this file — `orgToken` param is dead weight for authz, only used in the redirect path | none in this file |
| `endFosterAction` :107 | Same pattern as `assignFosterAction` ⚠ | `orgToken`, `publicToken` | Same gap | none in this file |
| `proposeFosterAction` :150 | `requireCapability("foster.assign")` — comment claims "org is resolved from the orgToken before calling" but the code does **not** do this; `input.orgToken` unused for scoping ⚠ | `orgToken` (in `input`, unused), `petPublicToken`, `volunteerUserId` | NONE VISIBLE — comment/code mismatch | none in this file |
| `cancelFosterProposalAction` :195 | **Documented fix (spec R6)** — loads proposal first, then `requireCapability("foster.assign", proposal.organizationId)` pinned to the proposal's own org | `proposalPublicToken` | **Good example** — `FosterRepository.findProposalByToken` first, capability then pinned to `proposal.organizationId` :199-204 | none in this file |
| `acceptFosterProposalAction` / `rejectFosterProposalAction` :243,289 | `supabase.auth.getUser()` + null check | `proposalPublicToken` | NONE VISIBLE in this file — ownership check delegated to use-case | none in this file |
| `expireFosterProposalsAction` :330 | `@no-auth-required`: "cron/system path — auth enforced at the /api/cron/expire-foster-proposals route via authorizeCronRequest (CRON_SECRET)" | none | N/A | none in this file |
| `upsertFosterVolunteerAction` / `withdrawFosterVolunteerAction` / `setCoFosterAllowedAction` :344,371,401 | `supabase.auth.getUser()` + null check (all three) | `fosterOwnershipId` (last one) | NONE VISIBLE in this file — forwarded raw to use-case ⚠ | none in this file |
| `searchFosterVolunteers` :448 | `requireCapability("foster.assign")` | `petPublicToken` (optional, in `input`) | `auth.organization.id` passed to `findShelterPetByToken` — scoped | none (read-only) |
| `convertFosterToOwnerAction` :500 | `supabase.auth.getUser()` + null check | `petPublicToken` | NONE VISIBLE in this file — comment claims "enforced server-side via FosterRepository.findActiveFosterByUser" (in the use-case, not this file) | none in this file |
| `sendRehomeRequestAction` :537 | `supabase.auth.getUser()` + null check | `petPublicToken`, `targetOrgId` | NONE VISIBLE in this file — comment claims "session user must be the active foster of the pet" (enforced in use-case) | none in this file |

## src/modules/transfers/actions.ts

File has an explicit "Auth-scope contract (CRITICAL — foster cross-org auth bypass was caught here)" header comment.

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `initiatePetTransferAction` :92 | `requireUserOrRedirect()` | `petToken` | NONE VISIBLE in this file — ownership check delegated to `initiatePetTransfer` use-case (per header: "scope to the USER") | `audit_log` (via `flushAuditLog`) |
| `acceptPetTransferAction` :162 | `requireUserOrRedirect()` | `transferToken` | Recipient id-or-email match delegated to use-case (per header comment) — not visible in this file | `audit_log` |
| `rejectPetTransferAction` :215 | `requireUserOrRedirect()` | `transferToken` | Same as accept | `audit_log` |
| `cancelPetTransferAction` :258 | `requireUserOrRedirect()` | `transferToken` | Sender-only check delegated to use-case per header comment | `audit_log` |
| `getTransferForViewerAction` :321 | `requireUserOrRedirect()` | `transferToken` | Sender-or-recipient match delegated to `getTransferForViewer` use-case, called explicitly before the unguarded `findTransferViewByToken` read :331-339 | none (read-only) |
| `expirePetTransfersAction` :370 | `@no-auth-required`: "cron/system path — auth enforced at the /api/cron/expire-pet-transfers route via authorizeCronRequest (CRON_SECRET)" | none | N/A | `audit_log` (per expired row) |
| `proposeCrossOrgTransferAction` :407 | `requireCapability("org.transfer.propose")` (no orgId — session's active org) | `senderOrgToken`, `receiverOrgId`, `petPublicToken` | NONE VISIBLE in this file — `senderOrgToken` not cross-checked against `organization.publicToken` ⚠ | `audit_log` |
| `acceptCrossOrgTransferAction` :456 | `requireCapability("org.transfer.accept")` (no orgId) — header comment: "CRITICAL: receiver auth is the case's receiverOrganizationId column, NOT bare cap" | `receiverOrgToken`, `casePublicCode` | Documented as scoped to `case.receiverOrganizationId` inside `acceptCrossOrgTransfer` use-case — not visible in this file | `audit_log` |
| `rejectCrossOrgTransferAction` :501 | `requireCapability("org.transfer.accept")` (no orgId) | `receiverOrgToken`, `casePublicCode` | Same as accept, delegated | `audit_log` |
| `cancelCrossOrgTransferAction` :551 | `requireCapability("org.transfer.propose")` (no orgId) | `senderOrgToken`, `casePublicCode` | Documented as scoped to `case.openedByOrganizationId` inside use-case — not visible in this file | `audit_log` |
| `transferCustodyAction` :607 | `requireCapability("custody.transfer")` (no orgId) | `orgToken`, `publicToken` (pet), `destinationOrgId` | Header comment: "pet ownership row MUST match caller's active organization.id — enforced by repo.findPetUnderOrg scoped to organization.id in use-case" — not visible in this file | none in this file |

## src/modules/organizations/actions.ts

File has an explicit "AUTH SCOPE CONTRACT (CRITICAL — foster cross-org bypass lesson)" header comment.

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `updateOrganizationAction` :118 | `requireOrgAccessByToken(orgToken)` | `orgToken` | Scoped — `user.id` + `orgToken` passed to use-case | none in this file (delegated) |
| `updateOrganizationForUser` :187 | **NONE** — raw `(userId, orgToken, input)`, `ForUser`-pattern; **not delegated-to by any other action in this file** (kept only "for shim compat") — directly exported and reachable ⚠ | `orgToken` | NONE VISIBLE in this file | none in this file |
| `removeMemberAction` :224 | `requireCapability("member.invite", input.organizationId)` | `organizationId`, `membershipId` | `organizationId` pinned explicitly (correct pattern — capability call takes the target org, not the session default) | none in this file (delegated) |
| `changeMemberRoleAction` :266 | `requireCapability("member.invite", input.organizationId)` | `organizationId`, `membershipId` | Same correct pattern; `membershipId`→org match delegated to `changeOrganizationMemberRole` use-case | none in this file |
| `setMemberEventWriteAction` :305 | `requireCapability("member.invite", input.organizationId)` | `organizationId`, `membershipId` | Same pattern | none in this file |
| `leaveOrganizationAction` :341 | `supabase.auth.getUser()` + null check | `organizationId` | NONE VISIBLE in this file — `user.id` + `organizationId` forwarded, membership check delegated | none in this file |
| `inviteMemberAction` :384 | `requireCapability("member.invite", input.organizationId)` | `organizationId` | Correct pinned pattern | `organization_invitations` (via use-case) |
| `revokeInvitationAction` :437 | `requireCapability("member.invite", input.organizationId)` | `organizationId`, `invitationToken` | Correct pinned pattern | none in this file |
| `acceptInvitationAction` :466 | `supabase.auth.getUser()` + null check | `invitationToken` | Email-match check delegated to `acceptInvitation` use-case (`userEmail` passed) | none in this file |
| `addCoverageZoneAction` / `removeCoverageZoneAction` / `setPrimaryCoverageZoneAction` :507,546,571 | `requireOrgAccessByToken(input.orgToken)` + `isManagerRole(membership.role)` check | `orgToken`, `coverageId` | `orgToken` scoped by guard; `coverageId`→org match delegated to use-case with `organizationId` passed alongside | none in this file |
| `submitOrgContactAction` :608 | `@no-auth-required`: "public contact/volunteer form served...to unauthenticated visitors; abuse-controlled by IP rate limit" | `orgToken` | N/A — intentionally public | none in this file |
| `requestCapabilityAction` :642 | `supabase.auth.getUser()` + null check | none (uses `getActiveMemberships(user.id)`, takes `memberships[memberships.length-1]` as "active" org) | N/A — acts on caller's own most-recent membership, no cross-user id param | none in this file |
| `decideCapabilityAction` :705 | `supabase.auth.getUser()` + null check, same "most-recent active membership" pattern | `grantId` | NONE VISIBLE in this file — `grantId` forwarded raw to `decideCapability` use-case; whether it verifies `grantId`'s org matches `active.organization.id` is not visible here ⚠ | none in this file |
| `grantCapabilityAction` :772 | `requireCapability("capability.grant", input.organizationId)` | `organizationId`, `membershipId` | Correct pinned pattern | none in this file |

## src/modules/welfare/actions.ts

File has an explicit "AUTH SCOPE CONTRACT" header + two local jurisdiction-scope helpers used consistently: `loadInScopeReport` / `loadAndVerifyScope` (both quoted once, reused across rows below).

Scoping helper (quoted once): `jurisdictions.some((j) => j.province === row.jurisdictionProvince && j.locality === row.jurisdictionLocality)` (:1315-1319 / :1333-1337), applied only when `actor.role === "govt"` (admin is unscoped by design, per header comment).

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `triageWelfareReportAction` :130 | `requireAdminOrGovtOrRedirect()` + `loadInScopeReport(welfareReportId, ...)` | `welfareReportId` | Scoped via jurisdiction helper above (govt only; admin global) | none in this file (delegated) |
| `startWelfareReportAction` :168 | Same pattern | `welfareReportId` | Same | none in this file |
| `closeWelfareReportAction` :200 | Same pattern | `welfareReportId` | Same | none in this file |
| `passWelfareToTriageAction` :235 | `requireAdminOrRedirect()` — admin-ONLY, no jurisdiction check (by design per header: "Govt cannot moderate") | `welfareReportId` | N/A — admin-global by documented design | none in this file |
| `confirmWelfareAsSpamAction` :258 | `requireAdminOrRedirect()` | `welfareReportId` | Same as above | none in this file |
| `assignWelfareToMeAction` / `unassignWelfareAction` :280,302 | `requireAdminOrGovtOrRedirect()` + `loadAndVerifyScope` | `reportId` | Scoped via jurisdiction helper | none in this file |
| `deriveWelfareToOrgAction` :336 | `requireAdminOrGovtOrRedirect()` + `loadAndVerifyScope` | `welfareReportId`, `targetOrgId` | Report scoped via helper; `targetOrgId` verified `verified`+`orgType` in this file :352-369 | `welfare_reports` (update), `notifications`, `repo.insertAudit` (audit log) |
| `takeDerivedReportAction` / `addInterventionNoteAction` / `returnDerivedReportAction` :579,608,637 | local `requireOrgInterventionAccess(orgToken)` :506-556 — membership + verified + role (`admin`/`coordinator`) + orgType restriction, all scoped to `orgToken` | `orgToken`, `welfareReportId` | **Good example** — explicit join query `.where(and(eq(organizations.publicToken, orgToken), eq(organizationMemberships.userId, user.id), isNull(organizationMemberships.leftAt)))` :525-532 | `case_events` (intervention notes) |
| `generateMpfExportAction` :671 | `requireAdminOrGovtOrRedirect()` + `loadAndVerifyScope` | `welfareReportId` | Scoped via jurisdiction helper | none (generates signed export URL) |
| `createWelfareReportAction` :752 | none required — `supabase.auth.getUser()` without null check (public: anon or auth); rate-limited by IP (anon) or userId (auth) | none (creates new) | N/A — intentionally public | `welfare_reports`, `attachments`-style evidence rows |
| `createOrgWelfareReportAction` :1049 | `requireUserOrRedirect()` + explicit org-membership join query scoped to `orgToken` :1057-1076 | `orgToken` | **Good example** — same join pattern as `requireOrgInterventionAccess` | `welfare_reports` |
| `addReporterCommentAction` :1276 | `requireUserOrRedirect()` | `welfareReportId` | Ownership check delegated to `addReporterComment` use-case (`reporterUserId: session.user.id` passed, use-case returns `"forbidden"` error code implying an internal check) — not visible in this file | `case_events` (comment) |

## src/modules/events/actions.ts

File header documents an "AUTH SCOPE MATRIX" per event kind. All medical/clinical/identity actions below use `requireAlivePetAccess(publicToken)` unless noted; `note`/lifecycle actions intentionally use the weaker `requirePetAccess` (allows deceased/lost pets) per documented "PARITY QUIRK".

| action | guards | id params | scoping evidence | tables written |
|---|---|---|---|---|
| `createVaccinationAction` / `createWeightAction` / `createDewormingAction` / `createSterilizationAction` / `createMedicationStartAction` / `createMedicationEndAction` / `createMicrochipAction` / `createDangerousBreedAttestationAction` / `createVetVisitAction` / `createClinicalInfoAction` / `createSymptomObservedAction` :123,200,268,341,409,514,611,685,819,904,1166 | `requireAlivePetAccess(publicToken)` (all eleven) | `publicToken` | Scoped — `pet.id`/`user.id` from validated access, all eleven | `pet_events` (via each use-case, not directly in this file) |
| `markMedicationDoseTakenAction` :583 | `supabase.auth.getUser()` + null check — **NOT `requirePetAccess`** (reminder-keyed by design, per file header: "use-case verifies ownership+alive manually") | `reminderId` | NONE VISIBLE in this file — ownership check delegated to `markMedicationDoseTaken` use-case | none in this file |
| `createNoteAction` :750 | `requirePetAccess(publicToken)` (deliberately weaker than sibling medical actions — documented "PARITY QUIRK: allows deceased/lost pets") | `publicToken` | Scoped, same access pattern as siblings | `pet_events` (via `createNote`) |
| `recordDiseaseDiagnosisAction` :1012 | `requireUserOrRedirect()` + explicit role check `vetProfile.role !== "vet" \|\| !vetProfile.matriculaVerified` :1018-1031 — **documented "NO ownership check" (vet can diagnose any pet)** | `publicToken` (resolved to any pet by token, no ownership tie) | By design: role-scoped (verified vet), not pet-owner-scoped — pet resolved via `.where(eq(pets.publicToken, publicToken))` :1054 with no ownership filter ⚠ (intentional per file header, flagged for the human pass to confirm this matches the vet capability model) | `pet_events` (diagnosis), `eno_processing_queue` (in-tx), `notifications` |
| `setPetLostAction` / `updateLostLastSeenAction` / `setPetFoundAction` / `createDeathRecordAction` :1240,1337,1400,1466 | `requirePetAccess(publicToken)` (all four — accepts non-alive pets, documented intentional) | `publicToken` | Scoped — `pet`/`user` from validated access | `pet_events` (lifecycle events), `notifications` |

---

## Summary

- **Total action functions inventoried** (public actions + noted `ForUser`/`ForAuthority`/`Writer`/`-From-` delegation targets): **≈245** across 66 files (58 `app/actions/*.ts` + 8 `src/modules/**/actions.ts`).
- **Rows marked ⚠** (ID param with no visible caller-scoping in the file itself): **≈70**.
- Recurring shapes behind the ⚠ marks:
  1. **Bare `ForUser`/`ForAuthority`/`Writer` exports** with zero guard in the file, reachable because they are exported from a `"use server"` module (e.g. `withdrawApprovalRequestForUser`, `updateOrganizationForUser`, `replaceMicrochipForUser`, `verifyDniForUser`, `resolveGovtOrgForUser`).
  2. **`requireCapability("x")` called without an explicit `organizationId`**, defaulting to the session's own active-org membership, while a separate `orgToken`/`orgId` URL param is accepted but never cross-checked (`assignFosterAction`, `endFosterAction`, `proposeFosterAction`, `finalizeAdoptionAction`, `proposeCrossOrgTransferAction`, `acceptCrossOrgTransferAction`, `cancelCrossOrgTransferAction`, `transferCustodyAction`) — contrasts with the documented-fixed sibling pattern in `cancelFosterProposalAction` and the correctly-pinned pattern in `src/modules/organizations/actions.ts` (`removeMemberAction`, `grantCapabilityAction`, etc.).
  3. **Resource ID forwarded raw to a delegate** after only a role-level guard (`requireAdminOrRedirect`/`requireAdminOrGovtOrRedirect`), with no local WHERE clause tying the ID to the caller (`firingId` in alert-firings.ts, `ruleId` in business-rules.ts, `organizationId`/`targetUserId` in several admin-* files) — several of these may be intentional (admin/govt is global by policy), but that intent is not verifiable from the action file alone.
- Files with **explicit, well-documented scoping contracts** worth using as a model for the human pass: `src/modules/transfers/actions.ts`, `src/modules/welfare/actions.ts` (jurisdiction helpers), `src/modules/surveillance/actions.ts`, `app/actions/booking.ts` (`bookSlotAction`), `app/actions/service-offerings.ts` (`updateOfferingCapacityAction`), `app/actions/decomiso.ts`.
