# UX Gate Adversarial — Cursor (OPERADOR)

**Agente:** Cursor (OPERADOR)  
**Fecha:** 2026-07-06  
**Entorno:** `http://localhost:3000` (build producción local, seed demo)  
**Viewport:** desktop (default browser)  
**Cuentas:** `govt@dim.test`, `admin@dim.test`, `orgadmin@dim.test` (`DIM-HSPR-M285`), `alejo@dim.test` (`DIM-UBHY-TCH5`), `owner@dim.test` — contraseña `Test1234!`  
**Alcance:** Caminos infelices operador — empty states, validación de formularios, inputs raros, lookup Atender, doble-submit, back en wizard, deep URLs malas, sesión sin auth.

Screenshots: `docs/reviews/results/uxgate-adversarial-cursor-screenshots/` (`a01`–`a13`).

**Side-effects:** ninguno irreversible. Solo navegación, fills de prueba, login/logout entre cuentas. Sin aprobar cola, sin confirmar mordedura, sin crear ingreso/servicio, sin decomisar.

---

## Veredicto

| Criterio | Resultado |
|----------|-----------|
| Blockers | **0** |
| Mayores | **4** (límite ≤5) |
| **PASO** | **SÍ** |

---

## Matriz borde × gracia

| Probe | Cuenta / ruta | ¿Falla con gracia? | Severidad | Screenshot |
|-------|---------------|-------------------|-----------|------------|
| Sin auth → `/gob/casos`, `/admin`, `/gob/casos/CAS-NO-EXISTE` | anónimo | ✅ Redirect limpio a `/login` | — | `a01-unauth-gob-casos-redirect-login.png` |
| Auth → `/org/TOKEN-FALSO/mascotas` | alejo@ | ✅ 404 “No encontramos esta página” + volver | — | `a02-org-fake-token-404.png` |
| Auth → `/gob/casos/CAS-NO-EXISTE` | govt@ | ✅ 404 con “Volver al panel” | — | `a10-gob-caso-fake-404.png` |
| Auth → `/mis-mascotas/DEMO-PET-001` sin ownership | orgadmin@ | ✅ 404 (authz, no crash) | — | `a12-sheet-inexistente-no-access-404.png` |
| `?sheet=inexistente` en perfil dueño | owner@ | ✅ Perfil carga; sheet ignorado (sin crash) | Menor | `a13-sheet-inexistente-silent-ignore.png` |
| Empty — clínica sin animales | alejo@ `/org/DIM-UBHY-TCH5/mascotas` | ✅ Copy claro | — | `a03-clinic-mascotas-empty.png` |
| Empty — cola gob | govt@ `/gob/cola` | ✅ “No hay solicitudes pendientes en tu scope” | Menor* | `a09-gob-cola-empty.png` |
| Empty — transferencias salientes | orgadmin@ | ✅ “Todavía no propusiste ninguna transferencia” | — | `a11-org-transferencias-empty.png` |
| Atender `ABC` | alejo@ | ✅ Alert: formato DIM-XXXX-XXXX | — | `a04-atender-invalid-format-ABC.png` |
| Atender `DIM-ZZZZ-ZZZZ` | alejo@ | ✅ Alert: no se encontró mascota | — | `a05-atender-not-found-DIM-ZZZZ-ZZZZ.png` |
| Atender `DIM-TOMC-0008` (fallecida) | alejo@ | ✅ Alert: fallecida, no acepta eventos | — | `a06-atender-deceased-DIM-TOMC-0008.png` |
| Atender vacío (submit) | alejo@ | ⚠️ Solo HTML5 `required`; sin copy app | Menor | — |
| Atender doble-click | alejo@ | ✅ Botón → “Buscando…” `disabled` | — | (observado en sesión) |
| Servicios wizard — Continuar sin tipo/nombre | alejo@ | ❌ Avanza a paso 2/3; error HTML5 en campo oculto al final | **Mayor** | `a07-servicios-wizard-skip-validation.png` |
| Mordedura wizard — Continuar con token `ABC` | alejo@ | ❌ Avanza a paso 2 sin validar token | **Mayor** | `a08-mordedura-wizard-invalid-token-advance.png` |
| Intake — emoji/SQL en nombre | orgadmin@ | ⚠️ UI acepta texto; Continuar bloqueado sin especie; submit no ejecutado | Menor | — |
| Rol owner/vet → `/gob/cola` | alejo@ (post-logout owner path) | ⚠️ Redirect a `/mis-mascotas` sin explicar | **Mayor** | — |
| Panel widget cola vs `/gob/cola` | govt@ | ❌ Panel “Ver todos (20)” vs cola vacía en scope | **Mayor** | `a09-gob-cola-empty.png` + panel snapshot |
| Atender — error stale al editar código | alejo@ | ⚠️ Alert anterior visible hasta nuevo submit | **Mayor** | `a05` (muestra error ZZZZ con input TOMC) |

\*Menor derivado del mayor A4 (inconsistencia panel/cola).

---

## Hallazgos (severidad)

### Blocker

*(ninguno — sin pantalla en blanco, crash, ni silencio tragado en mutaciones irreversibles)*

### Mayor

| ID | Superficie | Hallazgo | Evidencia |
|----|------------|----------|-----------|
| **A1** | Wizards org (`servicios/nuevo`, `mordedura/nuevo`, patrón `LnWizardShell`) | **[POCO INTUITIVO]** `Continuar` avanza de paso sin validar campos del paso actual (`onClick={() => setStep(n)}` sin `checkValidity`). El usuario llega al paso 3 y al pulsar “Crear servicio” el navegador valida campos `sr-only` del paso 1 — error fuera de contexto visible. Misma falla en mordedura con token `ABC` inválido. | `a07`, `a08`; `ServiceOfferingForm.tsx` L103–105 |
| **A2** | `/gob` Panel → `/gob/cola` | **[POCO INTUITIVO]** Widget “Cola de aprobaciones” muestra vacío local pero enlace **“Ver todos (20) →”** lleva a cola también vacía (“No hay solicitudes pendientes en tu scope”). Operador no distingue “20 fuera de scope” vs contador roto. | Panel `e60` vs `/gob/cola` `e37` |
| **A3** | `/org/…/atender` | **[POCO INTUITIVO]** Tras un error de lookup, si el operador edita el campo sin re-enviar, el `role=alert` sigue mostrando el mensaje del intento anterior (p. ej. error de `DIM-ZZZZ-ZZZZ` mientras el input ya tiene `DIM-TOMC-0008`). | `a05` frame intermedio |
| **A4** | Auth cross-portal | **[POCO INTUITIVO]** Usuario personal (`alejo@`) que navega a `/gob/cola` es redirigido a `/mis-mascotas` sin mensaje (“no tenés permiso” / “portal gobierno”). No rompe, pero parece bug de routing. | Navegación observada en sesión |

### Menor

| ID | Hallazgo |
|----|----------|
| a1 | Atender: submit vacío solo dispara tooltip HTML5 nativo; sin mensaje en español de la app. |
| a2 | `?sheet=inexistente`: ignorado silenciosamente — correcto técnicamente, pero deep-link roto no avisa. |
| a3 | Intake: nombre acepta emoji + string tipo SQL en UI; validación server no probada (no se llegó a “Crear ingreso”). |
| a4 | Mordedura paso 2: fecha futura (`2030-12-31`) no bloqueada en cliente antes de Continuar (validación server no probada). |
| a5 | Permisos org (`/org/…/admin/permisos`): no se probó submit inválido en esta sesión — cola vacía en refugio seed. |
| a6 | `/org/…/intake/nuevo` (ruta inventada) → 404 genérico; la ruta real es `?tab=registrar`. |

---

## Profundidad por categoría solicitada

### Empty states

| Superficie | Resultado |
|------------|-----------|
| Clínica sin mascotas (`DIM-UBHY-TCH5/mascotas`) | ✅ Autocontenido, CTA “Registrar ingreso” |
| Cola gob vacía en scope | ✅ Honesto; inconsistente con widget panel (A2) |
| Transferencias salientes vacías | ✅ Icono + copy |
| Refugio con 3 animales en custodia | No vacío — se usó clínica vacía como contraste |

### Errores de formulario (sin confirmar)

| Form | Probe | Resultado |
|------|-------|-----------|
| Servicios nuevo | Submit sin tipo/nombre | ❌ Wizard skip (A1); HTML5 al final |
| Mordedura nuevo | Token `ABC` + Continuar | ❌ Avanza paso (A1) |
| Intake registrar | Sin especie | ✅ `Continuar` disabled |
| Intake registrar | Nombre raro + especie | UI acepta; no submit |

### Inputs raros

| Campo | Input | Resultado |
|-------|-------|-----------|
| Atender código | `ABC` | ✅ Error formato |
| Atender código | `DIM-ZZZZ-ZZZZ` | ✅ No encontrado |
| Atender código | `DIM-TOMC-0008` | ✅ Fallecida |
| Intake nombre | `🐕'; DROP TABLE…` | ⚠️ Aceptado en UI (menor) |

### Atender — resumen lookup

Todos los códigos malos probados fallan con mensaje claro en `role=alert` (es-AR). Doble-submit mitigado con botón `busy` + `disabled`.

### Doble-submit / back wizard

| Acción | Resultado |
|--------|-----------|
| Doble-click “Buscar mascota” | ✅ Un solo request; UI “Buscando…” |
| Back “Paso anterior” (servicios) | ✅ Presente en pasos 2–3 (`LnWizardShell.onBack`) |
| Back browser mid-mordedura | No probado exhaustivamente — wizard mantiene estado en cliente |

### Deep URLs

| URL | Auth | Resultado |
|-----|------|-----------|
| `/gob/casos/CAS-NO-EXISTE` | no | → `/login` |
| `/gob/casos/CAS-NO-EXISTE` | govt | 404 |
| `/org/TOKEN-FALSO/mascotas` | alejo | 404 |
| `/mis-mascotas/DEMO-PET-001?sheet=inexistente` | owner | Perfil OK, sheet ignorado |
| `/org/DIM-HSPR-M285/intake/nuevo` | orgadmin | 404 (ruta incorrecta) |

### Sesión

| Probe | Resultado |
|-------|-----------|
| Operador sin auth → `/gob/*`, `/admin/*` | ✅ Redirect `/login` |
| Rol personal → `/gob/cola` | Redirect `/mis-mascotas` (A4) |

---

## Log de side-effects

| Acción | Efecto persistente |
|--------|-------------------|
| Login/logout entre govt, orgadmin, alejo, owner | Cookies de sesión — revertido |
| Fills de prueba en forms (servicios, mordedura, intake, atender) | Ningún registro creado |
| Lookups Atender (ABC, ZZZZ, TOMC) | Solo lectura; sin eventos |
| Navegación deep URL | Ninguno |

---

## Tokens útiles (seed actual)

| Actor | Org / nota |
|-------|------------|
| Clínica Alejo | `DIM-UBHY-TCH5` (no `DIM-6TZM-DUJZ`) |
| Refugio orgadmin | `DIM-HSPR-M285` |
| Mascota fallecida (Atender) | `DIM-TOMC-0008` |
| Dueño demo + sheet test | `owner@dim.test` → `DEMO-PET-001` |

---

## Recomendaciones (fuera de scope del gate)

1. **A1:** Validar paso en `Continuar` (`reportValidity()` o Zod por paso) antes de `setStep`.
2. **A2:** Aclarar en widget si el contador es universal vs scope, o alinear query.
3. **A3:** Limpiar `state.error` en `onChange` del código Atender.
4. **A4:** Redirect de portal con toast “No tenés acceso al portal gobierno”.
