# Plan CONSOLIDADO — Backlog de pendientes (auditoría docs↔código, 2026-06-24)

> **Fuente única de pendientes.** Resultado de una auditoría exhaustiva docs↔código con **AGENTS.md como catálogo maestro** (§573 eventos, §768 dashboards, §972 feature inventory, §1177 open questions) + los 50 specs y 36 planes activos, **verificada contra el código real** por dominio (eventos/libreta, owner/público, org, casos/welfare/surveillance, dashboards/métricas/Panorama, identidad/legal/infra).
> Método: 6 barridos paralelos read-only; cada claim contrastado contra `db/schema.ts`, `lib/**`, `src/modules/**`, rutas `app/**`. Los hallazgos de peso (privacidad, integridad DB) se re-verificaron a mano.
> Severidad: 🔴 correctitud/seguridad/privacidad · 🟡 feature faltante o fricción · 🟢 polish/decisión.

## Hallazgo central (leer primero)
**El código va MUY por delante de la documentación.** El patrón dominante no es "feature faltante" sino **doc desactualizada**: AGENTS.md y varias specs marcan como ⚪ "no construido" o "diferido" features que están **completas y testeadas** (welfare-officer queue, moderation queue, export MPF, dashboards gob scope-bound, paquetes de métricas E/F/G/H, control poblacional). Los pendientes *reales* son pocos y acotados (Parte A). El grueso del trabajo de limpieza es **alinear la documentación con la realidad** (Parte B) y archivar lo ya implementado (ver `2026-06-24-docs-archive-manifest` y los índices actualizados).

---

## Parte A — Pendientes REALES (accionables)

Verificados en código. Ordenados por severidad. Cada uno: qué falta · evidencia · fix.

| # | Pendiente | Sev | Evidencia (archivo:símbolo) | Fix sugerido |
|---|---|---|---|---|
| **A1** | **Chapa física `/t/[serial]` no construida.** Spec marcada "🟢 Ready for CC" pero cero implementación: no existe tabla `pet_tags`, ni ruta `app/t/[serial]`, ni `/cuenta/chapas`, ni eventos `tag_activated/revoked`. Deja al **hub de credencial física cojo** (solo el canal `printable_qr` es entregable hoy). | 🟡 | `find app -path "*t/*serial*"` → 0; `pet_tags` solo aparece en un comentario en `db/schema.ts:3494`. Spec: `specs/2026-05-18-physical-tag-design.md` | Ejecutar el plan de chapa física, **o** degradar la spec a "no ejecutada" y ocultar los canales chapa/NFC del hub hasta entonces. |
| **A2** | **Tier-2 "público" médico en el QR, fuera del modelo de privacidad documentado.** `/p/[publicToken]` expone vacunas + esterilización + medicaciones activas vía `pets.tier2PublicPermanent` / `tier2PublicEnabledUntil`, pero la tabla de tiers (AGENTS §755-766) define Tier 2 **exclusivamente** como el share-link revocable `/libreta/compartir/[shareToken]`. Hay una superficie médica pública no descrita en el modelo. | 🔴 | `db/schema.ts:606-610` (`tier2_public_*`); `app/(public)/p/[publicToken]/page.tsx:206-284` (`Tier2MedicalView`, chip "TIER 2 · MÉDICO") | **▶ DECIDIDO (2026-06-24): documentar y mantener, default OFF.** El opt-in ya existe (`tier2PublicPermanent` default `false`; ventanas 24h/7d/30d/permanente vía `app/actions/tier2-public.ts`). CC: (1) agregar este Tier-2-público a la tabla de tiers en AGENTS §755-766 (qué expone, gating, default-off, cómo se activa/revoca); (2) verificar que la UI de activación es explícita (label claro + advertencia de que la libreta médica queda pública). **EN SCOPE — solo doc + verificación, sin cambiar gating.** |
| **A3** | **Invariante `account_type ↔ role` afirmado pero no existe en DB.** AGENTS §237 dice "DB-enforced via CHECK constraint" y §233 "no double-check en app", pero el CHECK fue **dropeado**. El match queda solo a nivel app. | 🔴 | `db/migrations/0016_drop_role_match_check.sql`; queda solo `profiles_account_type_valid` (valida el enum, no el match) | **▶ DECIDIDO (2026-06-24): NO reinstaurar el CHECK; corregir la doc + test-guard.** El CHECK se dropeó en 0016 por una razón documentada (Drizzle+postgres-js fallaba en el estado intermedio de la fila al actualizar las 2 columnas en los tests) y el invariante **ya lo enforcan todos los writers** (`createInstitutionalAccountForAuthority`, handlers de aprobación, trigger `handle_new_user`; ver también `admin-org-verification.ts:26`). Reinstaurarlo re-rompería el suite. CC: (1) corregir AGENTS §237 (no afirmar CHECK en DB) y §233 (el match SÍ se valida en app, a propósito); (2) agregar/confirmar un test de integración que afirme `personal→{owner,vet}` / `institutional→{govt,admin}` sobre los paths de escritura. **EN SCOPE.** |
| **A4** | **Nav admin: botones "Próximamente" duplican consolas ya vivas.** `nav-presets.ts` tiene 2 entradas `deferred:true` ("Control poblacional", "Custodia & tránsito") mientras `/admin/poblacion` ya renderiza las métricas de control poblacional (`fetchSterilizationCoverage`, `fetchNetGrowth`, …) y `/admin/adopciones` cubre custodia/adopción. IA incoherente (placeholder + página real conviven). | 🟡 | `components/layout/nav-presets.ts:314-315` vs `app/admin/poblacion/page.tsx` (consume `lib/metrics/population-control.ts`) | **▶ DECIDIDO (2026-06-24): quitar los placeholders.** CC: (1) verificar que `/admin/poblacion` + `/gob/poblacion` renderizan las métricas de control poblacional (lo hacen — `fetchSterilizationCoverage/NetGrowth/...`); (2) borrar las 2 entradas `deferred:true` de `nav-presets.ts:314-315`; (3) archivar `plans/2026-06-23-population-cycle-deferred-nav-handoff.md` → `plans/archive/` (superseded por las consolas vivas) y actualizar sus snapshots de nav (`nav-presets.test.ts`, `shell-nav*.test.ts`). **EN SCOPE.** |
| **A5** | **Found-pet form sin dual-routing al refugio de origen.** AGENTS §766 afirma que el form "¿Encontraste?" puede dual-rutear a owner + refugio originante con opt-in; el componente solo recibe `publicToken`, sin `orgId` ni opt-in. | 🟡 | `FoundPetForm.tsx` (grep `organization\|refugio\|origin` → 0). AGENTS §766 | Implementar el opt-in de ruteo **o** quitar el claim de §766. |
| **A6** | **Toggle de branding Tier-0 (refugio de origen) no construido.** Plan org T-4.3: columna `pets.tier_0_show_origin_org` + capability `org.branding.toggle_tier_0`. Ninguna existe. | 🟡 | `db/schema.ts` (ausente en `ORGANIZATION_CAPABILITIES`); `org-portal-plan.md` T-4.3 lo declara pendiente | Ejecutar T-4.3 **o** marcarlo formalmente como único faltante de los flujos core de org. |
| **A7** | **Export PPP CABA puede emitir siempre "DNI no verificado".** `PppCabaDto.ownerDniNumber` referencia un dato que el schema **ya no almacena** (mig 0106 dropeó `dni_number`; solo queda `dni_hash`/`dni_last4`). Si el caller no lo deriva, el PDF RUPPPA sale siempre sin DNI. | 🔴 | `lib/ppp-exports.ts:45` (`ownerDniNumber: string\|null`) y `:314` (fallback "DNI no verificado…") | **▶ DECIDIDO (2026-06-24).** CC: trazar el caller de `generatePppCabaPdf` / `app/actions/ppp-export-caba.ts`; poblar `ownerDniNumber` con el `dni_last4` enmascarado cuando `dni_verified` (mostrar p.ej. "DNI ····1234 — verificado por Mi Argentina"), y dejar el mensaje "el tenedor completa en el organismo" **solo** cuando no hay DNI verificado. Nunca exponer el DNI completo (mig 0106: no se almacena). Test del DTO/render para ambos caminos. **EN SCOPE.** |
| **A8** | **Catálogo INDEC de localidades no seedeado en el repo.** Infra completa (tabla `ar_localities`, `scripts/import-indec-localities.ts`) pero el script **fetchea CSV en vivo** y solo hay un fixture de muestra; la cobertura real (~4500 localidades) depende de correr el import por entorno. | 🟡 | `db/schema.ts:2475` + `scripts/import-indec-localities.ts` + `__fixtures__/indec-localidades-sample.csv` | Confirmar/automatizar que el import corrió en staging/prod; documentar el paso en el runbook de bootstrap. |
| **A9** | **WARNings del Supabase advisor pendientes.** Los 5 *errores* ya se cerraron (mig `0113`), pero los WARN (`function_search_path_mutable` ×7, leaked-password protection, anon RPC) quedaron fuera de alcance; `0114` puede cubrir algunos. | 🟡 | `db/migrations/0114_advisor_security_warns.sql` (revisar cuáles cierra); plan `2026-06-24-supabase-advisor-errors.md` §"Fuera de alcance" | Revisar `0114`, cerrar los WARN restantes en un PR de seguridad follow-up. |
| **A10** | **Consolidación `/gob/analytics` ↔ Panorama no ejecutada.** El redirect 308 que absorbería Analytics en Panorama quedó como decisión de producto pendiente; hoy ambas superficies se solapan. | 🟢 | `app/gob/analytics/page.tsx` (página viva, no 308); plan `2026-06-22-gob-analytics-retirement.md` diferido | Ejecutar el 308 o cerrar formalmente la decisión de mantener ambas. |
| **A11** | **Captura rápida: 4 forms complejos abren vacíos + dirs sin `page.tsx`.** medicación-fin, mordedura, síntoma y clínico se alcanzan por intent pero no prefilllan. Además `eventos/nuevo/{medicacion-inicio,peso,sintoma,nota}` no tienen `page.tsx` (solo montan vía `SheetMounter` `?sheet=…`); la ruta directa 404ea. | 🟢 | AGENTS §1201; `lib/event-capture-registry.ts`; dirs en `app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/` | Limitación conocida: agregar prefill a los 4 forms cuando se prioricen; documentar que esas 4 rutas viven solo como sheet. |

### Backlog — fuera de esta tanda (documentado, sin ejecutar todavía)
Decidido con Nacho el 2026-06-24: **no** entran en la tanda actual; quedan como pendientes priorizables.
- **A1 — Chapa física `/t/[serial]`**: feature nueva grande con decisiones de producto abiertas (§15 de la spec: material, fabricante, auto-revoke on death). Cuando se priorice: escribir plan desde `specs/2026-05-18-physical-tag-design.md`. Mientras tanto, el hub de credencial física entrega solo `printable_qr` (aceptado).
- **A5 — Found-form dual-routing al refugio de origen**: requiere decisión de producto (opt-in del dueño + modelo de notificación al refugio). Hasta entonces, **quitar el claim de AGENTS §766** queda incluido en la higiene de docs (Parte B3).
- **A6 — Toggle de branding Tier-0**: ejecutar `org-portal-plan.md` T-4.3 cuando se priorice; es el único faltante de los flujos core de org.
- **A8 — Seed INDEC**: tarea de ops/datos (correr el import por entorno), no código de CC. Documentar el paso en el runbook de bootstrap.
- **A10 — Consolidación `/gob/analytics` ↔ Panorama**: decisión de producto (308 vs mantener ambas) — además la **demo activa** usa ambas; no tocar ahora.
- **A11 — Captura rápida (4 forms vacíos + dirs sin page.tsx)**: limitación conocida de baja prioridad.

### Conocidos / intencionales (sin acción ahora, NO relitigar)
- **Export PPP Provincia BA** — placeholder explícito (`ppp_prov_ba_not_implemented`); CABA (RUPPPA) **sí** está completo. Coincide con docs.
- **`retention_until`** — columnas presentes pero inertes, esperando decisión legal (`docs/architecture/retention-policy-pending-decision.md`). No es bug.
- **Bite-from-unowned-animal** — solo spec, correctamente marcado backlog Wave 5.
- **Event-trust tiers 2-4** — future/low-priority; `event_amended` shipped como variante reducida (sin retraction/reclassification).
- **Mi Argentina OIDC** — stub honesto gated (`isMiArgOidcEnabled()`).
- **Push notifications / native / agente LLM / materialized views** — open questions de largo plazo (AGENTS §1177).

---

## Parte B — Higiene de documentación (la doc subestima al código)

Correcciones de documentación. No requieren código; se aplican en el PR que toque cada área (o en un PR `docs:` único). **Todas verificadas.**

### B1 · AGENTS.md — feature inventory miente sobre lo construido (🔴 prioridad: es la "fuente de verdad")
- §1009-1011 y §1193(a-c): **welfare-officer queue** (`/gob/maltrato`), **moderation queue** (`/admin/moderacion`, no `/admin/maltrato/moderacion`) y **export MPF fiscalía** están ⚪ pero **completos** (`app/gob/maltrato/**`, `app/admin/moderacion/**`, `src/modules/welfare/application/generate-mpf-export.ts`). Marcar ✅ + corregir rutas + borrar la advertencia "denuncias invisibles".
- §1052-1053: "`/gob` scope-bound" y "government dashboards — no UI" están ⚪ pero construidos (scope vía `requireAdminOrGovtOrRedirect`; dashboards mortalidad/vigilancia/analytics/poblacion/censo/programa con UI plena). Repuntar a ✅.

### B2 · AGENTS.md — catálogo de eventos desactualizado
- §573 "Event catalog — **45 types**": el enum real tiene **47** (`db/schema.ts EVENT_TYPES`). Corregir el número.
- **10 tipos sin documentar** como filas: `tattoo_recorded`, `tattoo_updated`, `ownership_claimed`, `custody_transfer_cancelled`, `foster_proposed`, `foster_proposal_resolved`, `foster_co_foster_allowed`, `adoption_eligibility_set`, `rabies_observation_started`, `rabies_observation_ended`. Agregar filas.
- §609 `clinical_info_logged.sub_kind`: faltan `disease_diagnosis` y `pregnancy` (el código los valida/usa).
- §577 menciona un `UNIMPLEMENTED` allowlist que **ya está vacío** (cobertura 100%). Actualizar la frase.

### B3 · AGENTS.md — invariantes y enums
- §237/§233: corregir la afirmación del CHECK `account_type↔role` (ver A3 — está dropeado).
- §318: `disposition_method` lista 3 valores; el enum real tiene **7** (`DISPOSITION_METHODS`). Alinear.
- §766: pref real es `organizations.tier0ShowOriginOrg` (label "Refugio de origen"), no `tier_0_show_branding`. Y §766 promete el dual-routing del found-form que no existe (ver A5).

### B4 · README de superpowers + specs de roadmap — "diferido" que ya está construido
- README §105-112 + `specs/2026-06-23-panorama-north-star-design.md` + `specs/2026-06-23-dashboards-vnext-roadmap.md` §1: el **control poblacional / North Star** se describe como "casi sin proyectar / no construir todavía", pero `/admin/poblacion` + `/gob/poblacion` + `lib/metrics/population-control.ts` están vivos. Marcar paquetes **E/F/G/H ✅** (todos construidos: census, custody, population-control, program-health).

### B5 · Specs marcadas "ready for review, no code yet" pero SHIPPED
Sellar como implementadas (header) y archivar (ver Parte C): `2026-05-19-cases-lifecycles-design`, `2026-05-19-cases-event-attachment-design`, `2026-05-18-bite-rabies-observation-design`, `2026-05-17-symptom-disease-surveillance-design`, `2026-05-19-decomiso-welfare-authority-design`, `2026-05-19-org-abuse-investigation-design`, `2026-05-19-eno-vet-direct-report-and-owner-alerts-design`.

### B6 · Docs del portal org — drift fuerte
- `org-portal-permissions.md`: describe **37 capabilities finas** + API `requireCapability(cap, OrgContext)` que lanza + `lib/org-permissions.ts`. Realidad: **16 capabilities gruesas** (`db/schema.ts ORGANIZATION_CAPABILITIES`), modelo **grant-based**, API `authz-resolver.requireCapability(cap, orgId) → {error}`; `lib/org-permissions.ts` **no existe**. Reescribir.
- `org-portal-plan.md` + `org-portal-event-flows.md`: usan rutas `/refugio/[orgToken]` y grupo `app/(refugio)/` — el portal vive en `app/org/[orgToken]`. Search-replace `/refugio/`→`/org/`.
- Lista de event types en ambos: quitar `adoption_application_reviewed` (eliminado), cambiar `adoption_revoked`→`adoption_reversed`; corregir también AGENTS §1021. Cron real `post-adoption-checkin` (singular).
- Cross-org transfer: expiry real **30 días** (no 7), estado vía **case handshake** (no `note_added`); `lib/custody-transfers.ts` no existe.

### B7 · Otros docs
- `docs/event-design-checklist.md`: campo de versión es `payload_version` (no `schemaVersion: z.literal(N)`); además referencia rota a `docs/action-plan-2026-05-20.md`. Alinear con `event-versioning.md`.
- `docs/superpowers/2026-06-24-supabase-advisor-errors-COWORK-HANDOFF.md` + plan: dicen "no implementado / es un encargo" pero `0113` ya cerró los 5 errores. Marcar DONE.
- Comentario stale en `app/(public)/layout.tsx:30-34` ("landing variant follow-up Phase C2") — ya está cableado en `p/` y `libreta/compartir/`.

---

## Parte C — Archivado (limpieza estructural, hecho en este barrido)
Movidos a archive (registro histórico): **37 specs** de features vivas → `docs/superpowers/specs/archive/`; **24 planes** ejecutados → `docs/superpowers/plans/archive/`; **9 critiques/audits/handoffs** remediados → `docs/archive/`. Quedan activos 13 specs (roadmaps + no-construidos + panorama de demo) y 16 planes (sprint de demo + features no terminadas + estos backlogs). Índices actualizados: `docs/superpowers/README.md` (banner "Archivado 2026-06-24") y `docs/README.md`. Detalle de cada movimiento en el mensaje de entrega.

---

## Parte D — Orden de ejecución para CC (tanda 2026-06-24) ▶ EJECUTAR ESTO

Alcance decidido con Nacho (2026-06-24). **Branch desde la rama activa que indique `docs/superpowers/README.md`** (hoy `fix/demo-panorama-consolidated`; confirmar). Convención del repo: SDD test-first, Conventional Commits, **sin `Co-Authored-By` ni atribución AI**, cada PR cierra con `pnpm verify` + `pnpm test` verdes y cero regresiones. Anclar por símbolo + quote (no por línea).

**EN SCOPE esta tanda:** Design system F1–F4 · A2 · A3 · A4 · A7 · A9 · Parte B (higiene de docs).
**FUERA (backlog):** A1, A5 (salvo el fix de doc §766), A6, A8, A10, A11.

Orden sugerido (cada bullet = 1 PR; los doc-only se pueden agrupar):

1. **PR `docs/agents-inventory-sync` (Parte B, 🔴 doc primero).** Alinea la fuente de verdad antes de tocar código: AGENTS.md §1009-1011/§1052-1053 (⚪→✅ + rutas reales), §573 ("45"→47 + 10 eventos sin documentar + sub_kinds), §237/§233 (A3 — sin CHECK, match app-layer), §318 (disposition 3→7), §766 (pref real + quitar claim de dual-routing de A5/A2). Sella specs shipped (B5), reescribe `org-portal-permissions.md` / `org-portal-plan.md` / `org-portal-event-flows.md` (B6), `event-design-checklist.md` (B7), marca DONE el handoff supabase-advisor, limpia el comentario stale de `(public)/layout.tsx`. **+ A2:** documentar el Tier-2-público en el modelo de tiers. Sin código de runtime → bajo riesgo.
2. **PR `fix/operator-status-token-layer` (F1, 🔴).** Ver `plans/2026-06-24-operator-design-system-unification.md` PR-1. Incluye la auditoría de contraste `ln-op-warn/danger` (A-parte del design plan).
3. **PR `fix/operator-status-badge-grammar` (F2, 🔴 bug + 🟡).** Plan operador PR-2. Tonos canónicos ya decididos (open=ámbar, escalado=rojo, cerrado=verde, fusionado=violeta). Depende de PR #2 (st-*).
4. **PR `chore/operator-button-primitive` (F3, 🟡).** Plan operador PR-3 (`OpButton`, primario azul).
5. **PR `fix/admin-nav-dedupe-deferred` (A4, 🟡).** Quitar placeholders `deferred` + archivar el plan deferred-nav + snapshots.
6. **PR `fix/ppp-caba-dni-derivation` (A7, 🔴).** `dni_last4` enmascarado / mensaje de organismo.
7. **PR `fix/account-type-role-invariant-guard` (A3, 🔴).** Test de integridad app-layer (la doc ya se corrigió en el PR 1).
8. **PR `fix/sec-advisor-warns` (A9, 🟡).** Cerrar los WARN SQL-addressables (`function_search_path_mutable` ×7) por migración; los de dashboard (leaked-password protection) **no son auto-aplicables por CC** → dejar nota en el PR para que Nacho los active en el panel de Supabase.
9. **PR `chore/admin-casos-density` (F4, 🟢).** Plan operador PR-4. Opcional/último.

Notas de autonomía: todas las decisiones de producto/seguridad están cerradas arriba. Si CC encuentra una ambigüedad nueva, registrarla en el PR y seguir con el resto (no bloquear la tanda).

---

## Definición de "hecho" para este backlog
- Parte A: cada ítem 🔴 resuelto o conscientemente diferido con decisión registrada; los 🟡/🟢 priorizados en el README.
- Parte B: AGENTS.md feature inventory + §573 + §237/§318/§766 alineados con el código; specs shipped selladas; docs de org reescritos.
- Parte C: árbol de `docs/` sin specs/planes de features ya vivas fuera de `archive/`.
