# Checklist pre-prod — Owner · Vet · Org (adversarial E2E)

**Fecha:** 15/7/2026 · **Entorno:** `http://localhost:3000` (prod-style local)
**Scope:** solo dueño / veterinario-clínica / organización-refugio. **Admin/govt fuera** (ya en Claude Code vía ronda 4).
**Cuentas:** `owner@dim.test`, `alejo@dim.test` (Clínica Recoleta `DIM-R5GX-838G`), `orgadmin@dim.test` (Refugio Test `DIM-GA6Y-7W54`). Password demo: `Test1234!`.
**Tester:** Cursor adversarial review (Chrome IDE browser). Soft-nav flaky → preferir hard URL.

**Artefactos de prueba creados:**
- Ingreso: **QA-Mora** `DIM-SDYG-CKRW` (elegible + publicada en `/adoptar`)
- Clínica: vacuna antirrábica firmada sobre **Pampa** `DIM-HTHU-D79V` (`?firmado=1`)
- Owner: peso 12,5 kg sobre Pampa (tras corregir fecha)

---

## 1) TL;DR

Los flujos centrales **funcionan de punta a punta** cuando el usuario pelea la UI: ingreso → elegibilidad → publicar; atender → vacuna; anotar peso. Lo que **no** está listo para pre-prod sin arreglo es (1) el **detalle de servicio que crashea**, (2) las **fechas default en UTC** que bloquean forms en horario AR nocturno, y (3) la **firma clínica que no proyecta como “oficial”** en la credencial del dueño. El resto es ruido de navegación, orden de acciones peligrosas y copy/wizard.

---

## 2) Checklist de reparación (por slice)

Usar como cola de trabajo. Cada ítem: **prioridad · evidencia · aceptación**.

### Slice A — Bloqueantes de workflow (P0)

| ID | Qué | Dónde / evidencia | Hecho cuando… |
|---|---|---|---|
| **A1** | Detalle de servicio crashea | `/org/DIM-R5GX-838G/servicios/DEMO-SVO-CABA-RABIES` → “Algo salió mal” digest **`3955119939`**. Lista muestra “Aprobado”. | Abrir servicio aprobado muestra ficha + link a agenda/cupos; sin error boundary genérico. |
| **A2** | Fecha default = UTC “hoy” → futuro en AR | Owner `?sheet=peso` default `2026-07-16` con “hoy” 15/7 22h AR → **“La fecha no puede ser futura.”** Misma trampa en intake/mordedura/vacuna. | Default = calendario local `America/Argentina/Buenos_Aires` (o clock del usuario); form de peso con fecha “hoy” local pasa sin editar. |
| **A3** | Firma clínica no cuenta como oficial | Clínica firmó antirrábica (`?firmado=1`). Credencial owner: **DECLARADA · “sin firma de matrícula”** + copy pidiendo vet matriculado. | Evento escrito vía `/org/.../atender` con clínica verificada / matrícula del firmante proyecta stamp “al día” (o copy honesta si la clínica no alcanza el umbral H1). |

### Slice B — Clínica (vet/org clinic)

| ID | Qué | Evidencia | Hecho cuando… |
|---|---|---|---|
| **B1** | Nav/panel “tipo refugio” en clínica | Ingresos, Censo, Mascotas en custodia, “disponibles para adopción”, Casos/Maltrato visibles en Recoleta. (Tránsitos/Operaciones/Check-ins sí filtrados.) | Nav clínica = Panel · Agenda · Atender · Servicios · Mordeduras · Miembros · Cobertura · Config. Sin custody/adopción. |
| **B2** | Agenda vacía sin salida | “No hay cupos / turnos” + servicio aprobado + A1 impide abrir ficha. | Empty state con CTA a materializar cupos o a Servicios (y A1 arreglado). |
| **B3** | Mordedura: “Paso 1 de 4” con todos los pasos visibles | Misma forma que intake. | Un paso visible a la vez (o quitar el contador mentiroso). |
| **B4** | Seed: Alejo admin de 4 orgs | Picker de 4 orgs al login (clínica + refugio + red + autoridad). | Demo: 1 membresía clínica (o picker solo con orgs reales del rol). |

### Slice C — Refugio (org shelter)

| ID | Qué | Evidencia | Hecho cuando… |
|---|---|---|---|
| **C1** | “Finalizar adopción” primero en pet nuevo | Ficha QA-Mora recién ingresada: Finalizar adopción encabeza Acciones. | Acciones ordenadas por etapa (elegibilidad → publicar → … → finalizar al final / detrás de ⋯). |
| **C2** | Fila de mascotas: 5 acciones a la vez | Listado: Asignar tránsito · Elegibilidad · Publicar · Finalizar · Transferir. | Barra primaria 1–2 + menú ⋯. |
| **C3** | Post-publicar: form en 0/5000 | Estado “Publicada”; Historia/Requisitos vacíos en UI. | Tras publicar, form rehidrata el listing guardado (o pasa a modo solo-lectura con datos). |
| **C4** | Nav “Operaciones” → página “Postulaciones” | `/adopciones` label mismatch. | Mismo nombre en nav + H1 (o “Adopciones”). |
| **C5** | “Ir a mi app” para org-first | orgadmin → `/mis-mascotas` vacío + bandeja en inglés (`organization_verification` / `approved`). | CTA a portal org; bandeja en es-AR. |
| **C6** | Onboarding “Primeros pasos” con 4+ en custodia | Checklist servicios/capacidad sigue arriba. | Dismiss persistente o auto-hide cuando hay operación real. |

### Slice D — Owner

| ID | Qué | Evidencia | Hecho cuando… |
|---|---|---|---|
| **D1** | Welcome “registrá tu primera mascota” con N mascotas | Notif DIM + CTA primera mascota con pets existentes. | Welcome solo si 0 pets; brand MiMAR. |
| **D2** | Carrusel 8 vs índice 14 activas | Misma sesión Lucía/owner. | Misma proyección (mismo filtro de “vivas”). |
| **D3** | a11y compliance “POR VENCER” en PPP sin datos | Chip “falta régimen ppp POR VENCER” cuando falta raza/peso. | Copy “sin datos / completar” ≠ vencido. |
| **D4** | Anotar: chips rápidos duplican lista larga | Sheet anotar. | Una sola lista o chips ≠ duplicado de abajo. |
| **D5** | Sticky “Asentar” vs “Anotar” | Nav bottom vs action row. | Un solo verbo canónico. |

### Slice E — Transversal (nav / seed / honesty)

| ID | Qué | Evidencia | Hecho cuando… |
|---|---|---|---|
| **E1** | Soft-nav drops | Links se focusean sin navegar (Next soft router). | Hot paths: hard assign o shallow API según tabla nav-QOL. |
| **E2** | Wizard “Paso N” + todos los campos en DOM | Intake 4 pasos, mordedura, publicar. | Paso real o quitar contador. |
| **E3** | Seed naming drift | orgadmin → “Refugio Test” no “Patitas”. | Nombre demo = label del brief / e2e. |

---

## 3) Matriz de workflows (re-test gate)

Re-correr **después** de Slice A (mínimo). Preferir hard URL.

### Clínica (`alejo@` → Recoleta)

| # | Pasos | Esperado | Estado 15/7 |
|---|---|---|---|
| V1 | Login → picker / shortcut → Panel | Panel de Clínica | PASS (picker 4 orgs = seed) |
| V2 | Atender → token `DIM-HTHU-D79V` → Vacuna → Registrar | `?firmado=1` | PASS submit / FAIL proyección owner (A3) |
| V3 | Servicios → abrir aprobado → cupos/agenda | Ficha usable + cupos o CTA | **FAIL A1** |
| V4 | Agenda día vacío | CTA accionable | **FAIL B2** |

### Refugio (`orgadmin@`)

| # | Pasos | Esperado | Estado 15/7 |
|---|---|---|---|
| R1 | Ingresos → Registrar → sin chip → crear | Comprobante + token | **PASS** (QA-Mora) |
| R2 | Elegibilidad → Apta → Confirmar | Estado Apta | **PASS** |
| R3 | Publicar adopción (historia + attrs) | Visible en `/adoptar` | **PASS** (+ C3 wipe form) |
| R4 | Ficha → acciones ordenadas | Sin “Finalizar” primero | **FAIL C1** |

### Owner (`owner@`)

| # | Pasos | Esperado | Estado 15/7 |
|---|---|---|---|
| O1 | Credencial Pampa → ver vacuna clínica | Stamp oficial / al día | **FAIL A3** |
| O2 | `?sheet=peso` → default hoy → Registrar | Sin editar fecha | **FAIL A2** (OK tras forzar 15/7) |
| O3 | Compartir / Anotar smoke | Sheet usable | PASS parcial (D4 ruido) |

---

## 4) Fuera de este checklist

- Admin / govt / panorama / outbox / crons / omnibox → ronda 4 + Claude Code.
- No re-litigar política de firma (H1 provenance): si clínica sin matrícula personal no alcanza, el copy de Atender no debe decir “firmado… verificado por profesional” sin que el stamp lo refleje.

---

## 5) Orden sugerido de merge

1. **A1 + A2 + A3** (desbloquean confianza y turnos).
2. **B1 + B2** (clínica usable).
3. **C1 + C2 + C3** (refugio sin pie en la sierra).
4. **D1–D3** + **E1–E2** (pulido owner / wizards).

**Definition of Done de este checklist:** matriz §3 en PASS (V1–V4, R1–R4, O1–O2) + `pnpm verify` / `pnpm test` en el PR que cierre Slice A.
