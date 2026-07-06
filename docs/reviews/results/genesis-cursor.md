# UX Gate Génesis — Cursor (OPERADOR)

**Agente:** Cursor (OPERADOR)  
**Fecha:** 2026-07-06  
**Entorno:** `http://localhost:3000` (build producción local)  
**Cuentas usadas:** `admin@dim.test`, `govt@dim.test`, `orgadmin@dim.test` — contraseña `Test1234!`  
**Alcance operador:** actos 1 · 3-verify · 4-approve · 5 · 7 (relay con `genesis-ledger.md`)  
**Side-effects:** un `proposeOrgVerification` sobre seed "Refugio Pendiente Verificación" (approval_request). Sin approve/reject, sin crear govt, sin cambiar reglas, sin grants.

---

## Estado del relay

| Acto | Estado | Notas |
|------|--------|-------|
| **1** Bootstrap govt | **UI-only** | Mundo no vacío (3 govts seed). Form `/admin/govts/new` recorrido; submit frenado (contrato + precondición) |
| **3✓** Verificar org | **BLOQUEADO** | Sin `AWAITING VERIFY` del ciudadano. Proxy: flujo "Proponer verificación" documentado |
| **4✓** Aprobar matrícula | **BLOQUEADO** | Sin `AWAITING APPROVE`. Cola matrícula vacía en scope govt@ |
| **5** Grant event.write | **BLOCKER runtime** | `/org/.../admin/permisos` → 500 |
| **7** Reglas + KPI | **BLOCKER runtime** | `/gob/reglas` y drill-down localidad → 500; árbol `/admin/reglas` OK |

**Precondición Génesis incumplida:** el handoff exige solo `admin@` post-reset; el entorno tiene seed demo completo (13 owners, KPIs, orgs verificadas). Ver `genesis-ledger.md`.

Screenshots: capturados en sesión browser MCP (`a01-*` … `a07-*` en temp Cursor; copiar a `docs/reviews/results/genesis-cursor-screenshots/` si el PO los quiere versionados).

---

## Matriz acto × pantalla

Leyenda: ✅ suficiente · ⚠️ reservas · ❌ roto / insuficiente

| Acto | Pantalla | Screenshot | ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? | Notas |
|------|----------|------------|---------|---------|-----------------|-----------------|-------|
| **1** | Admin panel | `a01-admin-govts-list` | Banner demo OK | CTA crear govt en listado | ✅ | ✅ | 3 govts seed — no es mundo vacío |
| 1 | Crear govt | `a01-admin-govt-new-form` | — | Aviso de que localidades son opcionales pero genesis las necesita | ✅ | ✅ | Magic link explicado. Palermo (CABA) resuelve en picker |
| **3** | Organizaciones | `a03-admin-organizaciones` | Bulk revoke en verificadas | Filtro `?verified=false` no filtra (12 resultados igual) | ⚠️ | ✅ | Pendientes mezclados con verificadas |
| 3 | Cola org | `a04-admin-cola-empty` | — | **Puente org pendiente → cola** | ❌ | ✅ vacío | [POCO INTUITIVO] hay que "Proponer verificación" primero |
| **4** | Cola matrícula (govt) | `a04-gob-cola-matricula-empty` | — | Scope vs localidad del solicitante | ✅ empty | ✅ | govt@ = TDF/Santa Cruz, no CABA |
| **5** | Org panel permisos | `a05-org-panel-permisos-block` | Lista completa caps en panel | Link a matriz editable | ⚠️ | ⚠️ | Read-only OK onboarding; act 5 necesita `/permisos` |
| 5 | Matriz permisos | `a05-org-permisos-error` | — | **Toda la página** | ❌ | ❌ | **500 sin-digest — BLOCKER** |
| **7** | Gob panel + filtros | `a07-gob-panel` | Widget cola vs realidad | Alinear "Ver todos (20)" | ⚠️ | ✅ | Filtros provincia/localidad presentes |
| 7 | Reglas gob | `a07-gob-reglas-error` | — | **Toda la ruta** | ❌ | ❌ | **500 — BLOCKER** |
| 7 | Reglas admin árbol | `a07-admin-reglas-tree` | 24 provincias scroll | Buscador provincia/localidad | ⚠️ | ⚠️ | Operable pero lento |
| 7 | Reglas Palermo drill | *(error page)* | — | **Drill-down localidad** | ❌ | ❌ | `/admin/reglas/AR/CABA/Palermo` → 500 |

---

## Hallazgos (severidad)

### Blocker

| ID | Acto | Hallazgo | Evidencia |
|----|------|----------|-----------|
| **B1** | 5 | **`/org/[token]/admin/permisos` crashea** ("Algo salió mal", sin-digest). Nav lateral "Permisos" es un callejón sin salida — imposible conceder `event.write` en matriz. | orgadmin@ → `DIM-8PZY-92FC/admin/permisos` |
| **B2** | 7 | **`/gob/reglas` crashea** para govt@ — el operador jurisdiccional no puede actuar reglas desde su portal. | govt@ → `/gob/reglas` |
| **B3** | 7 | **Drill-down localidad crashea** (`/admin/reglas/AR/CABA/Palermo`) — el árbol carga pero no se puede entrar a Palermo para crear/editar regla. | admin@ → URL directa |

### Mayor

| ID | Acto | Hallazgo | Evidencia |
|----|------|----------|-----------|
| **M1** | 3 | **Verificación org es two-step oculto:** org recién registrada no aparece en `/cola` hasta "Proponer verificación" en `/organizaciones`. [POCO INTUITIVO] El operador genesis espera cola tras registro ciudadano. | Cola vacía vs botones Proponer |
| **M2** | 3/7 | **Widget cola miente:** panel gob/admin muestra "Ver todos (20)" / admin "Cola pendiente 1" pero `/cola` filtrada vacía en scope. | `a07-gob-panel` vs `/gob/cola` |
| **M3** | 1 | **Sidebar mezcla ES/EN:** "Govts" vs "Gobiernos" en breadcrumb — fricción identidad institucional. | Nav admin |
| **M4** | 3 | **`?verified=false` no filtra** — query ignorada, 12 resultados incluyen verificadas. | `/admin/organizaciones?verified=false` |
| **M5** | — | **Relay imposible sin reset:** seed precarga govts/orgs/approvals; Génesis coherencia no evaluable end-to-end en este entorno. | Precondición handoff |

### Menor

| ID | Hallazgo |
|----|----------|
| m1 | Form crear govt: localidades marcadas "Opcional" — en genesis act 1 son obligatorias para scope govt |
| m2 | Panel org: bloque "Tus permisos" duplica nav Permisos (15 filas) — útil día 1, ruido act 5 |
| m3 | Admin reglas: 24 provincias sin buscador — scroll largo para CABA/Palermo |
| m4 | Picker localidad govt-new: instante "Sin resultados" antes de mostrar Palermo (CABA) — flicker |

---

## Log de side-effects

| Acción | Efecto persistente |
|--------|-------------------|
| Login admin / govt / orgadmin | Sesiones cookie |
| `proposeOrgVerification` Refugio Pendiente Verificación | `approval_request` pending (seed org Recoleta) — **no aprobado** |
| Admin panel tras propuesta | Widget "Cola pendiente 1" (M2) |
| Navegación omnibox / filtros gob | Solo UI |
| **No ejecutado** | Crear govt, aprobar cola, verify org final, grants, editar reglas, revocar verificación |

---

## Veredicto

| Criterio | Resultado |
|----------|-----------|
| Blockers = 0 | ❌ **3** (B1 permisos, B2 gob reglas, B3 drill-down) |
| Majors ≤ 5 | ❌ **5** (M1–M5, en el límite) |
| Relay Génesis completo | ❌ **No** — actos 2/6 ciudadano ausentes; precondición mundo vacío |
| **PASS Génesis OPERADOR** | **FAIL** |

### Síntesis

- **Act 1 (alta govt)** es UX limpia y autocontenida; el picker Palermo funciona. En mundo vacío sería el primer paso natural.
- **Act 3 (verificar org)** es el talón de Aquiles del relay: la cola no refleja orgs pendientes hasta un paso manual no documentado en el storyline Génesis. Rompe la narrativa "ciudadano registra → operador aprueba en cola".
- **Act 5 y 7** no son evaluables: rutas críticas devuelven error genérico en build prod. El árbol `/admin/reglas` carga pero el punchline (tocar regla en localidad y ver efecto) no puede ejecutarse.

### Remediación mínima (re-run)

1. Fix 500 en `permisos/page.tsx`, `gob/reglas/page.tsx`, `gob/reglas/[country]/[province]/[locality]/page.tsx` (revisar logs server `:3000`).
2. Unificar cola: org `verified=false` debería aparecer en cola **o** el storyline debe decir "Proponer verificación" explícitamente.
3. Alinear widget cola del panel con `/cola` scoped.
4. Reset DB + kick Cowork act 2 → retomar operador en `AWAITING VERIFY`.

---

## Handoff a Cowork (ciudadano)

El operador dejó el ledger en `docs/reviews/results/genesis-ledger.md`. Cowork debe:

1. Act 2: signup + primera mascota → append pet token.
2. Act 3: registrar refugio/clínica → `AWAITING VERIFY` con ORG-token.
3. Act 4: pedir matrícula vet → `AWAITING APPROVE`.
4. Act 6: vida (vacuna firmada, adopción, mordedura, perdida) **después** de 3✓ 4✓ 5✓.

Operador retoma cuando el ledger muestre los `AWAITING → ✓` correspondientes.
