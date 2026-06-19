# Wave 5 — Launch hardening: identidad MiArg, datos, defensa-en-profundidad, reliability — technical dev handoff (Items 25–31)

> **Status:** 🟢 Ready for Claude Code · **Date:** 2026-06-19 · **Wave 5 — endurecimiento para lanzamiento.**
> · Origen: crítica de proyecto 2026-06-19 (`docs/critique/2026-06-19-project-critique.md`) — el *por qué* de cada item vive ahí; este doc es el *cómo*.
> · Anclaje legal: **Ley 25.326** (Protección de Datos Personales, AAIP) · **Ley 26.653** (accesibilidad web sector público) · **Mi Argentina** (plataforma nacional de identidad digital).
>
> **PREMISA DE LANZAMIENTO (cambia el diseño de datos):** **Mi Argentina es un hecho en el lanzamiento, no roadmap.** La identidad de cuentas personales (`owner`, `vet`) y la **verificación de DNI se hacen vía Mi Argentina**. Consecuencia directa: **NO se persiste el DNI en claro** (Item 25). Las cuentas institucionales (`govt`, `admin`) siguen siendo service accounts con su login propio.
>
> **SECUENCIA recomendada:** **29 (reliability) primero o en paralelo** — desbloquea la confianza para verificar todo lo demás. Después el **gate de lanzamiento: 25 → 26 → 27 → 28**. Cierre: **30 → 31.**
>
> ⚠️ **Coordinación con CC en vivo:** Item 25 toca `profiles` + auth (`middleware.ts`, `lib/supabase/*`) y el catálogo de migraciones. Si CC está ejecutando otra Wave con migraciones abiertas, **secuenciar las migraciones de Item 25/26 al final** para no chocar números. La política k-anon (`lib/metrics/suppressSmallCells`, Item 0) **ya está implementada** — no rehacerla.

**Contexto.** La arquitectura es production-grade (hexagonal-lite enforced, event-sourcing, design system auditado, CI con gates). El gap a "sistema que sostiene DNIs de ciudadanos y alimenta tableros de gobierno" es **endurecimiento**, no features, y se concentra en cinco lugares: (1) identidad + datos sensibles, (2) autorización en una sola capa, (3) fugas de PII por payloads/predicados, (4) confiabilidad del runner de tests, (5) pipeline de seguridad en CI. La a11y de portales operadores ya está trackeada como **Wave 2 Item 11** (no se re-scopea acá; solo se la nombra como dependencia del rollout govt). El sistema de casos es **`plans/2026-05-19-cases-system.md`** (no acá).

Artefactos reales que tocan estos items: `db/schema.ts` (tabla `profiles`), `lib/supabase/{server,browser,middleware,admin}.ts`, `middleware.ts`, `db/migrations/`, `db/triggers.sql`, `db/*_rls.sql` (patrón ya usado: `cases_rls.sql`, `foster_rls.sql`), `lib/rate-limit.ts` (`enforceRateLimit`, tabla `rate_limit_buckets`), `lib/publicToken.ts`, `src/modules/welfare/domain/reference-code.ts`, `src/modules/adoption/infrastructure/adoption-repository.ts`, `src/modules/lost/infrastructure/lost-listing-read.ts`, `pet_events.author_role='scanner'`, `__tests__/_helpers/*`, `vitest.config.ts`, `.github/workflows/ci.yml`, `AGENTS.md`.

---

## Item 25 — Identidad Mi Argentina + manejo de DNI (sin DNI en claro) 🔴 (gate de lanzamiento, foundational)

### Overview
Hoy el login personal es Supabase Auth email/password y `profiles.dni_number` es `text` en claro con índice único directo. Con Mi Argentina verificando identidad en el lanzamiento, **el DNI en claro es a la vez un pasivo y algo innecesario**: MiArg devuelve una identidad verificada; el sistema no necesita guardar el número.

### Modelo de identidad
- **Mi Argentina como IdP (OIDC)** para cuentas personales (`owner`, `vet`). Las claims verificadas (sub estable + nombre + estado de DNI) llegan en el callback.
- Cuentas institucionales (`govt`, `admin`) **no cambian** — siguen con su login de service account (no tienen identidad MiArg ni mascotas; ver README §"Four-role authority model").
- La verificación de **DNI** deja de ser manual (hoy se setea por Studio / formularios). Pasa a derivarse de la aserción MiArg. La verificación de **matrícula** (registro profesional, no está en MiArg) **conserva su flujo de aprobación govt**.

### Diseño de datos (el cambio central — "store data better")
**Regla: no persistir el DNI en claro.** En `profiles`:

| Columna | Tipo | Para qué |
|---|---|---|
| `miarg_sub` | `text unique` | subject id opaco y estable de Mi Argentina — la FK real a la identidad |
| `identity_source` | enum (`miarg` / `legacy`) | procedencia de la verificación |
| `dni_verified` / `dni_verified_at` | `bool` / `timestamptz` | reemplazan el seteo manual |
| `dni_hash` | `text` (HMAC-SHA256(dni, **pepper**)) | **único** propósito: matching por igualdad donde el negocio lo exige (ver abajo). Pepper en env/KMS, **nunca en DB**. |
| `dni_last4` | `text(4)` nullable | desambiguación humana en UI operador (no es identificador) |

- **Drop** de `dni_number` en claro. Migración: derivar `dni_hash`/`dni_last4` de los valores existentes en un paso, **después** dropear la columna en claro. Mover el índice único de `dni_number` → `dni_hash`.
- Si alguna vista legal exige mostrar el DNI completo: **traerlo on-demand de MiArg**, no almacenarlo. (Fallback de último recurso: `pgcrypto` + KMS; documentarlo, no defaultearlo.)

### Flujos que dependían de DNI en claro (migrar a `dni_hash`)
- **Reconciliación de mordeduras** (`temporary_pet_descriptions`, spec `2026-05-19-bite-from-unowned-animal-design.md`): el matching "por DNI" pasa a comparar `dni_hash` con `dni_hash`.
- **Identidad del postulante de adopción** (adoption v1.4 §12.5): misma sustitución.
- Cualquier `where dni_number = …` → `where dni_hash = hmac(input)`. Grep obligatorio de `dni_number` antes de cerrar.

### Migración / schema
1. `profiles`: add `miarg_sub`, `identity_source`, `dni_hash`, `dni_last4` (+ `dni_verified_at` si falta).
2. Backfill: `dni_hash = hmac(dni_number, pepper)`, `dni_last4 = right(dni_number,4)`.
3. Drop `dni_number` + su unique index; crear unique index en `dni_hash`.
4. Auth: callback OIDC MiArg en `app/auth/` + `lib/supabase/*`; `handle_new_user` (`db/triggers.sql`) setea `miarg_sub`, `dni_verified`, `dni_hash` desde las claims.

### Edge / tests
- Persona sin MiArg vinculable → no se crea cuenta personal (mensaje claro, no se inventa identidad).
- Colisión de `miarg_sub` (re-login) → upsert idempotente.
- Tests: hashing determinístico con pepper de test; reconciliación de mordeduras/adopción por hash; **assert de que `dni_number` ya no existe** en el schema; flujo de verificación deriva de claim, no de input de usuario.

### Por qué foundational
Cierra S1 (PII en claro) y es prerequisito de la conversación Ley 25.326 / Mi Argentina del README ("integración oficial a escala nacional"). Items 26–28 asumen este modelo de datos.

---

## Item 26 — Defensa en profundidad: RLS de respaldo 🔴 (gate de lanzamiento)

### Overview
Drizzle corre como service-role y **bypassa RLS por diseño**; la autorización vive sólo en el borde de `actions.ts`. Es limpio, pero deja cada action como **único punto de falla**: un check faltante en un endpoint = fuga de PII. RLS hoy está en ~8 de 100+ tablas. Este item agrega RLS como **respaldo** (no reemplaza el borde de actions).

### Spec
- Habilitar RLS + políticas en las tablas sensibles que hoy no la tienen: `profiles`, `ownerships`, `pets`, `pet_events`, `pet_identifications`, `welfare_reports`/`welfare_attachments`, `libreta_share_tokens`, `pet_transfers`, `adoption_*`. Reusar el patrón existente (`db/cases_rls.sql`, `db/foster_rls.sql`, función estilo `can_read_case`).
- **Documentar explícitamente** el modelo: "el borde de actions es la autorización primaria; RLS es defensa en profundidad" — en `db/migrations/` y en AGENTS.md (liga Item 31).
- Priorizar las **rutas públicas/anónimas** (`/p/`, `/casos/`, `/refugios/`, `/libreta/compartir/`) como la superficie de test de autorización de mayor prioridad.

### Tests / cierre
- **e2e cross-tenant** (liga Item 29 / Playwright): owner A no puede leer datos de owner B por ninguna vía (page + cualquier JSON). Un test por rol (owner/vet/org/govt/admin). Este es *el* e2e que más conviene dado el diseño de una sola capa.
- `pnpm rls:smoke` extendido a las tablas nuevas.

### Edge
- Service-role sigue funcionando para los flujos legítimos (no romper el repositorio). RLS no debe bloquear las queries del action edge ya autorizadas — validar que las políticas permiten al service-role o que el smoke corre con rol no-service.

---

## Item 27 — Cierre de fugas de PII (payloads + predicados) 🟡

### Overview
Dos fugas concretas donde la PII viaja en la forma de retorno aunque la vista la redacte — peligroso si el JSON se expone por API o por mensaje de error.

### Spec
| Fuga | Dónde | Fix |
|---|---|---|
| **Payload de evento devuelto entero** | `src/modules/adoption/infrastructure/adoption-repository.ts` (`findOpenApplicationForPet` y similares) lee `payload->>` y retorna el payload (nombre/teléfono/dirección/DNI del postulante). | Proyectar **sólo** los campos necesarios; nunca retornar el payload crudo. Mantener el evento inmutable para auditoría. Grep de `payload->>` para auditar sobre-exposición en todos los módulos. |
| **Ubicación de pet perdida no filtrada por la preferencia del dueño** | `src/modules/lost/infrastructure/lost-listing-read.ts`: `discloseLastLocationWhenLost` se selecciona pero **no** está en el `WHERE`; la redacción ocurre sólo en la vista. | Empujar el flag al **predicado** de la query, no al template. |

### Tests
- Test de que la forma de retorno de adopción **no** contiene PII del postulante.
- Test de que un pet con `discloseLastLocationWhenLost=false` no aparece con ubicación en el resultado de la query (no sólo en el render).

---

## Item 28 — Retención y privacidad de scans 🟡

### Overview
Los eventos `credential_scanned` (`pet_events.author_role='scanner'`) crean una **traza indefinida de ubicación/tiempo** de quién miró qué credencial, sin política de retención.

### Spec
- **TTL** de eventos `scanner`: cron de purga (patrón de los crones existentes, p.ej. `close-rabies-observations`) que borra scans > N días (definir N con el dueño; sugerido 90).
- **Nunca** almacenar IP/lat-lng en el payload de scan (auditar el insert actual).
- Documentar el modelo de privacidad de scans en AGENTS.md (liga Item 31).

### Edge / tests
- La métrica de "actividad de escaneo" del owner dashboard (`lib/owner-nudges.ts`) debe seguir funcionando con la ventana retenida (deriva sólo de eventos del propio owner — sin surveillance).
- Test del cron: borra > N, conserva ≤ N.

---

## Item 29 — Confiabilidad del runner de tests 🔴 (correr primero / en paralelo)

### Overview
La última corrida integración capturada **pasó las 159 pruebas (0 fallas)** pero emitió **311 errores "Worker exited unexpectedly"** y duró ~5 h: agotamiento de pool de conexiones Postgres / teardown no idempotente bajo `fileParallelism:false`. Erosiona la confianza en `pnpm test` y eventualmente pone a CI en rojo. **No son tests rojos — es infra de tests.**

### Spec
- Auditar setup/teardown en `__tests__/_helpers/*` (`db-overrides.ts`, `expect-db-error.ts`): cierre de conexiones, aislamiento de estado entre archivos.
- Acotar vida del worker / pool (`vitest.config.ts`); objetivo: suite en **minutos**, no horas, **0 worker-exits**.
- Cubrir las **proyecciones** de `lib/projections/` que faltan (~16 de ~20 sin test; son funciones puras → barato). Regresiones acá corrompen estado de la mascota (status/microchip/peso/preñez).

### Cierre
- `pnpm test:coverage` verde y rápido, sin worker-exit errors. Subir el ratchet de coverage de `lib/**` si la realidad lo permite.

---

## Item 30 — Pipeline de seguridad en CI 🟡

### Overview
`ci.yml` tiene gates buenos (lint, typecheck, build, dep-audit, migration-presence, schema-parity) pero **no** hay SAST, secret-scanning ni Dependabot; el deploy es manual por Vercel CLI. La integración con gobierno va a exigir pipeline de seguridad.

### Spec
- Agregar **CodeQL** (workflow), **secret scanning** (push protection), **Dependabot** (npm + actions).
- Agregar **SECURITY.md**: política de rotación del service-role key + cadencia; logging de instanciación del admin client (`lib/supabase/admin.ts`).
- Scriptar/gate el deploy (hoy `pnpm deploy:staging` manual) con verificación previa.

### Edge
- El `dep-audit` ya ignora un advisory dev-only conocido (vite, Windows FS) — mantener esa exclusión documentada.

---

## Item 31 — AGENTS.md slim + sección "Privacidad y manejo de datos" 🟡 (meta-handoff)

### Overview
`AGENTS.md` (~100 KB) está bien estructurado pero es **demasiado grande para cargar entero** en el contexto de un agente — irónico para un repo cuyo propósito declarado es handoffs a Claude Code.

### Spec
- Partir en un **índice slim de carga-siempre** (≤ ~1.5k tokens: invariantes, dónde-vive-cada-cosa, la regla de dependencia, el checklist de eventos) que linkea a secciones profundas cargadas on-demand.
- Agregar una sección **"Privacidad y manejo de datos"**: un checklist que todo agente debe satisfacer al tocar una ruta pública, un token, o un campo PII — incorporando las reglas de Items 25–28 (no DNI en claro; RLS de respaldo; nunca retornar payload crudo; predicados de privacidad en la query; retención de scans; sin IP/geo en logs de scan).

### Cierre
- README de superpowers y AGENTS.md cross-linkeados; el índice slim referenciado desde `CONTRIBUTING.md` ("Lectura obligatoria").

---

## Cierre por item (todos)
SDD test-first, Biome/typecheck verdes, docs en el mismo PR, **flippear la fila en `docs/superpowers/README.md`**. Items con migración (25, 26, 28) secuencian sus números de migración al final si CC está ejecutando otra Wave. Item 29 primero/paralelo para poder verificar el resto. Items 25→26→27→28 son el gate de lanzamiento.

## Lo que NO está en Wave 5
- **A11y de portales operadores** — es **Wave 2 Item 11** (acá sólo es dependencia del rollout govt).
- **Sistema de casos / Case UX** — es `plans/2026-05-19-cases-system.md` (Item 12).
- **PWA (manifest + service worker)** — decisión de scope del dueño (ver crítica §4 U2); si entra, es item aparte.
- **k-anonymity / `suppressSmallCells`** — **ya implementado** (Item 0, projection-primitives). No tocar.
- **Proveedor de identidad alternativo a MiArg** — fuera de premisa de lanzamiento.

---

## Próximo paso (wiring)
Este spec está **standalone a propósito**. Cuando CC pare la Wave en curso, reconciliar en una pasada: agregar Wave 5 (Items 25–31) al índice del README (sección "What to attack next" + tabla de specs) — **ya hecho en este mismo cambio** — y, si existe un umbrella/kickoff activo, sumarlo al final del bloque autónomo. El *por qué* y las correcciones de verificación que respaldan estos items están en `docs/critique/2026-06-19-project-critique.md`.
