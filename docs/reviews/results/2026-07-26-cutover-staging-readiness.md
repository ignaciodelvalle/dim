# Cutover a staging — evaluación de preparación (2026-07-26)

> **Alcance**: evaluación **de solo lectura**. No se desplegó nada, no se aplicó ninguna migración
> a ninguna base remota, no se tocó ninguna variable de entorno, no se pusheó ni se abrió ningún PR.
> Todas las consultas contra staging fueron `SELECT`. El cutover lo ejecuta el PO cuando lo valide.
>
> **Rama evaluada**: `integration/all-20260703` @ `9c7392ef`
> **Proyecto Vercel**: `ignacio-dim/dim-staging` (`prj_KEat6bE5xicAE5Yx3xJhfDteoXkI`)
> **Base staging**: Supabase `DIM-staging` (`agnwyifsdxxoznodutgq`, `sa-east-1`, Postgres 17)

## Cómo leer este documento

Cada afirmación está marcada:

- **[VERIFICADO]** — lo comprobé yo, con el comando o la consulta que aparece al lado.
- **[ASUMIDO]** — no lo pude confirmar desde acá. Va con el comando exacto que el PO tiene que correr.

Si una línea no tiene marca, es una recomendación mía, no un hecho.

---

## Resumen ejecutivo (leer esto aunque no leas nada más)

**Hay un problema de seguridad activo en staging que es independiente del cutover y más grave que el cutover.**

El REST anónimo de Supabase en staging devuelve **filas completas** de `pets`, `profiles`,
`pet_events`, `audit_log` y `ownerships` a cualquiera que tenga la anon key — que es una clave
pública por diseño, embebida en el bundle del navegador. 27 tablas del schema `public` tienen RLS
**deshabilitado** en staging. En local esas mismas tablas tienen RLS **habilitado**. Es drift real
entre entornos, no una diferencia de diseño. **[VERIFICADO]**

Aparte de eso, la foto del cutover en sí es **mucho mejor de lo que decía la premisa**:

- Faltan **3 migraciones**, ninguna destructiva, ninguna larga: `0158`, `0159`, `0160`. **[VERIFICADO]**
- Todas las env vars requeridas ya existen en Vercel Production, incluida `NEXT_PUBLIC_SITE_URL`,
  que **no está vacía**. **[VERIFICADO]**
- La premisa "staging tiene data del path viejo, sin `locality_id`, sin `pet_registered`" es
  **falsa para el 99,98% de la data**. De 66.732 mascotas, **13** no tienen evento de registro y
  **5** no tienen `locality_id`. Los 66.660 registros PANO están completos. **[VERIFICADO]**
- La fence de integridad del spine **no existe todavía en el árbol**. No hay
  `scripts/check-spine-*.ts` ni entrada en `pnpm verify`. **[VERIFICADO]**

**El paso más riesgoso del cutover no es la migración: es correr `pnpm verify` con `DATABASE_URL`
apuntando a staging.** El runbook de deploy le dice literalmente al PO que setee esa variable en la
consola, y `pnpm verify` incluye 4 lints que se conectan a `DATABASE_URL`. Detalle en §B4.

---

## a) Lo que ya está listo

### A1. Las env vars de Vercel Production están completas **[VERIFICADO]**

`npx vercel env ls production` devuelve las 18 variables. Contra la matriz que exige
`lib/infra/env.ts` en un deploy productivo remoto:

| Variable | Estado | Nota |
|---|---|---|
| `DATABASE_URL` | presente (18d) | |
| `NEXT_PUBLIC_SUPABASE_URL` | presente (19d) | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | presente (19d) | |
| `SUPABASE_SERVICE_ROLE_KEY` | presente (19d) | |
| `NEXT_PUBLIC_SITE_URL` | presente (17d), **valor en claro visible**, empieza con `https://dim-stagin…` | Production + Preview + Development |
| `CRON_SECRET` | presente (8d) | |
| `DNI_HASH_PEPPER` | presente (19d) | valor cifrado, no lo leí |

Extras presentes y coherentes: `ANALYTICS_DATABASE_URL`, `CUBE_READS`, `VAPID_PRIVATE_KEY`,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_PUSH_ENABLED`, `NEXT_PUBLIC_DEMO_MODE`,
`MAGIC_LINK_TTL_SECONDS`, `TATTOO_ACK_SECRET`, `MICROCHIP_FORCE_SECRET`,
`INTAKE_MATCH_CLAIM_SECRET`, `APPLY_INTENT_SECRET`.

### A2. La mina del `NEXT_PUBLIC_SITE_URL` vacío está desactivada — en el camino del QR **[VERIFICADO]**

El punto de la premisa era que un string **vacío** no es lo mismo que ausente, y que `??` no lo
atrapa. Revisé el código, no la doc:

- `lib/infra/site-url.ts:46` — `resolveSiteUrl()` hace
  `(process.env.NEXT_PUBLIC_SITE_URL ?? "").trim()` y después `|| CANONICAL_SITE_URL`.
  El `||` (no `??`) es exactamente lo que atrapa el string vacío y el whitespace-only.
  `credentialQrUrl()` cuelga de ahí, así que **el QR nunca puede codificar una URL relativa**.
- `lib/infra/env.ts:70-75` — en un deploy remoto de producción la variable pasa por
  `.min(1)` + `.url()`, o sea que un valor vacío **hace fallar el boot** con un mensaje que la
  nombra. No arranca en silencio.
- Cobertura de tests: `lib/infra/__tests__/site-url.test.ts` prueba `undefined`, `""`, `"   "`,
  trailing slash y slashes múltiples.

**Dos call sites siguen usando `??` crudo, a propósito y documentado**:

- `app/layout.tsx:76` — `metadataBase`, cae a `http://localhost:3000`. Solo resuelve URLs relativas
  de metadata; nunca publica un origen adivinado.
- `app/sitemap.ts:21-25` — **falla fuerte** en producción si la variable no está, en vez de adivinar
  un dominio para los buscadores.

Con la variable seteada (que lo está), ninguno de los dos importa. **No es un bloqueante.**

### A3. Las 3 migraciones pendientes son inocuas **[VERIFICADO — leí las tres]**

| Migración | Qué hace | Bloqueo / duración |
|---|---|---|
| `0158_pets_disclosure_defaults_fail_closed` | `ALTER COLUMN … SET DEFAULT false` ×3 sobre `pets`. **Sin backfill** — no toca ni una fila. | Cambio de catálogo. `ACCESS EXCLUSIVE` sobre `pets` por microsegundos. |
| `0159_erase_subject_data_free_text_payload_keys` | `CREATE OR REPLACE FUNCTION` + `REVOKE`/`GRANT`. No toca datos. | Instantáneo, sin lock de tabla. |
| `0160_pets_seed_tag` | `ADD COLUMN IF NOT EXISTS seed_tag text` (nullable, sin default) + `CREATE INDEX IF NOT EXISTS` parcial `WHERE seed_tag IS NOT NULL`. | `ADD COLUMN` nullable sin default = solo catálogo en PG11+. El `CREATE INDEX` **no** es `CONCURRENTLY`: toma un lock `SHARE` que **bloquea escrituras** sobre `pets` mientras construye. Sobre 66.732 filas: segundos, no minutos. |

**Nada destructivo. Nada que requiera ventana de mantenimiento.** El único bloqueo real de
escrituras es el índice de `0160`, del orden de segundos sobre una tabla de 66k filas, y staging no
tiene tráfico de escritura concurrente que valga la pena proteger.

Las tres van envueltas en `BEGIN/COMMIT` y ninguna lleva la directiva `-- dim:no-transaction`, así
que una falla a mitad hace rollback limpio y se puede reintentar. **[VERIFICADO]** — leí
`scripts/migrate.ts:483-537`.

### A4. No hay checksum drift **[VERIFICADO parcialmente]**

Comparé el sha256 en disco de `0153`–`0157` contra el registrado en `_dim_migrations` de staging:
idénticos. No comparé las 151 restantes una por una — el runner lo hace solo y lo grita fuerte
(`warnDrift`) en cualquier invocación.

**Comando de confirmación total** (lo corre el PO con `DATABASE_URL` apuntando a staging):

```powershell
pnpm db:migrate:status
```

Si imprime un bloque `WARNING: checksum drift`, **frená el cutover** y averiguá qué archivo se editó
después de aplicarse.

### A5. Los crons de staging están vivos **[VERIFICADO]**

`public.cron_runs` en staging muestra `refresh_cube` corrido hoy 2026-07-26 04:47 UTC, y las 9 tareas
del `daily` a las 04:35 UTC. `vercel.json` declara ambos crons (`0 3 * * *` y `0 4 * * *`, región
`gru1`). No hay nada que arreglar acá.

### A6. El deploy no puede pisar tu `.next` local **[VERIFICADO]**

`pnpm deploy:staging` = `typecheck && lint && lint:tokens && migrate && npx vercel --prod --archive=tgz`.
**No incluye `pnpm build`.** `.vercelignore` excluye `.next`, `node_modules`, `.git` y `.claude`, así
que se sube el fuente y Vercel buildea del lado del servidor.

La trampa del `.next` clobbeado existe, pero se dispara con **`pnpm verify`**, que termina en
`pnpm build`. Mientras el cutover use `deploy:staging` y no `verify`, el :3000 local sobrevive.

---

## b) Lo que bloquea

### B1. 🔴 CRÍTICO — El REST anónimo de staging expone la base entera

**Esto no lo causa el cutover. Está pasando ahora.**

27 de las 53 tablas del schema `public` de staging tienen `relrowsecurity = false`. Entre ellas:
`pets`, `profiles`, `pet_events`, `ownerships`, `audit_log`, `notifications`, `attachments`,
`case_events`, `pet_transfers`, `pet_identifications`, `libreta_share_tokens`, `govt_assignments`,
`alert_subscriptions`, `organization_invitations`. **[VERIFICADO]** — `pg_class.relrowsecurity` vía
consulta directa, y confirmado por el advisor de Supabase (30 findings nivel ERROR: 27
`rls_disabled_in_public` + 3 `policy_exists_rls_disabled`).

**En local esas mismas tablas tienen `relrowsecurity = true`.** **[VERIFICADO]** — misma consulta
contra `127.0.0.1:54322`. Es drift entre entornos, no una decisión de diseño.

Y no es teórico. Probé el endpoint público con la anon key legítima del proyecto:

```
GET https://agnwyifsdxxoznodutgq.supabase.co/rest/v1/pets?select=*&limit=1
GET .../profiles?select=*&limit=1
GET .../pet_events?select=*&limit=1
GET .../audit_log?select=*&limit=1
GET .../ownerships?select=*&limit=1
```

Las cinco devolvieron **HTTP 206 con filas completas**. **[VERIFICADO]** — incluyendo
`profiles.display_name` con la dirección de mail real de un usuario. `has_table_privilege('anon', …,
'SELECT')` es `true` para todas.

**Radio de explosión**: 66.732 mascotas, 226.335 eventos, 25 perfiles (7 con teléfono, 2 con
`dni_hash`/`dni_last4`), 7.099 denuncias, el `audit_log` completo. Cualquier persona con la anon key
puede paginar y bajarse todo. La anon key es pública por diseño: `lib/supabase/client.ts` usa
`createBrowserClient` con `NEXT_PUBLIC_SUPABASE_ANON_KEY`, y hay componentes cliente que la usan
(`components/BulkRevokeList.tsx`, `lib/ui/use-evidence-upload.ts`, `app/gob/usuarios/RevokeUserActions.tsx`,
`app/gob/organizaciones/RevokeOrgActions.tsx`).

> **Un matiz honesto**: busqué la anon key en el HTML y en los 11 chunks JS de `/login` y **no la
> encontré ahí** **[VERIFICADO]**. Las rutas que sí instancian el cliente de navegador son
> `/gob/*` y las de admin, que requieren sesión para llegar. Así que el vector no es "abrís la
> landing y ya la tenés". Pero una anon key es **publishable por definición** — todo su modelo de
> seguridad asume que RLS está prendido. Tratala como pública.

**Por qué pasó — hipótesis, no hecho [ASUMIDO]**: la migración `0086_track_rls_in_migrations` sí
habilita RLS sobre esas tablas, y figura aplicada en staging el 2026-07-07 15:06:20 UTC. Que las
tablas hoy estén en `false` significa que **algo las deshabilitó después**. No encontré ningún
`DISABLE ROW LEVEL SECURITY` en `db/`, `db/migrations/` ni `scripts/` **[VERIFICADO]**, así que la
causa está fuera del repo — Studio, un `drizzle-kit push` manual, o una sesión de debug. **No lo
pude determinar desde acá.**

**Cómo confirmarlo el PO, en 10 segundos**:

```powershell
curl "https://agnwyifsdxxoznodutgq.supabase.co/rest/v1/profiles?select=display_name&limit=3" `
  -H "apikey: <ANON_KEY del dashboard de Supabase>"
```

Si devuelve nombres, está expuesto.

**Esto se arregla antes del cutover, no después.** Es una migración nueva (idempotente,
`ENABLE ROW LEVEL SECURITY` es no-op si ya está) o un replay de `0086`. **Escribir esa migración es
trabajo de agente; aplicarla a la base remota es decisión del PO.**

### B2. 🔴 La URL estable de staging sirve código de hace 7 días

`https://dim-staging.vercel.app` resuelve al deployment `dpl_EwpnwMk8fU4BzrekP2XfJtMGjZZg`
(`dim-staging-hh4646n43`), target `production`, creado el **2026-07-18 18:40 ART**. **[VERIFICADO]**
— `npx vercel inspect`.

Desde ese commit hay **310 commits** y 1.034 archivos cambiados en la rama. **[VERIFICADO]** —
`git log --since`.

Y hay algo peor: **los 12 deploys de los últimos 21 horas son todos `Preview`, no `Production`**.
El más reciente (7 minutos) devuelve **HTTP 500**. **[VERIFICADO]** — `curl` + `npx vercel logs`:

```
error  GET /  500  [Error: Your project's URL and Ke…
```

La causa es directa: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` y `ANALYTICS_DATABASE_URL` están scopeadas **solo a
Production**. Un deploy Preview no las recibe y muere al bootear. **[VERIFICADO]** — la columna
`environments` de `vercel env ls`.

**Consecuencia operativa**: el cutover **tiene** que ser un deploy con target `--prod`. Un
`vercel deploy` sin `--prod` produce una URL rota y no mueve el alias estable. No agregues las
variables a Preview para "arreglarlo": eso apuntaría cada preview de cada agente a la base de
staging.

### B3. 🟡 La data de seed de staging viola el gate de higiene

`pnpm lint:seed-hygiene` (`scripts/check-seed-hygiene.ts`, patrones en `scripts/hygiene-rules.ts`)
busca marcadores de seed en 5 columnas renderizables. Corrí sus patrones exactos
(`PANO-`, `-Seed-`, `HIST-WEL`, `\bn-\d+\b`) contra staging vía SQL:

| Columna | Infractores |
|---|---|
| `welfare_reports.description` | **7.089** de 7.099 |
| `profiles.display_name` | **1** (`PANO-Seed-Owner`) |
| `pets.name` | 0 |
| `organizations.display_name` | 0 |
| `notifications.title` | 0 |

**[VERIFICADO]**

Además, **719 casos** tienen `opened_reason` con el literal `seed histórico`
(ej.: `"auto: disputa de custodia entre partes seed histórico"`). **[VERIFICADO]**
`cases.opened_reason` no está en `RENDERABLE_TEXT_COLUMNS`, así que el gate no lo mira — pero se
renderiza en las pantallas de caso.

**Traducción para el PO**: si mañana le mostrás `/gob/denuncias` a un funcionario, **ve
`PANO-…` crudo en el texto de casi todas las denuncias**. No es un bug de código; es data vieja
sembrada antes del fix C5. `lint:seed-hygiene` **no** está en `pnpm verify`, así que nada te lo iba a
avisar.

### B4. 🔴 La trampa de `pnpm verify` contra staging

Esta es la que más miedo me da, porque el propio runbook te empuja a ella.

`docs/ops/staging-deploy.md` dice, textual:

```powershell
$env:DATABASE_URL = "postgresql://postgres.<ref>:<pass>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
pnpm deploy:staging
```

Esa variable **queda seteada en la sesión de PowerShell**. Y `pnpm verify` incluye 4 lints que se
conectan a `DATABASE_URL`: **[VERIFICADO]** — `rg -l DATABASE_URL scripts/check-*.ts`

| Lint | En `verify` | Contra staging hoy |
|---|---|---|
| `lint:rls` (`check-rls-coverage.ts`) | **sí** | **FALLA** — 27 tablas sin RLS (§B1) |
| `lint:locality` (`check-locality-integrity.ts`) | **sí** | pasa — 0 agregados de provincia entera **[VERIFICADO]** |
| `check-seed-hygiene.ts` | no (no está en `verify`) | fallaría — 7.090 infractores (§B3) |
| `env:doctor` (`check-env-local.ts`) | no | lee `.env.local`, no la base |

`check-locality-integrity.ts` y `check-seed-hygiene.ts` salen con 0 si la base es inalcanzable (skip
elegante). **`check-rls-coverage.ts` no tiene ese skip**: sale 1 igual. **[VERIFICADO]**

**Regla operativa**: corré `pnpm verify` en una consola **limpia**, con `DATABASE_URL` apuntando al
Supabase local. Nunca en la misma consola donde seteaste el pooler de staging.

### B5. 🟡 La fence de integridad del spine todavía no existe

Busqué en todo el árbol: **no hay** `scripts/check-spine-integrity.ts` ni ningún check que afirme
"toda mascota tiene su `pet_registered`", y **no hay** entrada correspondiente en `pnpm verify`.
**[VERIFICADO]** — listado completo de `scripts/check-*.ts` (41 archivos) + `rg pet_registered scripts/`
(solo aparece en scripts de seed).

Lo que **sí** existe es su preparación: la migración `0160` fue escrita explícitamente para
habilitarla. Su cabecera dice, textual:

> *"El need concreto: la spine-integrity fence (toda mascota debe tener un evento `pet_registered`)
> es bloqueante desde el día uno. `seed-perf.ts` legítimamente hace bulk-insert […] así que tiene
> que quedar exenta EXPLÍCITAMENTE."*

**Qué haría contra la data actual de staging, si existiera** — lo medí con la consulta que la fence
haría:

- Mascotas sin evento `pet_registered`: **13** de 66.732. **[VERIFICADO]**
- Las 13 son las del seed demo viejo del **2026-07-07**: `DIM-DEMO-0001`…`DIM-DEMO-0010` (Rocco,
  Greta, Simón, Tango, Frida, Camilo, Renata, Bianca, Morocho, Pipa) más `DIM-TD6J-6WRW` (Lola),
  `DIM-TB4G-DN7R` (Toby) y `DIM-NJZN-XNH4` (Rocco).
- **Los 66.660 registros PANO pasan.** Tienen `pet_registered` y `locality_id`. **[VERIFICADO]**
- Ninguna de las 13 quedaría exenta: `seed_tag` es NULL para toda fila preexistente después de
  `0160` (la migración no hace backfill, dice explícitamente "No backfill").

**Esto corrige la premisa de la tarea.** La fence no rompería sobre 66k filas; rompería sobre 13, y
solo si se la corre contra staging (§B4). Además `pets.locality_id` es NULL en **5** filas, todas
`DIM-` de QA del 2026-07-08 (`Gina` ×2, `QA Chip Test Puerto Madero`, `Ovejero`, `Milanesa`).

### B6. 🟡 El rollback de base no tiene red de seguridad

La organización de Supabase (`ignaciodelvalle`) está en **plan `free`**. **[VERIFICADO]** —
`get_organization`.

En plan free **no hay backups automáticos ni PITR** **[ASUMIDO — es la política de Supabase, no lo
verifiqué contra este proyecto]**. El PO lo confirma en:
`Dashboard → Project DIM-staging → Database → Backups`. Si esa pantalla ofrece "Download backup" o
PITR, ignorá esta advertencia.

Y el runner de migraciones es **forward-only por diseño**: no hay migraciones `down`.
El rollback de base es SQL inverso escrito a mano (§d, R4).

---

## c) El checklist que ejecutaría el PO, en orden

Los pasos marcados **[PO]** tocan estado remoto y son exclusivamente tuyos. Los marcados
**[agente]** los puede preparar un agente sin tocar nada remoto.

### Fase 0 — Decidir sobre el hallazgo de seguridad (antes que nada)

0.1 **[PO]** Confirmá la exposición con el `curl` de §B1. Treinta segundos.

0.2 **[PO]** Decidí: **¿arreglamos el RLS de staging antes del cutover, o el cutover sale igual?**
Mi recomendación: **antes**. Estás por invitar funcionarios a esta URL. Un `.gob` mirando un sistema
cuya base se baja entera con una clave pública es un daño reputacional que no se deshace.

0.3 **[agente]** Si decidís arreglarlo: escribir la migración `0161` que rehabilita RLS sobre las 27
tablas (idempotente — `ENABLE ROW LEVEL SECURITY` es no-op si ya está). Se aplica local primero,
`pnpm test` verde, `lint:rls` verde. **La aplicación a la base remota queda en 1.4.**

0.4 **[agente]** Investigar la causa raíz. Una migración que rehabilita sin saber quién deshabilitó
es un parche que se va a volver a romper.

### Fase 1 — Base de datos

1.1 **[PO]** Abrí una **consola nueva** y seteá el pooler de sesión de staging (puerto **5432**, no
6543 — el transaction pooler no soporta DDL):

```powershell
$env:DATABASE_URL = "postgresql://postgres.agnwyifsdxxoznodutgq:<DB_PASSWORD>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
```

1.2 **[PO]** Foto previa, sin escribir nada:

```powershell
pnpm db:migrate:status
```

Esperado: `Total files 159 / Applied 156 / Pending 3` y las tres pendientes listadas
(`0158`, `0159`, `0160`). **Si aparece un bloque `WARNING: checksum drift`, frená acá.**
Si aparecen más de 3 pendientes, alguien mergeó migraciones nuevas — releé este documento.

1.3 **[PO]** Ensayo en seco:

```powershell
pnpm exec tsx scripts/migrate.ts --dry-run
```

1.4 **[PO]** Aplicar. Es el primer paso irreversible del día:

```powershell
pnpm db:migrate
```

Esperado: `Done. Applied 3 migration(s).` (o 4 si incluiste la de RLS).

1.5 **[PO]** Confirmar que quedó en cero:

```powershell
pnpm db:migrate:check   # sale 6 si algo quedó pendiente
```

### Fase 2 — ¿Reseed o no? (decisión, no paso mecánico)

Ver §d, R2 para el análisis completo. Resumen:

- **La data de staging NO está rota estructuralmente.** 66.660 mascotas con spine completo y
  `locality_id`. **[VERIFICADO]**
- Lo que **sí** está feo son los **7.089 textos de denuncia con `PANO-` visible** (§B3).
- Un reseed arregla la higiene, pero **destruye** 66.660 mascotas, 226.335 eventos y 7.089 denuncias,
  y las regenera. No toca los 22 usuarios auth, ni las 13 organizaciones, ni las 72 mascotas `DIM-`
  — **incluida `DIM-PAMP-0001` (Pampa, 22 eventos), que sobrevive**. **[VERIFICADO]** — leí la lógica
  de limpieza de `scripts/seed-panorama.ts:1131-1300`.

2.1 **[PO]** Si reseedás: **tiene que ser después de 1.4**, porque `seed-panorama.ts` escribe
`pets.seed_tag`, que no existe hasta `0160`. Correrlo antes falla con `column does not exist`.

2.2 **[PO]** El seed tiene guard local-only. Contra staging exige `--allow-remote`:

```powershell
node --conditions=react-server --import tsx scripts/seed-panorama.ts --dry-run --allow-remote
```

Mirá el plan **antes** de sacar el `--dry-run`.

2.3 **[agente]** Quedan **10 denuncias huérfanas** que ni el `seed_tag` ni el puente por
`description LIKE` alcanzan (no tienen `seed_tag`, y su descripción no empieza con `PANO-` ni
contiene `HIST-WEL`). **[VERIFICADO]**. Un reseed las deja ahí para siempre. Hay que identificarlas y
decidir a mano.

2.4 **[PO]** Después de cualquier reseed: `pnpm cube:refresh` (o esperá al cron de las 03:00 UTC),
si no el panorama muestra agregados de la data vieja.

### Fase 3 — Deploy

3.1 **[PO]** Verificá que la rama está limpia y verde, en una consola **sin** `DATABASE_URL` de
staging (§B4):

```powershell
# consola NUEVA, DATABASE_URL apuntando al Supabase local
pnpm verify
pnpm test
```

3.2 **[PO]** Deploy con target **production** (si no, ver §B2):

```powershell
npx vercel --prod --archive=tgz
```

`pnpm deploy:staging` hace lo mismo y encadena la migración, pero como ya migraste en 1.4 es un
no-op. Cualquiera de las dos sirve.

3.3 **[PO]** Confirmá que el alias se movió:

```powershell
npx vercel inspect https://dim-staging.vercel.app
```

El `created` tiene que ser de hoy, y `target` = `production`.

3.4 **[PO]** Humo mínimo: `/`, `/p/DIM-PAMP-0001` (el QR de Pampa tiene que resolver a una URL
absoluta), `/login`, `/gob/panorama`.

### Fase 4 — Post-deploy

4.1 **[PO]** `npx vercel logs https://dim-staging.vercel.app` — nada de 500 en el boot.

4.2 **[PO]** Reconfirmá el `curl` de §B1. Si arreglaste el RLS, ahora tiene que devolver `[]` o 401.

---

## d) Riesgos y radio de explosión

### R1 — RLS abierto en staging · **Radio: la base entera · Probabilidad: ya está pasando**

Es el riesgo mayor y **no lo introduce el cutover**. Lo que el cutover cambia es la *exposición*: si
después del deploy le mandás la URL a funcionarios, multiplicás la cantidad de gente que tiene
motivo para mirar. Datos alcanzados: 66.732 mascotas, 226.335 eventos, 25 perfiles (7 teléfonos,
2 `dni_hash`), 7.099 denuncias, `audit_log` completo.

**Mitigación**: Fase 0. **Rollback**: no hay — un dato leído no se des-lee.

### R2 — Reseed · **Radio: 66.660 mascotas + 226.335 eventos + 7.089 denuncias · Probabilidad: alta si lo corrés**

Lo que **destruye**: todo lo `PANO-` (mascotas, sus eventos, ownerships, casos con
`public_code LIKE 'PANO-CASE-%'` o `opened_reason LIKE '%seed histórico%'` — **719 casos**
**[VERIFICADO]** —, orgs `PANO-ORG-%`, el profile `PANO-Seed-Owner`), más las denuncias alcanzadas
por `seed_tag LIKE 'PANO%' OR description LIKE 'PANO-%' OR description LIKE '%HIST-WEL%'`
(**7.089** de 7.099).

Lo que **preserva**: los 22 usuarios de `auth.users` (incluidas tus cuentas
`ignaciodelvalle2014+…@gmail.com`), los 25 profiles menos el sintético, las 13 organizaciones no-PANO,
y las **72 mascotas `DIM-`** — entre ellas **`DIM-PAMP-0001` (Pampa), la mascota insignia de la
demo, con sus 22 eventos intactos**. **[VERIFICADO]**

**Lo que vale la pena preservar**: Pampa y las cuentas demo. Ambas sobreviven al reseed. **No hay
motivo para no reseedear por miedo a perder la demo.**

**Mi recomendación**: **sí reseedear**, pero *después* de migrar y *antes* de invitar funcionarios.
Es la única forma de sacar los 7.089 `PANO-` de la pantalla. **Rollback**: correr el seed de nuevo
(es idempotente y determinístico).

### R3 — Verify contra staging · **Radio: build rojo y confusión · Probabilidad: media-alta**

El runbook te hace setear `DATABASE_URL` a staging; `verify` corre `lint:rls` contra lo que haya en
esa variable, y hoy eso **falla** con 27 violaciones que no tienen nada que ver con tu código.
Media hora persiguiendo un fantasma.

**Mitigación**: consola limpia (paso 3.1). **Rollback**: cerrar la consola.

### R4 — Rollback de base · **Radio: bajo, pero sin red · Probabilidad: baja**

Ninguna de las 3 migraciones destruye datos, así que "volver atrás" es raro que haga falta. Si aun
así hiciera falta, y **si no hay backup** (§B6), el SQL inverso es:

```sql
-- deshacer 0160
DROP INDEX IF EXISTS public.pets_seed_tag_idx;
ALTER TABLE public.pets DROP COLUMN IF EXISTS seed_tag;

-- deshacer 0158
ALTER TABLE public.pets
  ALTER COLUMN disclose_first_name_when_lost   SET DEFAULT true,
  ALTER COLUMN disclose_phone_when_lost        SET DEFAULT true,
  ALTER COLUMN disclose_last_location_when_lost SET DEFAULT true;

-- deshacer 0159: reaplicar el cuerpo de 0131_erase_subject_data_owner_role_scope.sql
--   (CREATE OR REPLACE FUNCTION public.erase_subject_data(uuid, text) …)
```

Y borrar las filas correspondientes de `public._dim_migrations` para que el runner las vuelva a
considerar pendientes:

```sql
DELETE FROM public._dim_migrations WHERE filename IN (
  '0158_pets_disclosure_defaults_fail_closed.sql',
  '0159_erase_subject_data_free_text_payload_keys.sql',
  '0160_pets_seed_tag.sql'
);
```

**Estas sentencias no fueron ejecutadas ni probadas contra ninguna base.** Son reversos derivados
de leer las migraciones. Probalas en local antes de tocar staging.

### R5 — Rollback de deploy · **Radio: nulo · Probabilidad: baja**

Este es el fácil, y es bueno saberlo antes: el deployment de producción actual es
`dpl_EwpnwMk8fU4BzrekP2XfJtMGjZZg` (`dim-staging-hh4646n43`, 2026-07-18). **[VERIFICADO]**
Si el deploy nuevo sale mal:

```powershell
npx vercel rollback
# o, apuntando explícito:
npx vercel promote https://dim-staging-hh4646n43-ignacio-dim.vercel.app
```

El alias vuelve en segundos. **Cuidado con el orden**: si ya aplicaste las migraciones y hacés
rollback de código, el código viejo corre contra una base más nueva. Las tres migraciones son
**aditivas**, así que eso es seguro. Esa propiedad es la que hace que "migrar primero, deployar
después" funcione — y es por eso que el runbook lo pide en ese orden.

### R6 — Env vars `NEXT_PUBLIC_*` y el rebuild · **Radio: medio · Probabilidad: baja**

Next.js **inlinea** las `NEXT_PUBLIC_*` en el bundle del cliente en tiempo de **build**. Si alguna
vez cambiás `NEXT_PUBLIC_SITE_URL` o `NEXT_PUBLIC_DEMO_MODE`, **un `vercel promote` no alcanza**:
hay que hacer un deploy nuevo que buildee. Un promote de un build viejo revive el valor viejo.

Hoy no es un problema — las variables están correctas y no hay que cambiarlas. Anotalo para cuando
llegue el dominio productivo (`D3` del `cutover-playbook.md`).

### R7 — Trampa del `.next` bajo el server corriendo · **Radio: local · Probabilidad: baja en este flujo**

`pnpm deploy:staging` **no** buildea local (§A6). `pnpm verify` **sí**. Si tenés el :3000 levantado
para QA y corrés `verify`, los chunks JS empiezan a dar 400. Rebuild + restart y listo.

---

## Lo que no pude determinar desde acá

Lo digo explícito porque una afirmación no verificada dentro de un checklist de cutover es
exactamente como se rompe producción:

1. **Los valores de los secretos de Vercel.** Están cifrados. Verifiqué que **existen** y en qué
   entornos. **No** verifiqué que `DNI_HASH_PEPPER` no sea el pepper de dev
   (`dim-test-pepper-v1`) — si lo fuera, `lib/infra/env.ts:83-86` haría fallar el boot, y como
   staging bootea bien hoy, **está bien** [inferencia, no medición directa].
2. **El valor completo de `NEXT_PUBLIC_SITE_URL`.** `vercel env ls` lo trunca en
   `https://dim-stagin…`. Sé que **no está vacío** y que es una URL absoluta. No sé si tiene barra
   final (daría igual: `resolveSiteUrl()` la saca).
3. **Quién deshabilitó el RLS en staging.** No está en el repo. Requiere el audit log de Supabase.
4. **Si existen backups de la base de staging.** El plan es `free`; la política de Supabase dice que
   no, pero eso lo confirma el dashboard, no yo.
5. **El estado de la fence del spine en otras ramas.** La busqué en el árbol de trabajo actual
   (`integration/all-20260703`). Hay 25+ worktrees de agentes activos; **no los recorrí**. Si un
   agente la está escribiendo ahora mismo en su worktree, mi "no existe" vale solo para esta rama.
6. **`vercel.json` declara `maxDuration: 300` para `refresh-cube`**, que en plan Hobby de Vercel
   estaría por encima del límite. Los builds vienen saliendo `Ready`, así que el plan lo permite o
   Vercel lo capea en silencio. **No es bloqueante**, pero si el cron del cubo empieza a cortarse a
   los 60s, mirá acá primero.

---

## Apéndice — Comandos de verificación, todos de solo lectura

```powershell
# Migraciones (con DATABASE_URL apuntando a staging)
pnpm db:migrate:status
pnpm exec tsx scripts/migrate.ts --dry-run

# Env vars de Vercel (nombres y entornos, no valores)
npx vercel env ls production

# Qué sirve hoy la URL estable
npx vercel inspect https://dim-staging.vercel.app
npx vercel ls

# La exposición del REST anónimo (§B1)
curl "https://agnwyifsdxxoznodutgq.supabase.co/rest/v1/profiles?select=display_name&limit=3" `
  -H "apikey: <ANON_KEY>"

# Estado de RLS en staging — pegalo en el SQL Editor de Supabase
SELECT c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 1;

# Qué haría la fence del spine (§B5)
SELECT count(*) FROM pets p
WHERE NOT EXISTS (
  SELECT 1 FROM pet_events e WHERE e.pet_id = p.id AND e.event_type = 'pet_registered'
);
```
