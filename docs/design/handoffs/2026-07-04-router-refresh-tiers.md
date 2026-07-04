## Ground truth

| Field | Value |
|---|---|
| Branch | `integration/all-20260703` (`git -C C:/dev/dim branch --show-current`) |
| HEAD | `84d36b89` (`git -C C:/dev/dim rev-parse --short HEAD`) |

## Count check

| Metric | Command | Count |
|---|---|---|
| Production files (task glob) | `rg -l "router\.refresh\(" app components src --glob "!**/__tests__/**" --glob "!**/*.test.*" \| wc -l` | **51** |
| All `.ts`/`.tsx` incl. tests | `rg -l "router\.refresh\(" app components src --glob "*.{tsx,ts}" \| wc -l` | **53** |
| Production `.ts`/`.tsx` | `rg -l "router\.refresh\(" app components src --glob "*.{tsx,ts}" \| rg -v "__tests__\|\.test\." \| wc -l` | **51** |
| Runtime call sites `router.refresh()` | `rg "router\.refresh\(\)" app components src --glob "!**/__tests__/**" --glob "!**/*.test.*" \| wc -l` | **70** |
| Comment-only matches (no runtime call) | manual read of 51 files | **3** |
| Files with ≥1 runtime call | 51 − 3 | **48** |

**Delta vs nav-QOL audit (~53):** audit used `rg -l 'router.refresh(' --glob '*.{tsx,ts}'` → **53** total; **2** are test files (`MisTurnosSheetMounter.test.tsx`, `EmergencyContactSheet.interaction.test.tsx`). Production = **51**. Audit’s “~50” is rounded; this inventory is **exact**.

---

## Tier summary

| Tier | Files | Runtime calls | Replacement pattern |
|---|---|---|---|
| **A** — queue/bulk or full SSR state change | 38 | 65 | `window.location.assign(...)` / `navigateAfterActionSuccess()` / `closeSheetNavWithFullReload()` |
| **B** — inline toggle/select; local state sufficient | 10 | 5 | Optimistic `setState`; revert in `catch`/error branch; drop `refresh` |
| **C** — already safe / doc-only | 3 | 0 | Leave as-is (comments documenting the ban) |

---

## Classification table

### Owner — `app/(app)/`

#### Tier A

| File | Purpose | Preceding mutation | Replacement recipe |
|---|---|---|---|
| `cuenta/privacidad/PrivacyActions.tsx` | Ley 25.326 erase account | `eraseMySubjectDataAction` | `window.location.assign("/")` only — drop `router.refresh()` after `push` |
| `cuenta/ofrecerme-como-transito/FosterVolunteerWizard.tsx` | Foster volunteer pool wizard | `upsertFosterVolunteerAction` / `withdrawFosterVolunteerAction` | `window.location.assign(window.location.pathname)` |
| `cuenta/solicitudes/WithdrawButton.tsx` | Withdraw pending approval request | `withdrawApprovalRequestAction` | `window.location.assign(window.location.href)` or optimistic row removal |
| `cuenta/transitos/propuestas/[proposalToken]/ProposalActions.tsx` | Accept/reject foster proposal | `acceptFosterProposalAction` / `rejectFosterProposalAction` | Reject: `assign(same URL)`; accept: drop refresh (SuccessScreen is local) |
| `cuenta/memberships/LeaveMembershipButton.tsx` | Leave org from `/cuenta` | `leaveOrganizationAction` | `assign(window.location.href)` or optimistic list splice |
| `inicio/_components/ReminderActions.tsx` | Dashboard reminder snooze | `snoozeReminderAction` | See Tier B — misclassified if kept in A only for dashboard SSR |
| `mis-mascotas/[publicToken]/eventos/[eventId]/AmendEventForm.tsx` | Event amendment dialog | `amendEventAction` | `closeSheetNavWithFullReload(eventPageUrl)` or `assign` same event URL |
| `mis-mascotas/[publicToken]/asistencia/ServiceDogForm.tsx` | Service-dog credential form | `upsertServiceDogAction` / verification / visibility / `retireServiceDogAction` | `assign(same URL)` — public banner SSR must reload |
| `mis-mascotas/[publicToken]/_transfer/TransferSenderForm.tsx` | Initiate pet transfer (sheet) | `initiatePetTransferAction` | `navigateAfterActionSuccess(\`/transferencias/${token}\`)` |
| `mis-mascotas/[publicToken]/_components/ConvertFosterButton.tsx` | Foster→owner conversion | `convertFosterToOwnerAction` | `navigateAfterActionSuccess(result.redirectPath)` — drop paired `refresh` |
| `mis-mascotas/postulaciones/WithdrawApplicationButton.tsx` | Withdraw adoption application | `withdrawAdoptApplicationAction` | `assign(window.location.href)` or optimistic row hide |
| `transferencias/[transferToken]/AcceptTransferActions.tsx` | Accept/reject/cancel transfer | `acceptPetTransferAction` / `rejectPetTransferAction` / `cancelPetTransferAction` | Accept: `navigateAfterActionSuccess(\`/mis-mascotas/${petToken}\`)`; reject/cancel: `assign(same URL)` |

#### Tier B

| File | Purpose | Preceding mutation | Replacement recipe |
|---|---|---|---|
| `inicio/_components/ReminderActions.tsx` | Dashboard reminder snooze | `snoozeReminderAction` | Keep optimistic `setHidden(true)`; drop `refresh` on success |
| `cuenta/transitos/activos/CoFosterToggle.tsx` | Co-foster opt-in toggle | `setCoFosterAllowedAction` | Keep `setCurrent(value)`; revert on error — no navigation |

#### Tier C

| File | Purpose | Preceding mutation | Replacement recipe |
|---|---|---|---|
| `mis-mascotas/[publicToken]/SheetMounter.tsx` | Sheet host (emergencia) | — | Comment only; live path uses `closeSheetNavWithFullReload()` |
| `mis-turnos/[appointmentToken]/MisTurnosSheetMounter.tsx` | Turn cancel sheet | — | Comment only; live path uses `closeSheetNavWithFullReload()` |

---

### Org — `app/org/[orgToken]/`

#### Tier A

| File | Purpose | Preceding mutation | Replacement recipe |
|---|---|---|---|
| `mascotas/OrgMascotasBulkList.tsx` | Bulk vaccinate / eligibility / listing | `bulkVaccinateAction` / `bulkSetEligibilityAction` / `bulkPublishListingAction` | `assign(window.location.href)` after bulk success |
| `mascotas/[publicToken]/adoptar/AdoptionListingForm.tsx` | Adoption listing wizard | `setAdoptionListingStatusAction` / `updateAdoptionListingContentAction` | `assign(same URL)` |
| `mascotas/[publicToken]/eligibility/EligibilityForm.tsx` | Adoption eligibility form | `setAdoptionEligibilityAction` | `assign(same URL)` |
| `mascotas/[publicToken]/OwnerReturnProposalCard.tsx` | Accept/reject owner return | `orgAcceptOwnerReturnAction` / `orgRejectOwnerReturnAction` | See Tier B — local `done` already set |
| `transferencias/recibidas/DecomisoHandoffActions.tsx` | Decomiso custody handoff | `acceptDecomisoHandoffAction` / `rejectDecomisoHandoffAction` | `assign(window.location.href)` |
| `voluntarios/VolunteerRow.tsx` | Propose foster to volunteer | `proposeFosterToVolunteerAction` (via foster actions) | `assign(same URL)` |
| `voluntarios/propuestas/CancelProposalButton.tsx` | Cancel foster proposal | `cancelFosterProposalAction` | `assign(same URL)` or optimistic row removal |
| `maltrato/recibidos/InterventionActions.tsx` | Org welfare intervention FSM | `takeDerivedReportAction` / `addInterventionNoteAction` / `returnDerivedReportAction` | `assign(same URL)` |
| `agenda/turnos/[appointmentToken]/AttendanceFormDispatcher.tsx` | Appointment attendance | `onAttend` / `onNoShow` / `onCancel` | `navigateAfterActionSuccess(backUrl)` — drop paired `refresh` |
| `miembros/RemoveMemberButton.tsx` | Remove org member | `removeMemberAction` | `assign(window.location.href)` |
| `miembros/RevokeButton.tsx` | Revoke pending invitation | `revokeInvitationAction` | `assign(window.location.href)` |
| `servicios/[offeringToken]/OfferingActions.tsx` | Pause/unpause/archive offering | `pauseServiceOfferingAction` / `unpauseServiceOfferingAction` | Pause/unpause: Tier B; archive already `router.push` |

#### Tier B

| File | Purpose | Preceding mutation | Replacement recipe |
|---|---|---|---|
| `mascotas/[publicToken]/OwnerReturnProposalCard.tsx` | Accept/reject owner return | accept/reject actions | Keep `setDone(true)` UI; drop `refresh` |
| `miembros/EventWriteToggle.tsx` | Clinical write toggle | `setMemberEventWriteAction` | Optimistic `aria-pressed` flip; revert on error |
| `miembros/ChangeRoleSelect.tsx` | Member role select | `changeMemberRoleAction` | Keep optimistic `selectedRole`; already reverts on error |
| `admin/permisos/CapabilityMatrix.tsx` | Grant capability cell | `grantCapabilityAction` | Optimistic cell `+`→`✓`; revert on error |
| `agenda/BlockSlotButton.tsx` | Block open agenda slot | `blockSlotAction` | Optimistic row status → blocked; revert on error |
| `servicios/[offeringToken]/CapacityEditor.tsx` | Edit offering capacity | `updateOfferingCapacityAction` | Update displayed capacity + keep `successMsg`; drop `refresh` |
| `servicios/[offeringToken]/OfferingActions.tsx` | Pause/unpause offering | pause/unpause actions | Optimistic status label; revert on error |

---

### Govt — `app/gob/` + `components/gob/`

#### Tier A

| File | Purpose | Preceding mutation | Replacement recipe |
|---|---|---|---|
| `cola/[publicToken]/ReviewActions.tsx` | Single approval review | `approveRequestAction` / `rejectRequestAction` | `assign(same URL)` |
| `maltrato/[id]/TriageActions.tsx` | Welfare triage FSM | triage/start/close welfare actions | `assign(same URL)` |
| `maltrato/[id]/AssignmentActions.tsx` | Assign/unassign case | `assignWelfareToMeAction` / `unassignWelfareAction` | See Tier B |
| `maltrato/[id]/DerivationPanel.tsx` | Derive case to org | derive welfare action | `assign(same URL)` |
| `disputas/[disputeToken]/ResolveDisputeForm.tsx` | Resolve custody dispute | `resolveDisputeAction` | `assign(same URL)` |
| `disputas/[disputeToken]/EscalateDisputeForm.tsx` | Escalate dispute | `escalateDisputeAction` | `assign(same URL)` |
| `disputas/[disputeToken]/AddPartyForm.tsx` | Add dispute party | add-party action | `assign(same URL)` |
| `disputas/[disputeToken]/WithdrawDisputeButton.tsx` | Withdraw dispute | `withdrawDisputeAction` | `assign(same URL)` |
| `decomisos/_components/ReasignarButton.tsx` | Reassign decomiso receiver | `reassignDecomisoToAnotherReceiverAction` | `assign(window.location.href)` |
| `servicios/[offeringToken]/OfferingReviewActions.tsx` | Approve/reject service offering | approve/reject offering actions | `assign(same URL)` |
| `vigilancia/investigaciones/[caseCode]/InvestigationActions.tsx` | Investigation case FSM | note/escalate/close investigation actions | `assign(same URL)` |

#### Tier B

| File | Purpose | Preceding mutation | Replacement recipe |
|---|---|---|---|
| `maltrato/[id]/AssignmentActions.tsx` | Assign/unassign operator | assign/unassign actions | Optimistic button swap (Tomar / Liberar); revert on error |

#### Tier C

| File | Purpose | Preceding mutation | Replacement recipe |
|---|---|---|---|
| `components/gob/JurisdictionSwitcher.tsx` | Province/locality filter | — | Comment only; live path uses `window.location.assign` |

---

### Admin — `app/admin/`

#### Tier A

| File | Purpose | Preceding mutation | Replacement recipe |
|---|---|---|---|
| `moderacion/[id]/ModerationActions.tsx` | Pass/spam moderation | `passWelfareToTriageAction` / `confirmWelfareAsSpamAction` | `navigateAfterActionSuccess("/admin/moderacion")` — drop `refresh` |
| `admins/_components/DeactivateAdminForm.tsx` | Deactivate admin account | `deactivateAdminAction` | `assign(window.location.href)` |
| `govts/_components/DeactivateGovtForm.tsx` | Deactivate govt account | `deactivateGovtAction` | `assign(window.location.href)` |
| `govts/_components/RevokeLocalityRowActions.tsx` | Revoke govt locality | `revokeGovtLocalityAction` | `assign(window.location.href)` |
| `govts/_components/AssignLocalityForm.tsx` | Assign locality to govt | assign-locality action | `assign(window.location.href)` (local `done` mode exists but SSR list stale) |

---

### Shared — `components/` (cross-portal)

#### Tier A

| File | Purpose | Preceding mutation | Used in | Replacement recipe |
|---|---|---|---|---|
| `BulkApprovalQueueList.tsx` | Bulk approve/reject queue | `bulkApproveRequestsAction` / `bulkRejectRequestsAction` | `/admin/cola`, `/gob/cola` | `assign(window.location.href)` |
| `AdoptionQueueList.tsx` | Bulk adoption application decisions | bulk approve/reject adoption actions | `/org/.../adopciones` | `assign(window.location.href)` |

---

### Public

No production files match (`rg` returned 0 under public routes).

---

## Subtle / load-bearing cases

| File | Why care |
|---|---|
| `PrivacyActions.tsx` | Post-erase session is dead; `push("/")` + `refresh` races auth teardown — use single full `assign("/")`. |
| `AcceptTransferActions.tsx` / `ConvertFosterButton.tsx` / `ResolveDisputeForm.tsx` / `DecomisoHandoffActions.tsx` | Mutate `ownerships` + emit custody events; SSR ownership badges and action availability must match DB. |
| `ServiceDogForm.tsx` | Drives Tier-0 public banner on `/p/{token}`; stale SSR hides/shows wrong legal banner. |
| `AmendEventForm.tsx` | Libreta projection on event detail; amendment chain is server-derived. |
| `AttendanceFormDispatcher.tsx` | Writes libreta events (vaccination, chip, etc.); agenda + pet medical SSR diverge if refresh drops. |
| `ModerationActions.tsx` | Cross-route `push` + `refresh` double transition — classic silent-drop vector. |
| `DeactivateAdminForm.tsx` / `DeactivateGovtForm.tsx` / `RevokeLocalityRowActions.tsx` | Institutional scope changes; operator UI must reflect deactivated accounts / revoked assignments immediately. |
| `AssignLocalityForm.tsx` | Extends `govt_assignments`; downstream govt dashboards and queue scope derive from SSR. |
| `FosterVolunteerWizard.tsx` | Pool matching reads volunteer SSR snapshot; partial refresh may leave wizard step state inconsistent with DB status. |
| `InvestigationActions.tsx` / `TriageActions.tsx` | Multi-mode FSM panels; server `currentStatus` gates which buttons render. |
| `ProposalActions.tsx` | Accept path: `refresh` runs before SuccessScreen — redundant and may drop while local success UI is showing. |
| `ReminderActions.tsx` | Optimistic hide makes `refresh` unnecessary; failed refresh could resurrect snoozed row visually. |
| `SheetMounter.tsx` / `MisTurnosSheetMounter.tsx` | **Already fixed** — comments document why `refresh` was rejected; do not reintroduce. |
