# Génesis — cold-start desde vacío

**Fecha:** 2026-07-07  
**Entorno:** `http://localhost:3000` (prod local) — solo `admin@dim.test` / `Test1234!` al inicio  
**Run PASS:** suffix `mra4g2uz` · harness `pnpm exec tsx scripts/cursor-genesis.ts`  
**Handoff:** `docs/design/handoffs/2026-07-05-uxgate-genesis.md`

## Veredicto

| Resultado | **PASS** |
|-----------|----------|
| Actos OK | **6/6** |
| BLOCKERs | ninguno |
| Cadena causal | admin → govt → ciudadano → org → vet → eventos → KPIs **aguanta** |

Ledger append-only: `docs/reviews/results/genesis-ledger.md`

## Mundo creado (run `mra4g2uz`)

| Rol | Email / token | Notas |
|-----|---------------|-------|
| Admin bootstrap | `admin@dim.test` | Pre-existente |
| Gobierno | `govt-gen-mra4g2uz@dim.test` | Palermo, CABA |
| Ciudadano | `lucia-gen-mra4g2uz@dim.test` | Dueña de Chichila |
| Mascota ciudadana | **DIM-5XDN-USNW** (Chichila) | Vacuna vet + mordedura + perdida/encontrada |
| Fundadora refugio | `maria-gen-mra4g2uz@dim.test` | Patitas Génesis |
| Refugio | **DIM-YTSB-AS89** | Verificado vía cola `APR-H8QQ-P2QR` |
| Vet | `vet-gen-mra4g2uz@dim.test` | Matrícula `MP-GEN-mra4g2uz` |
| Clínica | **DIM-F3JP-P49H** | Consultorio Génesis |
| Rescue + adopción | **DIM-ZRR6-U3J4** (Morena) | Intake → elegibilidad → publicar → postular → aprobar → finalizar |
| Adoptante | `adop-gen-mra4g2uz@dim.test` | Postulación 5 pasos |

Contraseña de todas las cuentas creadas: `Test1234!`

---

## Rubric por acto

| Acto | ¿Vacío→poblado limpio? | ¿Pantalla dice lo justo? | Dependencias | OK |
|------|------------------------|---------------------------|--------------|-----|
| **1** Admin provisiona govt | Sí — form `/admin/govts/new` pide email + display + localidad; éxito con panel “cuenta institucional creada” + magic link | Campos mínimos correctos; localidad autocomplete Palermo/CABA | Solo admin@ | ✅ |
| **2** Ciudadano + 1ª mascota | Sí — signup → `/mis-mascotas/nueva` → credencial `DIM-…` | Wizard mascota claro; credencial visible post-redirect | Cuenta nueva (signup real) | ✅ |
| **3** Org + verificación | Sí — SEAM legible: fundadora crea refugio → cola govt → aprobar | Cola `/gob/cola` + confirmación de aprobación | DNI verificado + govt activo (act 1) | ✅ |
| **4** Vet matrícula + clínica | Sí — upgrade matrícula → cola → aprobar → wizard consultorio 3 pasos | “Solicitud enviada” + portal `/org/{clinic}` | Govt en scope; DNI vet | ✅ |
| **5** Eventos de vida | Sí — vacuna (Atender), intake/adopción, mordedura→observación, perdida→encontrada | Wizards con CTAs correctos (`Continuar`, `Confirmar mordedura`, etc.) | Vet clínica + org verificada + mascota ciudadana | ✅ |
| **6** Govt KPIs + reglas | Sí — panel filtrado Palermo muestra KPIs; `/gob/reglas` solo lectura | Copy “vista de solo lectura” — editar requiere admin | Gobt con asignación Palermo + mundo poblado (act 5) | ✅ |

### Acto 5 — detalle cross-POV

| Sub-flujo | Superficie | Evidencia |
|-----------|------------|-----------|
| Vacuna firmada | `/org/{clinic}/atender/{pet}?evento=vacuna` | `act5a-vacuna-firmada.png` |
| Intake + adopción | `/org/{refugio}/intake` → bulk elegibilidad/publicar → postulación → finalize | `act5b-adopcion-finalizada.png` |
| Mordedura + observación 10d | `/org/{refugio}/mordedura/nuevo` | `act5c-mordedura.png` |
| Perdida → encontrada | `/mis-mascotas/{pet}/perdida` + sheet marcar-encontrada | `act5d-encontrada.png` |

---

## Screenshots — transiciones clave

| Archivo | Transición |
|---------|------------|
| `genesis-screenshots/act1-admin-govt-created.png` | Admin → primer govt provisionado |
| `genesis-screenshots/act2-citizen-pet-credencial.png` | Ciudadano → credencial Chichila |
| `genesis-screenshots/act3-org-created.png` | Fundadora → refugio creado |
| `genesis-screenshots/act3-govt-org-verified.png` | Govt → org verificada (cola) |
| `genesis-screenshots/act4-vet-clinic.png` | Vet → consultorio operativo |
| `genesis-screenshots/act5a-vacuna-firmada.png` | Vet firma vacuna sobre mascota ciudadana |
| `genesis-screenshots/act5b-adopcion-finalizada.png` | Refugio finaliza adopción Morena |
| `genesis-screenshots/act5c-mordedura.png` | Mordedura → observación antirrábica |
| `genesis-screenshots/act5d-encontrada.png` | Chichila marcada encontrada |
| `genesis-screenshots/act6-gob-panel-filtered.png` | Govt panel filtrado Palermo |
| `genesis-screenshots/act6-gob-reglas-readonly.png` | `/gob/reglas` solo lectura |

---

## Hallazgos producto (día-1 / cold-start)

### Confirmados en este run

1. **Signup paso 2 saltado** — tras paso 1 autenticado, `signup/page.tsx` redirige a `/mis-mascotas` antes de identidad (“Contanos quién sos”). Funciona, pero nombre/apellido quedan vacíos hasta editar perfil.
2. **`/gob/reglas` solo lectura para govt** — editar reglas de negocio requiere rol admin (confirmado act 6).
3. **Publicar adopción exige elegibilidad** — `adoptionEligible=true` antes de `Publicar adopción`; bulk bar en `/org/{token}/mascotas` es el camino más robusto que el sheet `?sheet=elegibilidad` en headless.
4. **Postulación pública = wizard 5 pasos** — no hay textarea único; motivación ≥30 chars + convivencia + vivienda + consentimiento.
5. **Aprobar postulación = 2 clics** — “Aprobar postulación” → “Confirmar aprobación” en ficha de cola.
6. **Finalizar adopción pide DNI adoptante** — lookup por hash; no requiere DNI pre-declarado en perfil adoptante si el DNI coincide al finalizar.

### Fixes aplicados durante la sesión (N3 redirect + harness)

| Área | Fix |
|------|-----|
| `createPetAction`, org/clinic create, DNI verify | `redirectTo` + `useActionRedirect` (Next 15.5 prod no ejecuta `redirect()` en server actions) |
| Vet upgrade | Matrícula única `MP-GEN-{suffix}` completo (colisión en índice parcial) |
| Harness intake | Wizard 4 pasos con radios/selects; token rescue desde lista `code` |
| Harness adopción | Bulk elegibilidad + publicación; wizard postulación 5 pasos |
| Harness mordedura | Campo `petPublicToken` (placeholder `DIM-…`), severidad obligatoria |

### Fricción menor (no BLOCKER)

- Org create: redirect a `/org` a veces no dispara; fallback `/cuenta/memberships` funciona.
- `/cuenta/upgrade` tiene dos `LocationFields` (vet arriba, org abajo) — hay que scopear el picker al form correcto.
- Sheet `?sheet=elegibilidad` tarda en montar en Playwright; bulk bar preferible para automatización.

---

## Cold-start verdict

**PASS.** Un deploy vacío con solo admin bootstrap puede poblar el mundo en orden causal real (signup, colas de aprobación, org portal, eventos clínicos y KPIs gobierno) sin atajos de seed manual. La cadena de dependencias entre actos se sostuvo en el run `mra4g2uz`.

Quedan mejoras de UX (signup paso 2, redirect post-create org, sheet deep-links) pero **no bloquean** el día-1 operativo.
