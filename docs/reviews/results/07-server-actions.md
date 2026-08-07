**Auth guards (mutations)** — CI `check-authz-guards` passes on `*Action` wrappers; issues are exported inner writers and one cron writer callable from the client.

1. `app/actions/business-rules.ts:53` · `createBusinessRuleWriter`/`updateBusinessRuleWriter`/`deleteBusinessRuleWriter` are client-callable and accept caller-supplied `actorUserId` · **HIGH** · Remove exports; keep only `*Action` wrappers (same pattern as `microchip.ts`).
2. `app/actions/pregnancy.ts:44` · `recordPregnancyStartedWriter`/`recordPregnancyEndedWriter` exported without session guard; forge `pet`/`recordedByUserId` · **HIGH** · Move to plain module; export only `recordPregnancy*Action`.
3. `app/actions/chip-match.ts:76` · `confirmChipMatchAsRefugioWriter` exported; client can forge `auth.user`/`auth.organization` · **HIGH** · Stop exporting writers; only export `confirmChipMatchAction`.
4. `app/actions/booking.ts:37` · `bookSlotWriter` exported; skips ownership check documented on the guarded action · **HIGH** · Unexport; import writer from module in tests only.
5. `app/actions/service-offerings.ts:54` · `updateOfferingCapacityWriter` exported with no auth/org check · **HIGH** · Unexport; gate behind `requireCapability(..., orgId)`.
6. `app/actions/attendance.ts:46` · `markAppointmentAttendedWriter` exported; client supplies `author`/`appointmentId` · **HIGH** · Unexport; keep `markAppointmentAttendedAction` only.
7. `app/actions/slot-materialization.ts:43` · `materializeAllActiveSlots` is a `@no-auth-required` server action (not cron-only); anyone can trigger global slot materialization · **HIGH** · Move to plain module; cron route imports module, not `"use server"` export.
8. `app/actions/chip-match.ts:54` · `requireCapability("intake.create")` omits `orgToken`/`organizationId`; custody attaches to wrong org for multi-org users · **MED** · Resolve org by `orgToken` then `requireCapability("intake.create", org.id)` and assert token match.
9. `app/actions/intake.ts:33` · Same unpinned `requireCapability("intake.create")`; `orgToken` never cross-checked against resolved org · **MED** · Pin capability to org resolved from `orgToken` before `createIntake`.
10. `app/actions/schedule-rules.ts:47` · `requireCapability("service_offering.create")` unpinned (same multi-org ambiguity) · **MED** · Pass `organization.id` from form `orgToken` lookup into `requireCapability`.
11. `app/actions/service-offerings.ts:69` · Same unpinned `requireCapability("service_offering.create")` on all lifecycle actions · **MED** · Pin to org from session context / explicit `orgToken`.
12. `app/actions/admin-revocations.ts:42` · `claimAttachmentsForAudit` exported without guard (utility with `actorUserId` param) · **MED** · Remove from `"use server"` file; import from `revocations/helpers` only.

**Zod / input validation at action boundary**

13. `app/actions/upgrade.ts:93` · `orgType` cast to enum without parse at action boundary · **MED** · `z.enum([...]).safeParse(orgType)` before `_createOrg`.
14. `app/actions/alert-subscriptions.ts:72` · `metricKey`/`direction` cast from FormData; Zod only in use-case · **LOW** · Parse with `CreateAlertSubscriptionSchema` in the action before DB delegate.

*(Most other actions defer validation to use-cases with Zod/manual checks — convention, not uniformly at the shim.)*

**Validated insert boundary (`validatedEventValues`)**

15. `app/actions/scans.ts:26` → `src/modules/pets/application/scans/log-scan.ts:119` · Direct `db.insert(petEvents)` uses `validateEventPayload` but skips repo `validatedEventValues` last-mile guard · **LOW** · Route through `EventsRepository.insertEvent` or call `validatedEventValues` before insert.

*(No other `app/actions/**` paths insert `pet_events` directly.)*

**`revalidatePath` / `redirect`**

16. `app/actions/tattoo.ts:127` · Success uses `redirect()` — known Next 15.5 silent client drop (see `lib/ui/full-page-action-nav.ts`) · **MED** · Return `{ redirectTo }` + client `navigateAfterActionSuccess`.
17. `app/actions/pregnancy.ts:97` · Same `redirect()` on success · **MED** · Same `redirectTo` contract as `business-rules.ts`.
18. `app/actions/booking.ts:72` · Same `redirect()` after booking · **MED** · Return `{ redirectTo: \`/mis-turnos/${token}\` }`.
19. `app/actions/upgrade.ts:116` · Same `redirect()` after org create · **MED** · Return `redirectTo` instead of `redirect()`.
20. `app/actions/service-offerings.ts:125` · Same `redirect()` after offering create · **MED** · Return `redirectTo`.
21. `app/actions/tattoo.ts:127` · No `revalidatePath` before redirect on pet profile mutation · **LOW** · Add `revalidatePath(\`/mis-mascotas/${publicToken}\`)` or rely on full reload via `redirectTo`.
22. `app/actions/upgrade.ts:115` · `revalidatePath("/cuenta/upgrade")` on generic org create (wrong surface) · **LOW** · Revalidate `/cuenta/crear-consultorio` or `/cuenta` based on entry route.

*(No `redirect()` inside `try/catch` that swallows `NEXT_REDIRECT` in scoped files.)*

**Uniform error shape (throws vs `{ error }`)**

23. `app/actions/reactivate-lost-search.ts:14` · Throws raw `Error` on auth/validation failure · **MED** · Return `{ ok: false, error: string }`.
24. `app/actions/tier2-public.ts:20` · Throws on `requirePetAccess` failure · **MED** · Return typed error object consumed by UI.
25. `app/actions/lost-mode.ts:20` · Throws on access failure · **MED** · Return `{ error }` instead of throw.
26. `app/actions/notifications.ts:27` · `requireUser()` throws `"Sesión expirada"` · **MED** · Return `{ error }` from each action.
27. `app/actions/reminders.ts:47` · `deleteVaccineReminderAction` throws while sibling actions return `{ error }` · **MED** · Align on `{ error: "No autorizado." }`.
28. `app/actions/alert-subscriptions.ts:89` · `deleteAlertSubscriptionAction`/`toggleAlertSubscriptionAction` silently return on auth/validation failure · **MED** · Return `{ error: string }` like `createAlertSubscriptionAction`.

**Client-supplied id/role/jurisdiction without server re-derive**

29. `app/actions/business-rules.ts:129` · `normalizeJurisdiction(formData)` trusts client province/locality for redirect target (not DB rule row) · **LOW** · Re-read jurisdiction from inserted/updated row for `redirectTo`.
30. `app/actions/chip-match.ts:56` · Passes client `orgToken` into writer that never validates it against `auth.organization` · **MED** · Assert `organization.publicToken === orgToken` before delegate.

---

**Clean**
- `lib/**/*.ts` exported `"use server"` modules: **clean** (none; only comments reference the directive).
- Unguarded `*ForUser`/`*ForAuthority`/`*ForOrg` exports: **clean** (linter + test sweep pass).
- Operator routes (`app/admin`, `app/gob`) institutional guard pairing: **clean**.
