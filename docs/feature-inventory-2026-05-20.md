# MiMAR (DIM) — Inventario completo de funcionalidades

> Fecha: 2026-05-20 · Owner: Ignacio Del Valle
> Fuente cruzada: `AGENTS.md`, `docs/org-portal-event-flows.md`, `docs/org-portal-permissions.md`, `docs/superpowers/specs/2026-05-19-cases-lifecycles-design.md`, `lib/case-kinds.ts`, `lib/case-lifecycles/*`, `db/schema.ts`, árbol de `app/`.
>
> Convenciones de columna **Estado**: ✅ shipped · 🟢 spec'd + plan listo (en desarrollo) · 🟡 parcial · ⚪ planeado / no spec'd · 🔴 deprecado.
> Convención de columna **Crea caso**: el `case_kind` que se abre cuando se dispara el flujo, o `—` si no abre caso. Recordá que `case_id` en `pet_events` es opcional y append-only (migración 0033).

---

## 1. Modelo de actores

### 1.1 Cuatro roles autoritativos (`profiles.role`, DB-enforced)

| Rol | Account type | Portal principal | Puede tener mascotas | Notas |
|---|---|---|---|---|
| `owner` | personal | `/mis-mascotas` | sí | Default de signup. Puede ser upgradeado a `vet`. |
| `vet` | personal | `/org/[orgToken]` de su clinic (creada por wizard) | sí | El "vet independiente" es una clinic de 1 miembro. `/pro` deprecated 2026-05-20. |
| `govt` | institutional | `/gob` | no | Locality-scoped vía `govt_assignments`. |
| `admin` | institutional | `/admin` | no | Universal scope. Crea cuentas institucionales y reglas globales. |

### 1.2 Membership roles dentro de una org (`organization_membership_role` enum)

| Rol membership | Qué hace |
|---|---|
| `admin` | full control de la org, incluye finalize/revoke adopción, gestionar otros admins, verificación. |
| `coordinator` | lead operativo, idéntico a admin para day-to-day pero no maneja admins ni verificación. |
| `member` | staff genérico, intake + eventos clínicos sobre pets de la org. Sin adoption pipeline. |
| `volunteer` | recibe broadcasts de lost-pet, escribe eventos limitados (síntoma, sighting, scan). |
| `foster` | scope per-pet, escribe eventos sólo sobre la mascota que tiene en `Ownership(role=foster)`. |
| `vet_individual` | vet bajo el paraguas de la org. Same as member + author_role='vet' en eventos clínicos. |

Sobre cualquier role la flag booleana `organization_memberships.can_write_pet_events` gatea TODOS los `events.write.*`. Default false.

### 1.3 Otros actores no-autenticados

- **Vecino con stray**: existing `owner` que registra un stray como `custodyKind=transito`. No es membership.
- **Adoptante prospecto**: cualquier `owner` autenticado que postula desde `/adoptar/[petToken]/postular`.
- **Denunciante anónimo**: público sin auth que carga denuncia en `/denuncias/nueva` y recibe `DEN-XXXX-XXXX`.
- **QR scanner**: cualquiera que escanea credencial pública (Tier 0/0+/1) en `/p/[publicToken]`.
- **Tier-2 viewer**: cualquiera con share token revocable en `/libreta/compartir/[shareToken]`.

---

## 2. Sistema de casos (case_kind)

El sistema de casos es la "coordinación liviana sobre el event log" — un caso es un expediente con `public_code` (`CAS-XXXX-XXXX`), `case_kind`, `status` (open/escalated/closed/merged), `phase` (computado), y `jurisdiction_*` para scope govt. Los `pet_events` y `welfare_reports` pueden referenciar un caso via `case_id` nullable.

### 2.1 Catálogo de kinds (12 totales)

| Kind | Estado v1 | Abre con | Cierra con | Cron? | Reopen? |
|---|---|---|---|---|---|
| `bite_incident` | ✅ V1 con lifecycle | `incident_reported` con `incident_type='bite_inflicted'` (atómico con `rabies_observation_started`) | `rabies_observation_ended` (cron 12h emite negative al día 11) o escalación por `symptom_observed` rabies-high-spec | sí | no |
| `lost_pet_episode` | ✅ V1 con lifecycle | `status_changed` to `lost` | `status_changed` to `active` (recuperado), o `custody_transferred` durante episodio. Cron cierra inactivos >180d | sí | no |
| `welfare_denuncia` | ✅ V1 con lifecycle | INSERT de `welfare_reports` row (no `pet_event` opener) | transición `welfare_reports.status` a `closed` | escalation (no auto-close, notifica oficial >90d) | sí (manual por admin/govt) |
| `adoption_listing` | ✅ V1 con lifecycle (org-side) | `adoption_eligibility_set` con `eligible=true` | `adoption_eligibility_set` con `eligible=false` (withdraw), o `adoption_finalized` + cron cierra al expirar followup window | sí (close-followup-expired-adoptions) | **sí** — `adoption_reversed` reabre el listing (único en el sistema) |
| `adoption_application` | ✅ V1 con lifecycle (applicant-side) | `adoption_application_submitted` | `adoption_application_resolved` (approve/reject) o cascade F5.5 al `adoption_finalized` de otro | no | no |
| `custody_dispute` | ✅ V1 con lifecycle | `custody_dispute_raised` (admin/govt only) | `custody_dispute_resolved` | escalation (notifica >365d) | no |
| `foster_placement` | ✅ V1 con lifecycle | `foster_assigned` (cascade desde `foster_proposal_resolved` con outcome=accepted) | `foster_ended` (returned/adopted/other) | no | no |
| `custody_transfer_handshake` | ✅ V1 con lifecycle (activado en cross-org-transfer spec) | `custody_transfer_proposed` | `custody_transferred` (accept) o cancel/reject/expiry 30d | sí (expire-cross-org-transfers) | no |
| `custody_episode` | ⚪ deferido | TBD | TBD | TBD | TBD |
| `foster_proposal` | ⚪ deferido | TBD | TBD | TBD | TBD |
| `outbreak_investigation` | ⚪ deferido | TBD | TBD | TBD | TBD |
| `microchip_remediation` | ⚪ deferido | TBD | TBD | TBD | TBD |

### 2.2 Surfaces de casos

| Ruta | Audiencia | Estado |
|---|---|---|
| `/casos/[publicCode]` | Unified case detail, role-aware (admin / govt-in-scope / subject-owner / per-kind party). Outside parties → 404. | ✅ |
| `/admin/casos` | Universal scope admin. | ✅ |
| `/gob/casos` | Jurisdiction-scoped govt. | ✅ |
| `/org/[orgToken]/casos` | Org-scope (casos donde la org es party). | ✅ |

---

## 3. Owner-facing (PWA principal)

Sub-tree: `app/(auth)/*` (signup/login) + `app/(app)/*` (autenticadas).

### 3.1 Auth & cuenta

| # | Feature | Ruta | Actores | ¿Crea caso? | Estado |
|---|---|---|---|---|---|
| 3.1.1 | Signup con primera-mascota inline + Mi Argentina placeholder | `/signup` | público → `owner` | — | ✅ |
| 3.1.2 | Login (email/password + MA placeholder) | `/login` | público → autenticado | — | ✅ |
| 3.1.3 | Logout | server action `signOutAction` | autenticado | — | ✅ |
| 3.1.4 | OAuth callback | `/auth/callback` | público | — | ✅ |
| 3.1.5 | Perfil — editar (display name, phone, jurisdiction) | `/cuenta/editar` | autenticado | — | ✅ |
| 3.1.6 | Verificación de DNI | `/cuenta/verificar-dni` | autenticado | — | ✅ (con DNI provider placeholder; RENAPER real pendiente) |
| 3.1.7 | Upgrade a vet (con review admin) | `/cuenta/upgrade` | `owner` → `vet` | — | ✅ |
| 3.1.8 | Memberships (ver mis orgs) | `/cuenta/memberships` | autenticado | — | ✅ |
| 3.1.9 | Renunciar a membership de org | `/cuenta/renunciar` | autenticado | — | ✅ |
| 3.1.10 | Solicitudes (approval requests al admin) | `/cuenta/solicitudes` | autenticado | — | ✅ |
| 3.1.11 | Desactivar cuenta | `/cuenta/desactivar` | autenticado | — | ✅ |
| 3.1.12 | Inicio (home con cards de quick actions + reglas placeholder) | `/inicio` | autenticado | — | ✅ |
| 3.1.13 | Notificaciones inbox con read/archive | `/notificaciones` | autenticado | — | ✅ |

### 3.2 Mis mascotas — gestión

| # | Feature | Ruta | Actores | ¿Crea caso? | Estado |
|---|---|---|---|---|---|
| 3.2.1 | Lista de mascotas con avatares | `/mis-mascotas` | `owner` | — | ✅ |
| 3.2.2 | Detail de mascota + timeline de eventos | `/mis-mascotas/[publicToken]` | `owner` | — | ✅ |
| 3.2.3 | Crear nueva mascota | `/mis-mascotas/nueva` | `owner` | — | ✅ |
| 3.2.4 | Editar profile (foto, raza con PPP auto-detect, microchip, peso, comidas, alergias, training, seguro, jurisdicción) | `/mis-mascotas/[publicToken]/editar` | `owner` | — | ✅ |
| 3.2.5 | Vecino-en-tránsito (custody flow para vecino con stray) | `/mis-mascotas/nueva?custodyKind=transito` | `owner` (sin requerir membership) | — | ✅ |
| 3.2.6 | Match flow al crear (microchip lookup contra DB) | `/mis-mascotas/nueva/match` + `/match/[matchedPetToken]` | `owner` | — | ✅ |
| 3.2.7 | Reclamar mascota (pet sin owner) | `/mis-mascotas/reclamar` | `owner` | — | ✅ (gated por `STUB_CLAIM_ENABLED=false`, espera Mi Argentina) |
| 3.2.8 | Postulaciones de adopción (mis aplicaciones) | `/mis-mascotas/postulaciones` | `owner` (applicant) | — (lee `adoption_application`) | ✅ |
| 3.2.9 | Marcar perdida + enriched description sin chip | `/mis-mascotas/[publicToken]/perdida` | `owner` | **`lost_pet_episode`** | ✅ |
| 3.2.10 | Devolución coordinada (refugio→owner) | `/mis-mascotas/[publicToken]/devolucion` | `owner` | — (cierra `lost_pet_episode` via `custody_transferred`) | ✅ |
| 3.2.11 | Asistencia (atender turno) | `/mis-mascotas/[publicToken]/asistencia` | `owner` | — | ✅ |
| 3.2.12 | Captura rápida (URL-prefill + matcher local sin LLM) | `/mis-mascotas/[publicToken]/anotar` | `owner` | — | ✅ |
| 3.2.13 | Historial completo | `/mis-mascotas/[publicToken]/historial` | `owner` | — | ✅ |

### 3.3 Mis mascotas — registro de eventos (catálogo de 41 tipos)

Cada ruta en `eventos/nuevo/*` es un form que escribe en `pet_events` (append-only). Todos requieren `owner` autenticado.

| # | Evento | Ruta form | UI v1 | ¿Crea caso? | Estado |
|---|---|---|---|---|---|
| 3.3.1 | `vaccination_administered` | `/eventos/nuevo/vacuna` | v1 | — | ✅ |
| 3.3.2 | `deworming_administered` | `/eventos/nuevo/antiparasitario` | v1 | — | ✅ |
| 3.3.3 | `sterilization_performed` | `/eventos/nuevo/esterilizacion` | v1 | — | ✅ |
| 3.3.4 | `medication_started` | `/eventos/nuevo/medicacion-inicio` | v1 | — | ✅ |
| 3.3.5 | `medication_stopped` | `/eventos/nuevo/medicacion-fin` | v1 | — | ✅ |
| 3.3.6 | `medication_dose_taken` | (dual-write con reminder.completedAt) | v1 | — | ✅ |
| 3.3.7 | `vet_visit_logged` | `/eventos/nuevo/vet` | v1 | — | ✅ |
| 3.3.8 | `clinical_info_logged` (sub_kind: lab/imaging/surgery/allergy/other) | `/eventos/nuevo/clinico` | v1 | — | ✅ |
| 3.3.9 | `weight_recorded` | `/eventos/nuevo/peso` | v1 | — | ✅ |
| 3.3.10 | `microchip_implanted` | `/eventos/nuevo/microchip` (también auto al crear pet con chip) | v1 | — | ✅ |
| 3.3.11 | `dangerous_breed_attested` | `/eventos/atestar-raza-peligrosa` | later | — | ✅ (event + flag; export provincial ⚪) |
| 3.3.12 | `note_added` | `/eventos/nuevo/nota` | v1 | — | ✅ |
| 3.3.13 | `symptom_observed` | `/eventos/nuevo/sintoma` | v1 | — (puede gatillar `outbreak_signal` system event) | ✅ |
| 3.3.14 | `incident_reported` con `incident_type='bite_inflicted'` | `/eventos/nuevo/mordedura` | later | **`bite_incident`** | ✅ |
| 3.3.15 | `death_recorded` | `/eventos/nuevo/fallecimiento` | v1 | — | ✅ (con disposition_method Ley CABA 5470) |
| 3.3.16 | Embarazo (gestión, no es evento per se) | `/eventos/nuevo/embarazo` | v1 | — | ✅ |
| 3.3.17 | Check-in post-adopción | `/eventos/nuevo/checkin` (sólo durante followup window) | later | — (afecta `adoption_listing`) | ✅ |
| 3.3.18 | `status_changed` (active↔lost; muerte va por `death_recorded`) | (server action `events.ts`) | v1 | abre/cierra `lost_pet_episode` | ✅ |
| 3.3.19 | `pet_registered` (system, al crear) | (form crear pet) | v1 | — | ✅ |
| 3.3.20 | `pet_profile_updated` | (editar) | v1 | — | ✅ |
| 3.3.21 | `microchip_replaced` | `/eventos/nuevo/microchip-reemplazo` (owner), `/org/.../microchip/reemplazar` (vet), `/admin/...` (admin) | later | **`microchip_remediation`** (solo `fraud_detected` o `duplicate_detected`) | 🟢 plan listo — `docs/superpowers/plans/2026-05-20-microchip-replaced-ui.md` (3 fases, ~2 días CC). Schema y branching ya en código; falta UI + activación del lifecycle. |
| 3.3.22 | `abandonment_reported`, `maltreatment_reported` | (vía welfare_reports bridge) | later | dentro de `welfare_denuncia` | ✅ bridge funcional |

System-emitted (sin UI owner):
- `credential_scanned` — cada scan de QR en `/p/[publicToken]`, con `is_self_scan` flag. ✅
- `outbreak_signal` — cuando `symptom_observed` matchea reportable disease. ✅

### 3.4 Libreta sanitaria

| # | Feature | Ruta | Actores | ¿Crea caso? | Estado |
|---|---|---|---|---|---|
| 3.4.1 | Libreta agrupada + cronológica + print | `/mis-mascotas/[publicToken]/libreta` | `owner` | — | ✅ |
| 3.4.2 | Vacunas (lista + programar) | `/mis-mascotas/[publicToken]/vacunas` + `/programar` | `owner` | — | ✅ |
| 3.4.3 | Tier-2 shareable via share token revocable | `/libreta/compartir/[shareToken]` | público con link | — | ✅ |

### 3.5 Credential pública

| # | Feature | Ruta | Actores | ¿Crea caso? | Estado |
|---|---|---|---|---|---|
| 3.5.1 | Tier 0 (foto, primer nombre, especie, raza, edad aprox, sexo, válida, vacunación ✓/⚠, chip y/n) | `/p/[publicToken]` | público | — | ✅ |
| 3.5.2 | Tier 0+ (emergency medication flag, sin nombres) | mismo `/p/[publicToken]` con flag toggle | público | — | ✅ |
| 3.5.3 | Tier 1 (pet en estado `lost`: + primer nombre owner + contacto + last-known location) | mismo `/p/[publicToken]` con status=lost | público | — | ✅ |
| 3.5.4 | "Did you find this pet?" form contact dual-route (owner + origin org si followup window) | mismo `/p/[publicToken]` | público | — | ✅ |
| 3.5.5 | Self-scan tracking (owner viendo su propio pet) — hidden de timeline default | system | system | — | ✅ |
| 3.5.6 | Org branding badge "Bajo seguimiento de [Org] ✓" en Tier 0 | system | system | — | ✅ (gated por `tier_0_show_branding` + `pet.tier0ShowOriginOrg`) |

### 3.6 Turnos (scheduling owner-side)

| # | Feature | Ruta | Actores | ¿Crea caso? | Estado |
|---|---|---|---|---|---|
| 3.6.1 | Buscar turnos en campaigns/clinics | `/turnos/buscar` | autenticado | — | ✅ |
| 3.6.2 | Detail de offering | `/turnos/buscar/[offeringToken]` | autenticado | — | ✅ |
| 3.6.3 | Reservar slot | `/turnos/buscar/[offeringToken]/reservar/[slotId]` | autenticado | — | ✅ |
| 3.6.4 | Mi agenda de turnos | `/mis-turnos` + `/[appointmentToken]` | autenticado | — | ✅ |
| 3.6.5 | Por-pet: ver turnos | `/mis-mascotas/[publicToken]/turnos` | `owner` | — | ✅ |

### 3.7 Adopciones — surface público

| # | Feature | Ruta | Actores | ¿Crea caso? | Estado |
|---|---|---|---|---|---|
| 3.7.1 | Listing público con filtros (especie, edad, locality, energy, size) — SSR para SEO | `/adoptar` | público | — | 🟢 (código presente; AGENTS.md marca "plan pendiente" — el plan grande es el unificado de 2026-05-20) |
| 3.7.2 | Detail de mascota adoptable | `/adoptar/[petToken]` | público | — | 🟢 |
| 3.7.3 | Postular (form actual: 4 campos — housing, other_pets, daily_routine, notes) | `/adoptar/[petToken]/postular` | autenticado | **`adoption_application`** | ✅ shipped — el wizard 28-q queda diferido. 4 campos cubren el caso actual. Re-evaluar cuando aparezca demanda concreta. |

### 3.8 Adopciones — handshake unificado (❎ DIFERIDO)

`docs/superpowers/plans/2026-05-20-adoption-handshake-unified.md` — 8 fases, ~45 archivos, ~7 días CC. Reemplaza por completo `finalizeAdoptionAction`.

**Estado 2026-05-20**: ❎ diferido. Los 4 campos actuales (housing, other_pets, daily_routine, notes) cubren el caso. Se re-evalúa cuando aparezca demanda concreta de los refugios o regulación que lo exija.

El plan queda en `docs/superpowers/plans/` como backlog ejecutable — no se borra.

### 3.9 Tránsito / voluntariado (foster volunteer pool)

`docs/superpowers/plans/2026-05-18-foster-volunteers-pool.md` — 4 fases A/B/C/D, plan listo.

| # | Feature | Ruta | Actores | ¿Crea caso? | Estado |
|---|---|---|---|---|---|
| 3.9.1 | Form "ofrecerme como hogar de tránsito" con pre-check D13 (dniVerified + display_name + phone + role=owner) | `/cuenta/ofrecerme-como-transito` | `owner` | — | 🟢 (form presente; estado oficial spec'd) |
| 3.9.2 | Propuestas recibidas por voluntario | `/cuenta/transitos/propuestas` + `/[proposalToken]` | voluntario | — | 🟢 |
| 3.9.3 | Tránsitos activos (que cuido) | `/cuenta/transitos/activos` | foster | — | 🟢 |
| 3.9.4 | Historial de tránsitos | `/cuenta/transitos/historial` | foster | — | 🟢 |
| 3.9.5 | Aceptar propuesta (`foster_proposal_resolved` outcome=accepted → cascade `foster_assigned`) | server action | voluntario | abre **`foster_placement`** | 🟢 |

### 3.10 Denuncias (entry point owner-facing, ver §6 para detalle)

| # | Feature | Ruta | Actores | ¿Crea caso? | Estado |
|---|---|---|---|---|---|
| 3.10.1 | Mis denuncias | `/denuncias/mias` | autenticado | — (lee) | ✅ |
| 3.10.2 | Detail de mi denuncia | `/denuncias/[id]` | autenticado | — | ✅ |

---

## 4. Org portal (`/org/[orgToken]/*`) — refugios, clinics, rescue networks, sanitary authorities

Capabilities-driven, gated por `lib/org-permissions.ts` matrix.

### 4.1 Org setup & administración

| # | Feature | Ruta | Capability | Actor membership | ¿Crea caso? | Estado |
|---|---|---|---|---|---|---|
| 4.1.1 | Dashboard org | `/org/[orgToken]` | `org.read.unverified_self` | cualquier member | — | ✅ |
| 4.1.2 | Member management + capability grants | `/org/[orgToken]/admin/permisos` | `members.*` | admin/coordinator | — | ✅ |
| 4.1.3 | Coverage zones (barrio-level, drive lost-pet broadcast) | (parte de profile) | `org.coverage.manage` | admin/coordinator | — | ✅ |

### 4.2 Intake (mascotas nuevas o transfer-in)

| # | Feature | Ruta | Capability | Crea caso | Estado |
|---|---|---|---|---|---|
| 4.2.1 | Intake form (new pet OR transfer-in) con microchip cross-check | `/org/[orgToken]/intake` | `custody.intake.new_pet` o `.transfer_in` | — | ✅ |
| 4.2.2 | Match flow (microchip lookup contra DB durante intake) | `/org/[orgToken]/intake/match` + `/[matchedPetToken]` | idem | — | ✅ |
| 4.2.3 | Flow 1 — intake new pet (Tx: pets + ownerships + pet_registered + shelter_intake_recorded) | server action | `custody.intake.new_pet` | — | ✅ |
| 4.2.4 | Flow 2a — intake pet sin owner activo (transfer-in con prevOrg) | server action | `custody.intake.transfer_in` | — | ✅ |
| 4.2.5 | Flow 2b — intake pet con owner persona (decomiso/surrender/abandonment) | server action | `custody.intake.transfer_in` | (puede abrir `custody_dispute` en seizure) | ✅ |

### 4.3 Custodia entre orgs

| # | Feature | Ruta | Capability | Crea caso | Estado |
|---|---|---|---|---|---|
| 4.3.1 | Listado transferencias | `/org/[orgToken]/transferencias` | `custody.transfer.*` | — | ✅ |
| 4.3.2 | Proponer transferencia salida (Phase 1) | `/transferencias/nueva` | `custody.transfer.propose_out` | **`custody_transfer_handshake`** | ✅ |
| 4.3.3 | Aceptar transferencia recibida (Phase 2 — atómico custody_transferred + flip ownerships) | `/transferencias/recibidas` | `custody.transfer.accept_in` | cierra `custody_transfer_handshake` | ✅ |
| 4.3.4 | Cancelar / rechazar propuesta | (botones) | `custody.transfer.cancel` | cierra `custody_transfer_handshake` | ✅ |
| 4.3.5 | Cron expiración 30d | `/api/cron/expire-cross-org-transfers` | system | cierra como `cancelled` | ✅ |
| 4.3.6 | Devolver al dueño (refugio→owner) | `/org/[orgToken]/mascotas/[publicToken]/devolver-al-dueno` | `custody.transfer.propose_out` | `custody_transfer_handshake` o cascade-cierra `lost_pet_episode` | ✅ |
| 4.3.7 | Return to street (release decision) | (server action) | `custody.return_to_street` | — | ✅ admin-only |

### 4.4 Foster (member-based, tradicional)

| # | Feature | Ruta | Capability | Crea caso | Estado |
|---|---|---|---|---|---|
| 4.4.1 | Asignar tránsito a member con role volunteer/foster (Flow 4) | `/org/[orgToken]/mascotas/[publicToken]/foster` | `foster.assign` | abre **`foster_placement`** | ✅ |
| 4.4.2 | Terminar tránsito (Flow 5) — reason: adoption/returned/escalated/other | `/org/[orgToken]/mascotas/[publicToken]/foster-fin` | `foster.end` (foster self-only para sí) | cierra `foster_placement` | ✅ |
| 4.4.3 | Surface unificado de mascotas en tránsito (member + voluntary pool + vecino) | `/org/[orgToken]/transitos` | `foster.assign` o coordinator+ | — | 🟢 (parte plan foster pool) |

### 4.5 Foster pool (voluntarios externos, owner→refugio)

| # | Feature | Ruta | Capability | Crea caso | Estado |
|---|---|---|---|---|---|
| 4.5.1 | Browse pool de voluntarios | `/org/[orgToken]/voluntarios` | `foster.assign` | — | 🟢 |
| 4.5.2 | Propuestas emitidas | `/org/[orgToken]/voluntarios/propuestas` | `foster.assign` | abre `foster_proposal` (cuando se active el lifecycle) | 🟢 |
| 4.5.3 | Match scoring + warnings (PPP excluidas default, opt-in con disclaimer; locality opcional; warnings no errors) | `lib/foster-matching.ts` | server | — | 🟢 |
| 4.5.4 | Cron expiración propuestas 7d | `/api/cron/expire-foster-proposals` | system | cierra como `expired` | 🟢 |

### 4.6 Adopciones (org-side)

| # | Feature | Ruta | Capability | Crea caso | Estado |
|---|---|---|---|---|---|
| 4.6.1 | Configurar eligibility (apto/no apto, razón estructurada) | `/org/[orgToken]/mascotas/[publicToken]/eligibility` | coordinator+ | abre/cierra **`adoption_listing`** | ✅ |
| 4.6.2 | Publicar listing (foto, descripción, settings) | `/org/[orgToken]/mascotas/[publicToken]/adoptar` | coordinator+ | actualiza `adoption_listing` | ✅ |
| 4.6.3 | Listado de pets no aptas | `/org/[orgToken]/pets/no-aptas` | coordinator+ | — | 🟢 (parte plan foster pool) |
| 4.6.4 | Adoption pipeline (lista de aplicaciones recibidas) | `/org/[orgToken]/adopciones` | `adoption.applications.list` | — | ✅ |
| 4.6.5 | Detail aplicación + review/approve/reject (Flow 6) | `/org/[orgToken]/adopciones/[appEventId]` | `adoption.applications.review`/`.approve`/`.reject` | actualiza `adoption_application` | ✅ |
| 4.6.6 | Finalize adopción (Flow 7 — atómico: end shelter_custody + foster_ended si aplica + new owner row + adoption_finalized + scheduled reminders + adopter notification) | `/org/[orgToken]/mascotas/[publicToken]/adoption` | `adoption.finalize` | cierra `adoption_application` + cierra `adoption_listing` (en followup) + cascade F5.5 a aplicaciones rivales | ✅ |
| 4.6.7 | Revocar adopción (Flow 9, admin-only) | (server action) | `adoption.revoke` | reabre `adoption_listing` (único caso reopen-allowed) | ✅ |
| 4.6.8 | Cron auto-expire approvals | `/api/cron/auto-expire-approvals` | system | — | ✅ |
| 4.6.9 | Cron close followup expired adoptions | `/api/cron/close-followup-expired-adoptions` | system | cierra `adoption_listing` | ✅ |
| 4.6.10 | Post-adoption check-ins recibidos | `/org/[orgToken]/checkins` | coordinator+ | — | ✅ |
| 4.6.11 | Cron de notificación de checkins | `/api/cron/post-adoption-checkin` | system | — | ✅ |

### 4.7 Eventos clínicos sobre pets en custodia

| # | Feature | Capability | Crea caso | Estado |
|---|---|---|---|---|
| 4.7.1 | `events.write.clinical` (vacuna, deworming, sterilization, vet visit, weight) | `events.write.clinical` + `can_write_pet_events` | — | ✅ |
| 4.7.2 | `events.write.lifecycle` (status_changed, death_recorded; coordinator+ para death) | `events.write.lifecycle` | death puede afectar lost_pet_episode | ✅ |
| 4.7.3 | `events.write.observations` (symptom_observed, incident_reported, note_added) | `events.write.observations` | bite → `bite_incident` | ✅ |
| 4.7.4 | `events.write.identification` (microchip_implanted) | `events.write.identification` | — | ✅ |

### 4.8 Agenda & servicios (org-side)

| # | Feature | Ruta | Capability | Crea caso | Estado |
|---|---|---|---|---|---|
| 4.8.1 | Listado de servicios ofrecidos | `/org/[orgToken]/servicios` | coordinator+ | — | ✅ |
| 4.8.2 | Crear servicio | `/org/[orgToken]/servicios/nuevo` | coordinator+ | — | ✅ |
| 4.8.3 | Detail de offering | `/servicios/[offeringToken]` | coordinator+ | — | ✅ |
| 4.8.4 | Agenda del offering (slots) | `/servicios/[offeringToken]/agenda` | coordinator+ | — | ✅ |
| 4.8.5 | Agenda general (todos los turnos) | `/org/[orgToken]/agenda` | coordinator+ | — | ✅ |
| 4.8.6 | Turno detail | `/agenda/turnos/[appointmentToken]` | coordinator+ | — | ✅ |
| 4.8.7 | Cron materialize slots desde schedule rules | `/api/cron/materialize-slots` | system | — | ✅ |

### 4.9 Welfare (denuncias recibidas por la org)

| # | Feature | Ruta | Actor | Crea caso | Estado |
|---|---|---|---|---|---|
| 4.9.1 | Listado de denuncias recibidas | `/org/[orgToken]/maltrato/recibidos` | coordinator+ | — | ✅ |
| 4.9.2 | Nueva denuncia desde org (representación) | `/org/[orgToken]/maltrato/nuevo` | coordinator+ | abre `welfare_denuncia` | ✅ |
| 4.9.3 | Detail | `/org/[orgToken]/maltrato` | coordinator+ | — | ✅ |
| 4.9.4 | Nueva mordedura desde org | `/org/[orgToken]/mordedura/nuevo` | coordinator+ con `events.write.observations` | abre `bite_incident` | ✅ |
| 4.9.5 | Listado mordeduras | `/org/[orgToken]/mordedura` | coordinator+ | — | ✅ |

### 4.10 Casos (vista org-scope)

| # | Feature | Ruta | Actor | Estado |
|---|---|---|---|---|
| 4.10.1 | Casos donde la org es party | `/org/[orgToken]/casos` | cualquier member | ✅ |

---

## 5. Perfil público de refugios

| # | Feature | Ruta | Actores | ¿Crea caso? | Estado |
|---|---|---|---|---|---|
| 5.1 | Public shelter profile (solo orgs verificadas tipo shelter o rescue_network) | `/refugios/[orgToken]` | público | — | ✅ |

---

## 6. Welfare denuncias (Ley 14.346)

| # | Feature | Ruta | Actores | Crea caso | Estado |
|---|---|---|---|---|---|
| 6.1 | Form público anónimo-capable (5 attachments × 25MB, 9 kinds, 4 severidades) | `/denuncias/nueva` | público anónimo o autenticado | **`welfare_denuncia`** (cases row creada en mismo tx que welfare_reports) | ✅ |
| 6.2 | Tracking anónimo via `DEN-XXXX-XXXX` | `/denuncias/codigo/[code]` | público con code | — (lee) | ✅ |
| 6.3 | Buscar denuncia por código | `/denuncias/buscar` | público | — | ✅ |
| 6.4 | Bridge a `pet_events` (`maltreatment_reported`, `abandonment_reported`, `symptom_observed`) cuando subject es registered pet | server-side `app/actions/welfare.ts` | system | (eventos requieren caso pre-existente — requires-open per spec §7.9) | ✅ |
| 6.5 | Welfare-officer queue para triagear | `/gob/maltrato` + `/[id]` | govt locality-scoped | actualiza `welfare_denuncia` | ✅ (antes ⚪ en AGENTS.md, ahora implementado) |
| 6.6 | Moderation queue para denuncias anónimas auto-flagged | `/admin/moderacion` + `/[id]` | admin | — | ✅ |
| 6.7 | Bug fix: location bridge a pet_event + mapa + rate-limit anon | plan `2026-05-18-welfare-reports-polish.md` | — | — | 🟢 |
| 6.8 | Cron escalate stale welfare cases (notif oficial >90d) | `/api/cron/escalate-stale-welfare-cases` | system | escalation visible | ✅ |
| 6.9 | Export template a fiscalía MPF CABA (Ley 14.346 pipeline) | — | — | — | ⚪ |

---

## 7. Surveillance & disease

| # | Feature | Mecanismo | Actores | Crea caso | Estado |
|---|---|---|---|---|---|
| 7.1 | Symptom-disease surveillance (matcher fuzzy → reportable diseases → outbreak_signal silencioso a govt) | server-side; sin UI directa al owner | system | (puede abrir `outbreak_investigation` cuando active) | ✅ |
| 7.2 | Bite-rabies observation 10-day (Ley CABA + Decreto PBA) con auto-close + escalation hooks | `/admin/observaciones/[publicToken]` + `/admin/observaciones` | admin/govt | `bite_incident` con phase de observación | ✅ |
| 7.3 | Cron cierre observaciones rábicas (12h cadence) | `/api/cron/close-rabies-observations` | system | cierra `bite_incident` con resolved | ✅ |
| 7.4 | Vaccination-due UX al owner | `/api/cron/vaccine-due` + `<ReminderCard>` + libreta + `/notificaciones` tabs | owner/system | — | ✅ (Chunk C, ver `docs/superpowers/plans/archive/2026-05-21-vaccine-due-ux.md`) |
| 7.5 | Vigilancia (vista govt) | `/gob/vigilancia` | govt | — | ✅ |

---

## 8. Custody disputes

| # | Feature | Ruta | Actores | Crea caso | Estado |
|---|---|---|---|---|---|
| 8.1 | Raise custody dispute (flag `pets.in_custody_dispute=true`) | (admin/govt action) | admin/govt | **`custody_dispute`** | ✅ |
| 8.2 | Resolve dispute (ownership_confirmed / ownership_transferred / case_dismissed / other) | (admin/govt action) | admin/govt | cierra `custody_dispute` | ✅ |
| 8.3 | Listado disputas govt | `/gob/disputas` + `/[disputeToken]` | govt | — | ✅ |
| 8.4 | Cron escalación >365d (notifica, no cambia status) | `/api/cron/escalate-stale-disputes` | system | escalation visible | ✅ |

---

## 9. Vet profesional — operan vía clinic org (deprecado `/pro`)

🔴 **`/pro` deprecado 2026-05-20.** Los vets que quieren ofrecer servicios crean una organization de tipo `clinic` (incluso si son uno solo: "clinic de 1 miembro"). El portal `/org/[orgToken]` ya cubre todo lo que `/pro` ofrecía (services, scheduling, libreta con `author_role='vet'`).

Plan de deprecación: `docs/superpowers/plans/2026-05-20-deprecate-pro-portal.md` (3 fases: backfill data, eliminar codebase `/pro`, wizard onboarding `/cuenta/crear-consultorio`).

| # | Feature | Ruta | Actores | Crea caso | Estado |
|---|---|---|---|---|---|
| 9.1 | Wizard "Creá tu consultorio" para vet nuevo | `/cuenta/crear-consultorio` | vet con matrícula verificada | — | 🟢 plan listo |
| 9.2 | Servicios, agenda, atención de turnos, libreta clínica | `/org/[orgToken]/servicios/*`, `/org/[orgToken]/agenda/*` | clinic admin / coordinator / vet_individual | — | ✅ shipped (vía org portal) |
| 9.3 | Backfill: vets activos con offerings → org clinic auto-creada | (script `scripts/migrate-vets-to-clinics.ts`) | sistema | — | 🟢 plan listo |
| 9.4 | Middleware redirect `/pro/*` → `/cuenta/memberships` (período de gracia 30d) | middleware.ts | sistema | — | 🟢 plan listo |

---

## 10. Admin portal `/admin/*` (universal scope)

| # | Feature | Ruta | Crea caso | Estado |
|---|---|---|---|---|
| 10.1 | Dashboard | `/admin` | — | ✅ partial |
| 10.2 | Gestión de admins (lista, alta, edit) | `/admin/admins` + `/new` + `/[userId]` | — | ✅ |
| 10.3 | Gestión de govts (institucionales locality-scoped) | `/admin/govts` + `/new` + `/[userId]` | — | ✅ |
| 10.4 | Gestión de usuarios universal | `/admin/usuarios` | — | ✅ |
| 10.5 | Gestión de organizaciones universal | `/admin/organizaciones` | — | ✅ |
| 10.6 | Cola de revisión (orgs / vet upgrades) | `/admin/cola` + `/[publicToken]` | — | ✅ |
| 10.7 | Auditoría (audit log universal) | `/admin/auditoria` | — | ✅ |
| 10.8 | Historial | `/admin/historial` | — | ✅ |
| 10.9 | Casos universal | `/admin/casos` | — | ✅ |
| 10.10 | Observaciones rábicas (admin-only) | `/admin/observaciones` + `/[publicToken]` | actualiza `bite_incident` | ✅ |
| 10.11 | Moderación welfare anónimas | `/admin/moderacion` + `/[id]` | — | ✅ |
| 10.12 | Servicios universal | `/admin/servicios` + `/[offeringToken]` | — | ✅ |
| 10.13 | Sistema (config global) | `/admin/sistema` | — | ✅ |
| 10.14 | Jurisdicciones (country/province/locality tree + reglas business-rules engine) | `/admin/jurisdicciones/*` y subrutas de reglas | — | ✅ |

Estado oficial AGENTS.md: 🟡 "admin page completo (4 roles, account_type institutional, split `/gob` vs `/admin`)" — pero el código muestra que la implementación está sustancialmente avanzada.

---

## 11. Gob portal `/gob/*` (govt institucional locality-scoped)

| # | Feature | Ruta | Crea caso | Estado |
|---|---|---|---|---|
| 11.1 | Dashboard govt | `/gob` | — | ✅ |
| 11.2 | Casos en jurisdicción | `/gob/casos` | — | ✅ |
| 11.3 | Cola (revisión) | `/gob/cola` + `/[publicToken]` | — | ✅ |
| 11.4 | Disputas custodia | `/gob/disputas` + `/[disputeToken]` | actualiza `custody_dispute` | ✅ |
| 11.5 | Maltrato (welfare officer queue) | `/gob/maltrato` + `/[id]` | actualiza `welfare_denuncia` | ✅ |
| 11.6 | Perdidas (lost pet episodes en jurisdicción) | `/gob/perdidas` | — (lee `lost_pet_episode`) | ✅ |
| 11.7 | Vigilancia (outbreak signals + surveillance dashboard) | `/gob/vigilancia` | — | ✅ |
| 11.8 | Organizaciones en jurisdicción | `/gob/organizaciones` | — | ✅ |
| 11.9 | Usuarios en jurisdicción | `/gob/usuarios` | — | ✅ |
| 11.10 | Servicios | `/gob/servicios` + `/[offeringToken]` | — | ✅ |
| 11.11 | Reglas locales | `/gob/reglas` | — | ✅ |
| 11.12 | Historial | `/gob/historial` | — | ✅ |
| 11.13 | Dashboards govt (sanitary / analyst / welfare officer) — proyecciones sobre event log | — | — | ⚪ planeado |

---

## 12. Cron jobs

| # | Cron | Función | Crea/cierra caso | Estado |
|---|---|---|---|---|
| 12.1 | `auto-expire-approvals` | Expira approvals de adopción inactivas | `adoption_application` | ✅ |
| 12.2 | `business-rules-reeval` | Re-evalúa business rules engine | — | ✅ |
| 12.3 | `close-followup-expired-adoptions` | Cierra `adoption_listing` cuando followup expira | cierra `adoption_listing` | ✅ |
| 12.4 | `close-rabies-observations` | 12h cadence, cierra observaciones rábicas día 11 | cierra `bite_incident` | ✅ |
| 12.5 | `close-stale-lost-episodes` | Cierra `lost_pet_episode` inactivos >180d | cierra `lost_pet_episode` | ✅ |
| 12.6 | `escalate-stale-disputes` | Notifica disputas >365d (no cambia status) | escalation `custody_dispute` | ✅ |
| 12.7 | `escalate-stale-welfare-cases` | Notifica oficial sobre `welfare_denuncia` >90d | escalation | ✅ |
| 12.8 | `expire-cross-org-transfers` | Cancela handshakes >30d | cierra `custody_transfer_handshake` como cancelled | ✅ |
| 12.9 | `expire-foster-proposals` | Cancela propuestas >7d | cierra `foster_proposal` (deferred) | 🟢 |
| 12.10 | `materialize-slots` | Materializa slots desde schedule rules | — | ✅ |
| 12.11 | `post-adoption-checkin` | Recordatorios de check-ins programados | — | ✅ |
| 12.12 | `vaccine-due` | Recordatorios de vacunas próximas a vencer, throttle por variante (Chunk C C2) | — | ✅ |

---

## 13. Identity & legal

| # | Feature | Estado |
|---|---|---|
| 13.1 | Microchip implant event + tracking (`microchip_implanted`) | ✅ |
| 13.2 | Dangerous breed (PPP) flag + attestation event (Ley CABA 4078 / Prov 14.107) | 🟡 (column + event ✅; export provincial ⚪) |
| 13.3 | Disposition method en `death_recorded` (Ley CABA 5470) | ✅ (`DISPOSITION_METHODS` enum + form en `/eventos/nuevo/fallecimiento/`) |
| 13.4 | Acquisition method en `pet_registered` (EAH 2018 trend tracking) | ✅ (`petAcquisitionMethodEnum`) |
| 13.5 | DNI verification provider (RENAPER directo vs intermediary) | ⚪ |
| 13.6 | Mi Argentina integration — OAuth y/o emisión federada | ⚪ (placeholder en `/signup` y `/login`) |

---

## 14. Infra & cross-cutting

| # | Feature | Estado |
|---|---|---|
| 14.1 | Event sourcing hardening (Zod schemas estrictos + append-only triggers + validateEventPayload) | ✅ |
| 14.2 | Bidirectional geocoding (text ↔ map pin via Nominatim/OSM) | ✅ |
| 14.3 | Tier-2 share telemetry en tabla dedicada (cleanup 2026-05-19) | ✅ |
| 14.4 | Bulk operations para refugios high-capacity (200+ animales) | ⚪ |

---

## 15. Resumen ejecutivo por estado

| Estado | Áreas |
|---|---|
| ✅ Shipped | Auth/cuenta · Mis mascotas + 41 eventos · Libreta + tier-2 share · Credential pública Tier 0/0+/1 · Turnos owner-side · Org portal completo (intake/custody/foster member-based/adopciones member-based/checkins/agenda) · 8 lifecycles V1 de casos · Welfare denuncias + bridge + queue gob · Surveillance + observación rábica · Custody disputes · Admin/gob sustancialmente implementados · 11/12 crones · Postulación adopción 4-campos (wizard 28-q diferido) |
| 🟢 spec'd + plan listo | Adoption listing público `/adoptar` · Foster volunteers pool · Surface unificado `/org/.../transitos` · Listado no-aptas · **`microchip_replaced` UI** (`docs/superpowers/plans/2026-05-20-microchip-replaced-ui.md`) · **Deprecación `/pro` → clinic org** (`docs/superpowers/plans/2026-05-20-deprecate-pro-portal.md`) |
| 🟡 partial | PPP export provincial · Admin page final (4 roles) · Govt dashboards (vigilancia/perdidas/maltrato/analytics shippeados Chunk E E2-E5; falta E6 async export) |
| 🔴 deprecado | `/pro` portal (2026-05-20) — los vets profesionales ahora operan vía clinic org de 1 miembro |
| ⚪ planeado | Mi Argentina OAuth · DNI verification real · Welfare export fiscalía MPF · Govt dashboards async export (Chunk E E6 pendiente) · Bulk ops · 3 case_kinds deferidos restantes (`custody_episode`, `foster_proposal`, `outbreak_investigation`) — `microchip_remediation` se activa con el plan de §3.3.21 |
| ❎ diferido | Wizard adopción 28-preguntas (`docs/superpowers/plans/2026-05-20-adoption-handshake-unified.md` queda en backlog hasta nueva demanda) |

---

## Apéndice A — Crea-caso matrix (referencia rápida)

Eventos que ABREN un caso:

| Event | case_kind | Actor típico |
|---|---|---|
| `incident_reported` con `bite_inflicted` | `bite_incident` | owner / org member / vecino |
| `status_changed` to `lost` | `lost_pet_episode` | owner |
| INSERT `welfare_reports` row | `welfare_denuncia` | anónimo / autenticado / org |
| `adoption_eligibility_set` `eligible=true` | `adoption_listing` | org coordinator+ |
| `adoption_application_submitted` | `adoption_application` | applicant (owner) |
| `custody_dispute_raised` | `custody_dispute` | admin / govt |
| `foster_assigned` | `foster_placement` | org coordinator+ |
| `custody_transfer_proposed` | `custody_transfer_handshake` | org coordinator+ |

Eventos que CIERRAN un caso (terminales):

| Event | Cierra |
|---|---|
| `rabies_observation_ended` | `bite_incident` |
| `status_changed` to `active` | `lost_pet_episode` |
| `welfare_reports.status='closed'` | `welfare_denuncia` |
| `adoption_eligibility_set` `eligible=false` + followup expiry | `adoption_listing` |
| `adoption_application_resolved` | `adoption_application` (+ cascade F5.5) |
| `custody_dispute_resolved` | `custody_dispute` |
| `foster_ended` | `foster_placement` |
| `custody_transferred` (accept) / cancel / reject / expire | `custody_transfer_handshake` |

Eventos que CASCADE (composite que toca varios casos a la vez):

- **`adoption_finalized`** (Flow 7): cierra el `adoption_application` ganador, cierra los rivales con cascade F5.5, abre la phase `finalized_in_followup` del `adoption_listing`, cierra el `foster_placement` activo con reason=adoption, opcionalmente cierra `lost_pet_episode` si la mascota estaba perdida.
- **`adoption_reversed`** (Flow 9): reabre el `adoption_listing` (único en el sistema con reopen-allowed).
- **`custody_transferred`** (Flow 3 phase 2): cierra `custody_transfer_handshake` Y puede cerrar `lost_pet_episode` si es return-to-owner.
- **`death_recorded`**: cascade-cierra `foster_placement` si el pet estaba en tránsito.

---

*Inventario generado 2026-05-20 a partir del estado del repo HEAD. Para actualizar: ejecutar el design-system audit con argumento `audit feature-inventory`.*
