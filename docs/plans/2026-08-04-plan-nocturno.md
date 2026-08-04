# Plan nocturno — 2026-08-04

> **BORRADOR.** Ignacio va a sumar hallazgos; los bloques de abajo son lo que
> hoy está verificado como abierto. Nada acá se ejecuta hasta que el plan cierre.

## Punto de partida (verificado hoy, no de memoria)

| Hecho | Evidencia |
|---|---|
| CI **verde entero** por primera vez desde el 30/07 | run `30873868074` (push y pull_request), 6/6 jobs, e2e incluido |
| Rama `integration/all-20260703` = rama de producción del proyecto Vercel | cada push despliega staging solo |
| 13 de 15 PRs abiertas ya están absorbidas en HEAD | `git merge-base --is-ancestor origin/<branch> HEAD` una por una |
| PENDIENTES.md describe como abierto todo el bloque e2e que se cerró hoy | comparar su §"Tests que no guardan nada" contra el run verde |

**El activo a proteger es el verde.** Cualquier trabajo de esta corrida entra por
`pnpm verify` + `pnpm test` + el job de e2e. Un rojo nuevo se arregla o se
revierte antes de seguir — un e2e rojo permanente es justamente la deuda que
acabamos de pagar con siete iteraciones.

---

## Bloque 0 — LIMPIEZA (obligatorio, corre primero)

> **Por qué va primero y por qué no es opcional.** Hoy, en un solo día, se
> encontraron: un bloque entero de PENDIENTES.md describiendo como abierto lo
> que ya estaba verde, 44 rutas muertas en la documentación, una sección de
> privacidad que se contradecía a sí misma, un README afirmando un CHECK de
> base de datos que una migración había borrado, 13 PRs abiertas ya mergeadas,
> y **dos documentos declarándose cada uno "la fuente única de pendientes"**.
> Ninguno de esos era un bug de producto: todos eran **registros que mienten**.
> Un plan nocturno que arranca leyendo registros podridos gasta la noche
> arreglando cosas arregladas. Esto se limpia antes de tocar código.

### 0.1 — Una sola cola (la decisión estructural)

Hoy compiten `docs/plans/PENDIENTES.md` (31/07) y
`docs/superpowers/plans/2026-06-24-CONSOLIDATED-pending-backlog.md` (24/06),
**ambos** autodenominados fuente única. Acción:

1. Verificar ítem por ítem cada cola contra el código.
   **Cola vieja (24/06) — VERIFICADA 2026-08-04**: de sus 11 ítems accionables,
   **8,5 están hechos**. Sólo sobreviven **A1** (chapa física `/t/[serial]` — no
   existe `pet_tags` ni la ruta; spec activa, decisiones de producto abiertas) y
   la mitad-feature de **A5** (dual-routing del formulario "¿Encontraste?" al
   refugio de origen). Residual de ops: el toggle de leaked-password en el
   dashboard de Supabase (A9), que no es código.
2. **Ojo con el orden**: A1 y A5 **no están en `PENDIENTES.md`**. Archivar la
   cola vieja sin migrarlos primero **pierde su único contenido vivo** — la
   cola nueva no la está duplicando, la está ignorando. Migrar esas dos filas
   (con su evidencia), recién después archivar con nota de a dónde fue cada cosa.
3. Regla que queda escrita en la cola sobreviviente: **todo ítem lleva la
   evidencia con la que se verificó y la fecha**. Un ítem sin evidencia
   re-verificable no entra.

### 0.2 — Cerrar lo que ya está cerrado

4. **Cerrar las 13 PRs absorbidas**, cada una con un comentario que diga en qué
   rama quedó. No tocar #760 (la nuestra) ni #762 (review slice, "do not merge").
5. **Cerrar el bloque e2e de PENDIENTES.md** con la evidencia del run verde
   (`30873868074`), incluyendo las filas "E2E no es un gate — 33 ubicaciones
   rojas", el presupuesto de login por email, `a11y-operator-auth`,
   `crisis-seams (d)`, el `pet-carousel-dots` muerto y P2.5.
6. **Mover a "decidido"** las tres decisiones que el PO tomó hoy.

### 0.3 — Los otros registros

7. **Triage de los 18 planes activos — HECHO 04/08.** Resultado: **~12 están
   shippeados** y se archivan. Siguen vivos sólo tres: `spec-later-tracker`
   (registro, no plan), `bite-from-unowned-animal` (backlog explícitamente
   gateado) y `physical-credential-hub` (nunca arrancado). Dos necesitan
   decisión: `executive-e2e-readiness` (re-correr el gate hoy que está verde) y
   `strangler-finish-plan` (residual real: `app/actions/decomiso.ts` 506 líneas
   y `return-to-owner.ts` 263 siguen gordos, no son shims).

   > **Dos planes tienen el encabezado al revés**: `lib-bucketize-plan.md` y
   > `strangler-finish-plan.md` dicen "PLANNED — not started" y el trabajo está
   > hecho (el primero, entero: `lib/` root tiene **cero** `.ts` sueltos). Y no
   > es anécdota: **esa bucketización es justo la que dejó 44 rutas muertas en
   > los docs hoy.** El documento que te habría avisado que pasó, dice que no
   > pasó. Corregir encabezados antes de archivar.
8. **`spec-later-tracker`**: sus 3 entradas están bloqueadas por decisiones
   EXTERNAS (export PPP CABA, credencial de perro guía Ley 26.858, documentos de
   viaje). No son trabajo nuestro — quedan marcadas como "esperando a terceros"
   para que nadie las levante como tarea.
9. **37 TODO/FIXME en código productivo**: barrido de clasificación — cuáles son
   deuda real y cuáles son comentarios que envejecieron. No arreglarlos todos;
   convertir los reales en ítems de la cola y borrar los muertos.

### 0.3-bis — Corregir las descripciones que quedaron mintiendo

La verificación del 04/08 encontró **ocho ítems cuya descripción ya no describe
la realidad**, incluso donde el problema de fondo sigue vivo. Un ítem con el
número o el mecanismo equivocado manda a alguien al lugar equivocado:

- "8 políticas sin `TO`" → **son 10** (en 8 tablas).
- Fence N3: "fuera de sus **dos** globs, 8 `redirect()`" → tiene **cuatro**
  globs y la deuda son **~12 `redirect()` en 10 archivos** de casos de uso.
- "Cuatro copias de `stripComments`" → quedan **dos**.
- `PanoramaConsole`: "47 `waitFor`" → **59**.
- `lint:nav`: "20 sitios vivos" → **~25 líneas en 22 archivos**.
- RA-9 EI-4: "dos gates de axe" → **tres** self-skips.
- RA-7 F8: la primera cláusula **mischaracteriza** el test de grano provincia.
- **RA-2 F4: sus citas apuntan hoy al arreglo, no al defecto.**
- **RA-4 F6 es inverificable como está escrito** — sin archivo ni símbolo. Se
  reescribe con evidencia o se cierra.

### 0.4 — Que no se vuelva a pudrir

10. Antes de cerrar la corrida, **re-verificar el propio plan**: cada ítem que
    quedó abierto se vuelve a contrastar contra el árbol. Lo que se arregló
    durante la noche se marca cerrado **con la evidencia**, no con una promesa.

### 0.5 — El barrido que la auditoría de hoy NO cubrió

La auditoría de docs de hoy contrastó los documentos contra el código **que
citaban**. El claim del CHECK de `account_type` se escapó porque no citaba nada
— apareció después, cruzando la cola vieja contra el árbol. Falta:

- Barrer AGENTS.md/README buscando afirmaciones **sin cita** sobre garantías de
  la base de datos, de seguridad o de privacidad, y verificar cada una. Son las
  peligrosas: nadie las chequea justamente porque no apuntan a ningún archivo.

---

## Bloque 1 — LOS GATES MIENTEN (el peso real de la corrida)

Verificado ítem por ítem el 04/08. **Todos REALES** — es el único bloque que
sobrevivió entero a la verificación. Con los números corregidos, porque los del
documento ya no daban:

| Qué | Verificado | Corrección al documento |
|---|---|---|
| **10 archivos `"use server"` fuera del glob** de los tres linters de authz (`check-authz-guards.ts:455`) — incluye `atender/actions.ts` con 8 exports de escritura médica | REAL, conteo exacto | los tres comparten `listActionFiles`, así que el punto ciego es **uno solo, triplicado** |
| **`check-authz-scoping` se derrota con un comentario** (`:114-141`): corre `/jurisdiction/i` contra el cuerpo **sin stripear comentarios** | REAL | baseline de 41 acciones, coincide |
| **`check-rls-coverage` no mira contenido**: sólo `relrowsecurity` + que exista ≥1 policy | REAL | nunca inspecciona roles, `TO`, `USING` ni GRANTs |
| **Políticas sin cláusula `TO`** → caen a `PUBLIC` | REAL | **son 10, no 8** (en 8 tablas; `achievement_views` aporta 3). Siguen seguras por predicado `auth.uid()`, no por diseño |
| **`middleware.ts` no hace autorización** (`:95-235`): sólo refresh de sesión, CSP, redirects, headers | REAL | cada ruta se auto-gatea, sin red |
| **`lint:nav` sólo prohíbe `router.refresh(`** mientras su docblock nombra push/replace | REAL | **~25 líneas vivas en 22 archivos**, no 20 |
| **El fence N3 reporta cero deuda falsamente** | REAL, mecanismo distinto | ya tiene **cuatro** globs (el agujero de `action.ts` se cerró); lo que queda fuera son los **módulos de caso de uso**: ~12 `redirect()` en 10 archivos bajo `src/modules/*/application/**` |
| **Copias propias de `stripComments`** | PARCIAL | quedan **dos** (`check-confused-deputy.ts`, `check-router-refresh.ts`), no cuatro — tres fences ya re-exportan del módulo compartido |

### Tests que no guardan nada — mitad cerrada hoy

**Cerrados (hoy)**: todo el bloque e2e (33 rojas → 0), el presupuesto de login
por email, `a11y-operator-auth`, `crisis-seams (d)`, el `pet-carousel-dots`
muerto, P2.5 (skeletons de Suspense) y **P2.8** (los 13 tests cross-tenant ya no
usan el patrón `expect(true).toBe(true)`: un fixture faltante ahora **tira**).

**Siguen reales**:

- **RA-4 F8** — un test de scope de gobierno que **nunca ejecutó una aserción**:
  un test anterior promueve al usuario a `vet`, así que el submit siempre falla
  y el test retorna en el `if (!submit.ok) return;` (`admin-decisions.test.ts:477`).
- **RA-4 F9** — un guard cross-org que **nunca llama a la acción que guarda**;
  el assert final filtra la fila de org2 por el id de org1: cero filas **por
  construcción del WHERE**.
- **`PanoramaConsole`** — **59** `waitFor` sin timeout explícito (eran 47 cuando
  se escribió el ítem), sin presupuesto declarado por archivo.
- **RA-9 EI-4/5/6** — **tres** self-skips dependientes de datos en
  `public-smoke.spec.ts` (no dos), incluido el "momento héroe" de la Ley 26.653;
  `qa-panorama-a11y.ts` no lo invoca ningún script ni workflow; dos asserts de
  touch-target sobre el documento entero.
- **RA-7 F8 `cube-parity`** — **la mitad**: el loop nacional saltea toda celda
  suprimida (`if (!cp) continue`), eso es vacuo y es verdad. Pero "a grano
  provincia compara literales contra literales" **mischaracteriza el test**:
  `normFeatures` compara dos sets calculados de forma independiente.
- **RA-4 F6** — **INVERIFICABLE como está escrito**: no cita archivo ni símbolo,
  y todos los tests de supresión-vs-cero que se encontraron sí inspeccionan
  valores. O se reescribe con evidencia, o se cierra.

---

## Bloque 2 — decisiones del PO, ya convertidas en trabajo

| Decisión | Trabajo concreto |
|---|---|
| Walk-in de Atender: **aviso + provenance** | El evento sigue entrando, marcado con provenance de walk-in no verificado, y el dueño recibe notificación inmediata. La irreversibilidad se acepta; la irreversibilidad **silenciosa** no. |
| `/gob` métricas: **estado honesto sin datos** | Reemplazar "las métricas con meta están dentro de rango" por "sin medición suficiente". Calcular metas reales por jurisdicción es trabajo aparte y **no bloquea** sacar la afirmación falsa. |
| Migración 0156: **corregir fuera del archivo** | La corrección va a docs + índice de migraciones. El ledger guarda sha256 de los bytes y `migrate.ts --strict` falla con deriva: no se edita una migración aplicada, ni sus comentarios. |

---

## Bloque 3 — issues de GitHub: 7 reales de 10

**Verificados uno por uno el 04/08** contra el árbol. De los 10: **1 ya estaba
arreglado** (#758 — cerrar), **2 necesitan re-scope** (#756 el bug de copy ya se
arregló, queda sólo la feature; #141 el código y el script de backfill están en
`main` desde los PRs #142/#453 — lo que queda es **ejecutarlo**, tarea de ops,
no de ingeniería), y **7 son reales**.

| # | Qué | Clase |
|---|---|---|
| #755 | Los badges del hero se aplastan contra el QR a 320px exactos | bug visual |
| #141 | Replay de notificaciones ENO — **el código y el script ya están en `main`**; queda EJECUTARLO contra los datos históricos | ops, no ingeniería |
| #754 | Drop de `pet_achievement_views` — migración destructiva, review propio | riesgo |
| #753 | Endurecer provenance de `dangerous_breed_attested`: quién puede emitirlo y con qué evidencia | integridad |
| #759 | No existe writer de UI/server-action para los tipos de evento de vigilancia | feature |
| #757 | Guiar al vet al canal profesional cuando actúa sobre una mascota que tiene en tránsito personal | feature |
| #756 | Acceso de escritura del vet vía link de libreta compartida. **El aviso engañoso ya se sacó** (hoy dice "Vista de sólo lectura"); queda la feature | feature, re-scopear |
| #752 | Rediseñar credencial pública `/p/{token}` + cartel al lenguaje visual de la Credencial DNI | diseño |
| #751 | Extraer helpers compartidos de pet-list/reminders + doctrina de footer en mis-turnos | refactor |

---

## Bloque 4 — 🟡 P3 / ⚪ P4 (deuda declarada)

- **P3**: panorama contándose distinto a sí mismo — denominadores anidados en
  datos abiertos (`perros_registrados` ⊂ `mascotas_activas`, la resta despeja
  las no-perro), dos claves de leyenda que describen estados que el frame puede
  no contener, el triage de maltrato que perdió la edad de una denuncia no
  vencida.
- **P4**: 21 pesos tipográficos inertes, 19 tamaños bajo el piso del ratchet, la
  libreta de vacunas que clipea a 390px, `role="img"` tragándose subárboles,
  `?chip=a&chip=b` → 500 (falla cerrado, sin fuga), el logo post-demo.

---

## Bloque R — batería de reviews de limpieza final

> **Premisa nueva: a partir de ahora entra gente de afuera a mirar.** Eso cambia
> el criterio. Hasta hoy el repo tenía que ser correcto; ahora tiene que ser
> **legible por alguien sin contexto y sin acceso a Ignacio**. Un tercero no
> pregunta: asume. Si el README miente, cree la mentira; si hay 126 ramas, no
> sabe cuál es la viva; si un doc afirma una garantía que no existe, la da por
> cierta y construye encima.
>
> **Reglas de la batería**: todas son read-only y corren en paralelo. Ninguna
> arregla nada — producen **hallazgos con evidencia** que entran a la cola
> única. Los arreglos son trabajo aparte y pasan por `verify` + `test` + e2e.
> Cada review declara además **qué NO miró**, para que su verde no se lea como
> más de lo que es.

| # | Review | La pregunta que contesta | Criterio de "limpio" |
|---|---|---|---|
| **R1** | **Arranque en frío** | ¿Alguien clona y llega a la app corriendo con datos, siguiendo el README **literalmente**, sin preguntar nada? | Camino completo verificado en carpeta limpia. Hoy falta `.env.example` (existe `docs/ops/env-handling.md`, pero el que llega no sabe que existe). |
| **R2** | **Afirmaciones sin cita** | ¿Qué garantías de DB, seguridad, privacidad o legales se afirman **sin apuntar a un archivo**? | Cada garantía apunta a su enforcement, o se reescribe como intención. **Esta es la clase que se escapó hoy**: el CHECK de `account_type` sobrevivió a la auditoría porque no citaba nada. |
| **R3** | **Superficie de riesgo** | ¿Hay algo en el repo que no quieras que lea un tercero? Secretos, PII real en seeds/fixtures, tokens en docs, datos personales en tests | Cero secretos; el mail personal que viaja a Nominatim (decisión tomada: **queda**) documentado donde se ve, no escondido en un `User-Agent`. |
| **R4** | **Ruido del repo** | ¿La lista de ramas/PRs/archivos sigue siendo señal? | **126 ramas remotas (66 ya mergeadas a HEAD)**, **46 worktrees de agentes abandonados** en `.claude/worktrees/`, 13 PRs mergeadas abiertas, scripts huérfanos y código comentado. Que la lista vuelva a informar. |
| **R5** | **¿Los gates dicen la verdad?** | Con CI en verde, **¿qué queda garantizado y qué no?** | Cada fence declara su cobertura Y su punto ciego. Entra acá todo el bloque P2 (linters de authz con glob plano, `check-rls-coverage` que no mira contenido, el fence N3 con globs incompletos). |
| **R6** | **Nombres e idioma** | ¿Un lector nuevo entiende que DIM y MiMAR son **el mismo producto** (codename vs marca)? ¿La frontera es-AR-UI / English-code se sostiene? | Sin ambigüedad de producto; sin castellano en identificadores ni inglés en UI. |
| **R7** | **Navegabilidad de docs** | Desde "quiero cambiar X", ¿llego a los archivos correctos en menos de 3 saltos? | Un camino claro README → arquitectura → módulo. Los 18 planes activos + specs + archive **no** pueden ser el primer contacto. |
| **R8** | **Trazabilidad** | ¿El "por qué" de una decisión rara se recupera **sin preguntarle a Ignacio**? | El porqué vive en el commit, el ADR o el comentario — no sólo en la cabeza del PO ni en un chat. |
| **R9** | **Adversarial final** (billed, con OK explícito) | ¿Qué encuentra un revisor fresco y hostil sobre el rango completo? | Cursor read-only + `/code-review ultra` + review de seguridad. Cero hallazgos confirmados sin decisión registrada. |

**Orden sugerido**: R1-R4 primero (son los que golpean en los primeros diez
minutos de un tercero), R5-R8 después, R9 al final sobre el árbol ya limpio —
un revisor adversarial gastado en ruido es plata tirada.

---

## Reglas de la corrida (no negociables)

- **Escritores en paralelo sólo en worktrees**, territorio de archivos disjunto,
  con merge serial e integración por `pnpm verify` completo.
- **Todo hijo en background se pollea dentro del mismo turno.** Un turno no
  termina con un hijo vivo sin poll.
- **Cursor como revisor fresco antes de pushear** el rango.
- **Evidencia real, no impresiones**: salida pegada de `verify`/`test`, y para
  cualquier cosa de e2e, el veredicto de CI — la DB de dev miente (estado
  acumulado), como quedó documentado en `e2e/README.md`.
- Migraciones: forward-only, inmutables, y **aplicarlas a una DB remota es
  decisión de Ignacio**, no del agente.

---

## Apéndice A — verificado CERRADO (no es trabajo)

Los cuatro ítems de la sección "rompe algo para un usuario" **ya están
arreglados**. Verificado uno por uno contra el árbol, no contra el documento:

| # | Estado | Evidencia |
|---|---|---|
| RA-2 F4 — chip distinto al canónico en silencio | **HECHO** | `checkChipMatchesCanonical` rechaza el chip en conflicto ANTES de la transacción (`lib/domain/microchip-validation.ts:78-115`); el docblock del guard narra el modo de falla viejo |
| RA-2 F5 — `redirect()` dentro de la acción | **HECHO** | `microchip/reemplazar/action.ts:117-122` devuelve `{ redirectTo }` (contrato N3), en la versión org y en la admin |
| RA-2 F9 — `org.transfer.propose` inerte + mensaje falso | **HECHO** | la página llama `requireCapability("org.transfer.propose", org.id)` (`transferencias/nueva/page.tsx:37-47`) |
| RA-2 F10 — "Enviar documentación" a la nada | **HECHO** | la verificación es ahora un estado de espera declarado (`waitingOn: "mimar"`, `href: null`) y no traba el onboarding |

> **La trampa que dejó atrás.** Las citas de RA-2 F4 en la cola
> (`microchip-use-case.ts:124`, `events-repository.ts:197`) **hoy apuntan al
> arreglo, no al defecto**. Alguien que las siga de buena fe "re-arregla"
> código que funciona. Es la tercera vez que este documento cae en el mismo
> modo de falla — y es el argumento más fuerte para la regla de evidencia
> fechada del Bloque 0.

**Consecuencia para la corrida**: no hay trabajo P1. El peso está en el
Bloque 1 (gates).

También quedó verificado cerrado: la cola vieja del 24/06 (8,5 de 11 ítems),
~12 de los 18 planes activos, el issue #758, y todo el bloque e2e.

---

## Pendiente de completar

- [ ] Hallazgos que va a pasar Ignacio.
- [ ] Orden final y qué corre desatendido vs qué necesita criterio.
