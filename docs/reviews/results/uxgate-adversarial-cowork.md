# UX Gate Adversarial — Cowork (CIUDADANO)

**Agente:** Cursor (CIUDADANO)  
**Fecha:** 2026-07-06  
**Entorno:** `http://localhost:3000` (build producción local, seed demo)  
**Viewport:** desktop (default browser)  
**Cuentas:** `owner@dim.test` (10 mascotas demo), `owner2@dim.test` (no probado en vivo — ver nota), flujos públicos sin login — contraseña `Test1234!`  
**Alcance:** Caminos infelices ciudadano — empty states, validación de formularios, inputs raros, búsqueda pública DIM/DEN, doble-submit, back en wizard denuncia, deep URLs malas, toggles de privacidad (sin flip Tier-2), sesión sin auth.

Screenshots: `docs/reviews/results/uxgate-adversarial-cowork-screenshots/` (`c01`–`c14`).

**Side-effects:** ninguno irreversible. Solo navegación, fills de prueba, login/logout entre cuentas. Sin enviar denuncia final, sin borrar cuenta, sin habilitar Tier-2 permanente ni generar link de libreta compartida. Toggle de vencimiento en sheet Compartir (solo UI, sin submit).

**Exclusión deliberada:** no se activó el flip 3D credencial/libreta (freeze conocido en fix). Perfil cargó en vista Credencial sin colgarse.

---

## Veredicto

| Criterio | Resultado |
|----------|-----------|
| Blockers | **0** |
| Mayores | **2** (límite ≤5) |
| **PASO** | **SÍ** |

---

## Matriz borde × gracia

| Probe | Cuenta / ruta | ¿Falla con gracia? | Severidad | Screenshot |
|-------|---------------|-------------------|-----------|------------|
| Sin auth → `/mis-mascotas` | anónimo | ✅ Redirect limpio a `/login` | — | `c01-unauth-mis-mascotas-login.png` |
| Sin auth → `/cuenta`, `/inicio` | anónimo | ✅ Redirect a `/login` | — | (misma sesión) |
| Público `/p/DIM-NO-EXISTE` | anónimo | ✅ “No encontramos esa credencial” + CTAs | — | `c02-public-credential-not-found.png` |
| Público `/denuncias/codigo/DEN-MALFORMADO` | anónimo | ⚠️ Mismo copy de credencial, no de denuncia | Menor | — |
| Auth → `/mis-mascotas/DIM-NO-EXISTE` | owner@ | ✅ 404 genérico + volver | — | `c09-auth-pet-token-not-found.png` |
| Auth → `?sheet=inexistente` | owner@ DEMO-PET-001 | ✅ Perfil carga; sheet ignorado | Menor | `c12-sheet-inexistente-silent.png` |
| Auth → `?sheet=compartir` | owner@ | ✅ Sheet abre; cierre limpia URL | — | `c14-compartir-sheet-privacy.png` |
| Landing CrisisBand — buscar vacío | anónimo | ✅ Alert “Ingresá un código para buscar.” | — | `c10-crisis-search-empty.png` |
| Landing CrisisBand — `DEN-ABC` malformado | anónimo | ✅ (cliente valida formato DEN; no navega) | — | (observado en sesión) |
| Denuncia paso 1 — Continuar sin tipo | anónimo | ✅ Alert “Elegí una opción para continuar.” | — | `c03-denuncia-step1-no-selection.png` |
| Denuncia paso 2 — Continuar sin gravedad | anónimo | ✅ Alert “Elegí la gravedad para continuar.” | — | `c05-denuncia-step2-no-severity.png` |
| Denuncia paso 3 — Continuar sin descripción | anónimo | ✅ Alert “Contanos brevemente qué viste…” | Menor* | `c06-denuncia-step3-empty-description.png` |
| Denuncia — back “Paso anterior” paso 2→1 | anónimo | ✅ Vuelve con selección preservada | — | `c04-denuncia-back-mid-wizard.png` |
| Login — submit vacío | anónimo | ⚠️ Solo HTML5 `required` | Menor | (en `c01`) |
| Login — email inválido | anónimo | ⚠️ Tooltip HTML5 nativo (inglés) | Menor | `c07-login-invalid-email-html5.png` |
| Login — credenciales incorrectas | anónimo | ✅ “Correo o contraseña incorrectos.” | — | `c08-login-wrong-password.png` |
| Login — doble-click submit | anónimo | ✅ Botón → “Ingresando…” `disabled` | — | (observado en sesión) |
| Signup paso 1 — Continuar vacío | anónimo | ⚠️ Solo HTML5 `required` | Menor | `c11-signup-empty-html5.png` |
| Editar perfil — nombre vacío | owner@ | ⚠️ Solo HTML5 `required` en campo | Menor | `c13-editar-perfil-empty-name.png` |
| Compartir — toggle vencimiento rápido | owner@ | ✅ Sin crash ni estado roto | — | `c14-compartir-sheet-privacy.png` |
| Empty — cuenta 0 mascotas | owner2@ | ⏭️ No ejecutado (seed trae 1 mascota) | — | — |
| Flip 3D credencial/libreta | owner@ | ⏭️ Omitido (freeze conocido) | — | — |

\*Menor derivado: mensaje de error al pie del paso 3, no junto al textarea.

---

## Hallazgos (severidad)

### Blocker

*(ninguno — sin pantalla en blanco, crash, ni mutación irreversible)*

### Mayor

| ID | Superficie | Hallazgo | Evidencia |
|----|------------|----------|-----------|
| **C1** | Perfil mascota — bloque Cumplimiento / PPP | **[POCO INTUITIVO]** Con raza **Boxer** ya visible en el hero de la credencial, el sello PPP muestra **“FALTAN DATOS”** y pide “Completá la raza y el peso…”. El dueño no entiende qué falta ni por qué el contador queda en **0 de 4 al día** con datos aparentemente completos. | `c12-sheet-inexistente-silent.png` |
| **C2** | Sheet `?sheet=compartir` | **[POCO INTUITIVO]** Dos bloques de duración en el mismo sheet (**VENCIMIENTO** del link de libreta vs **DURACIÓN** del Tier 2) compiten visualmente; el scroll corta el CTA verde y mezcla conceptos (link privado LBR vs Tier 2 público). Sin flip Tier-2 probado, pero la densidad ya confunde antes del commit. | `c14-compartir-sheet-privacy.png` |

### Menor

| ID | Hallazgo |
|----|----------|
| c1 | Login, signup y editar perfil: validación vacía depende de HTML5; sin mensaje de app en español unificado (tooltip del navegador en inglés en email inválido). |
| c2 | `?sheet=inexistente`: ignorado silenciosamente — correcto técnicamente; deep-link roto no avisa. |
| c3 | Denuncia paso 3: error de descripción vacía aparece **debajo del mapa**, lejos del campo obligatorio. |
| c4 | `/denuncias/codigo/DEN-MALFORMADO`: reutiliza pantalla “No encontramos **esa credencial**” (copy de mascota, no de denuncia). |
| c5 | Empty state 0 mascotas: UI existe (`LnEmptyState` en `/mis-mascotas`) pero **no se probó en vivo** — `owner2@dim.test` tiene mascota “Rocco” en seed. |
| c6 | Denuncia: doble-click en “Continuar” y submit con emoji/SQL en descripción no ejecutados (wizard abortado antes del paso 4). |
| c7 | Alta de mascota (`/mis-mascotas/nueva`) con inputs raros / fecha futura: no probado en esta sesión. |

---

## Profundidad por categoría solicitada

### Empty states

| Superficie | Resultado |
|------------|-----------|
| `/mis-mascotas` sin mascotas | ⏭️ No live — seed `owner2@` trae 1 pet; código muestra `LnEmptyState` “No tenés mascotas registradas” + CTA “Cargar una mascota”. |
| Owner con 10 mascotas | ✅ Lista densa pero legible en `/inicio` y `/mis-mascotas`. |

### Errores de formulario (sin confirmar)

| Form | Probe | Resultado |
|------|-------|-----------|
| Login | Vacío / email inválido / pass incorrecta | ⚠️ HTML5 en vacío/inválido; ✅ mensaje app en credenciales malas |
| Signup paso 1 | Continuar vacío | ⚠️ HTML5 only |
| Editar perfil | Nombre vacío | ⚠️ HTML5 `required` |
| Denuncia wizard | Skip pasos 1–3 | ✅ Alerts claros en es-AR por paso |

### Inputs raros

| Campo | Input | Resultado |
|-------|-------|-----------|
| CrisisBand | vacío | ✅ Error inline |
| CrisisBand | `DEN-ABC` | ✅ Bloqueado por validación cliente (formato DEN) |
| Denuncia descripción | (no llegó a probarse) | ⏭️ Abortado en paso 3 |

### Búsqueda pública DIM/DEN

| Código | Resultado |
|--------|-----------|
| vacío en landing | ✅ “Ingresá un código para buscar.” |
| `DIM-NO-EXISTE` en `/p/` | ✅ Pantalla amigable |
| `DEN-MALFORMADO` en `/denuncias/codigo/` | ⚠️ Copy genérico de credencial |

### Doble-submit / back wizard

| Acción | Resultado |
|--------|-----------|
| Doble-click login | ✅ “Ingresando…” + disabled |
| Back denuncia paso 2→1 | ✅ Selección de abandono preservada |
| Doble-click denuncia Continuar | ⏭️ No probado |

### Deep URLs

| URL | Resultado |
|-----|-----------|
| `/mis-mascotas/DIM-NO-EXISTE` (auth) | ✅ 404 |
| `/p/DIM-NO-EXISTE` (público) | ✅ Not found credencial |
| `?sheet=inexistente` | ✅ Ignorado |
| `?sheet=compartir` | ✅ Sheet válido abre |

### Privacidad / toggles

| Acción | Resultado |
|--------|-----------|
| Radios vencimiento 7d ↔ 30d en Compartir | ✅ Responden sin error |
| Habilitar Tier 2 / flip 3D | ⏭️ **No ejecutado** (instrucción de gate) |

### Sesión

| Ruta protegida sin auth | Resultado |
|-------------------------|-----------|
| `/mis-mascotas`, `/cuenta`, `/inicio` | ✅ → `/login` |

---

## Side-effects log

| Timestamp (aprox.) | Acción | Efecto persistente |
|--------------------|--------|-------------------|
| Sesión | Login/logout `owner@dim.test` | Ninguno (perfil no guardado tras prueba nombre vacío — Cancelar) |
| Sesión | Denuncia wizard pasos 1–3 | Ninguno (sin submit final) |
| Sesión | Toggle 30d en sheet Compartir | Solo estado UI local; sheet cerrado sin Generar link |
| Sesión | Navegación pública | Ninguno |

---

## Comparación con gate operador (misma build)

El wizard de **denuncia ciudadana valida por paso** (alerts en es-AR), a diferencia del patrón operador en servicios/mordedura (skip de paso documentado en `uxgate-adversarial-cursor.md` A1). El lado ciudadano tolera mejor los bordes de formulario multi-paso en denuncias.

---

## Recomendaciones PO (no bloqueantes)

1. **C1:** Ajustar copy PPP cuando `breed` está seteada — pedir solo peso faltante o explicar que falta evento verificado.
2. **C2:** Separar visualmente “Link libreta privada” vs “Tier 2 en credencial pública” (acordeón o sub-tabs dentro del sheet).
3. Unificar validación cliente en login/signup/editar con mensajes `role=alert` en es-AR (patrón ya usado en denuncia).
4. Pantalla 404 de código DEN con copy específico (“No encontramos esa denuncia”).
5. Crear cuenta seed `owner-empty@dim.test` (0 mascotas) para gates futuros de empty state.

---

*Generado por gate adversarial ciudadano — Cowork/Cursor, 2026-07-06.*
