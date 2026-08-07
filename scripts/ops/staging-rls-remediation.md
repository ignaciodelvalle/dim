# Runbook — reactivar RLS en staging

> **Quién lo corre**: Ignacio (PO). Nadie más tocó ni va a tocar la base remota.
> **Qué acompaña**: `scripts/ops/staging-rls-remediation.sql`, en esta misma carpeta.
> **Contexto completo**: `docs/reviews/results/2026-07-26-cutover-staging-readiness.md` §B1.
> **Escrito el 2026-07-26. Ninguna de estas sentencias fue ejecutada contra ninguna base**
> — están derivadas de leer `db/migrations/*.sql` y `scripts/check-rls-coverage.ts`.

---

## 1. El peligro, en una frase

**Prender RLS en una tabla que NO tiene políticas hace que esa tabla devuelva CERO filas
a todo cliente que no sea `service_role`. Al instante. Sin error, sin aviso: un resultado
vacío idéntico a "no hay datos".**

Una pantalla que hoy funciona puede quedar en blanco en el segundo en que hacés `COMMIT`.
No hay deploy que lo frene ni caché que te dé tiempo: PostgREST lo toma en el request
siguiente.

Por eso el paso 3 (pre-flight) no es opcional. Es literalmente el paso que te dice
**qué se va a apagar antes de apagarlo**.

### Por qué igual creemos que acá es seguro

No es optimismo, es evidencia verificada sobre el código de esta rama:

- La app se conecta por `DATABASE_URL` con el rol `postgres`, que tiene **BYPASSRLS**.
  Todo Drizzle, toda server action, la página pública `/p/[publicToken]` y la ruta Tier-2
  de la libreta pasan por ahí e **ignoran RLS por completo**.
  Fuente: cabecera de `db/migrations/0086_track_rls_in_migrations.sql`.
- RLS sobre tablas `public` sólo gobierna **PostgREST** — la anon key de supabase-js.
  Busqué en todo el repo quién usa el cliente de navegador: son cuatro archivos
  (`components/BulkRevokeList.tsx`, `app/gob/usuarios/RevokeUserActions.tsx`,
  `app/gob/organizaciones/RevokeOrgActions.tsx`, `lib/ui/use-evidence-upload.ts`) y
  **los cuatro llaman `supabase.storage.from("revocations")`** — un bucket de Storage,
  no una tabla. Storage se autoriza en `storage.objects` y este script no lo toca.
  Tampoco hay ninguna suscripción realtime (`.channel()` / `postgres_changes`) ni ningún
  `fetch()` directo a `/rest/v1` en el código de la app.
- **Conclusión**: al día de hoy, en esta rama, **ninguna superficie de la aplicación lee
  una tabla `public.*` vía PostgREST**. El radio de explosión esperado es cero.

**El límite honesto de esa conclusión**: habla del repositorio, no de la base. No sé qué
tiene abierto una sesión de Studio, una colección de Postman o un script de alguien contra
staging ahora mismo. El pre-flight es lo que convierte esa afirmación sobre el código en un
hecho sobre la base.

### Una cosa que NO hay que hacer

**Nunca agregues `FORCE ROW LEVEL SECURITY`.** El `ENABLE` común exime al dueño de la tabla;
`FORCE` no. Como la app se conecta justamente como el dueño (`postgres`), un `FORCE` le
aplicaría las políticas a la aplicación misma y **tira el producto entero abajo**.
En el `.sql` no hay ningún `FORCE`, y el paso 6.B verifica que siga sin haberlo.

---

## 2. Preparar la consola

Consola **nueva**. Pooler de **sesión**, puerto **5432** — el pooler de transacciones (6543)
no soporta DDL y esto es todo DDL.

```powershell
$env:DATABASE_URL = "postgresql://postgres.agnwyifsdxxoznodutgq:<DB_PASSWORD>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
```

> **Ojo con esta variable.** Queda seteada en la sesión de PowerShell. Si después corrés
> `pnpm verify` en esta misma consola, `lint:rls` y otros tres lints se conectan a staging y
> te van a dar un rojo que no tiene nada que ver con tu código (§B4 del review de cutover).
> **Cerrá esta consola cuando termines.**

Alternativa sin consola: el **SQL Editor del dashboard de Supabase**, que también corre como
`postgres`. Para este trabajo sirve igual y es menos riesgoso porque no deja variables
colgadas.

---

## 3. Pre-flight — leer antes de tocar

Corré las cuatro consultas de la **sección 1** del `.sql`. **No escriben nada.**

| Consulta | Qué te dice |
|---|---|
| **1.A** | Las 53 tablas, con su RLS, su cantidad de políticas y un veredicto en castellano técnico de qué le pasaría a cada una |
| **1.B** | Los números gordos: cuántas tablas hay y cuántas están sin RLS |
| **1.C** | **La lista que importa**: exactamente qué tablas se apagan para PostgREST |
| **1.D** | Políticas "abiertas de par en par" (`USING (true)` para anon) — RLS prendido que igual entrega todo |

### Qué mirar en cada una

**1.B es la que confirma el "27 de 53".** El review lo afirma; esta consulta lo prueba.
Si te da otro número, **el review quedó viejo y este runbook también** — pará y avisá.

**1.C es la decisión.** Cada fila es una tabla que va a devolver cero filas.
La columna `intended` te dice si eso es lo esperado:

- `intended = true` → está en el allowlist del repo (`DENY_ALL_ALLOWLIST` en
  `scripts/check-rls-coverage.ts`). Apagarse **es el objetivo**: son tablas que sólo se
  tocan por Drizzle/service-role.
- `intended = false` → **frená acá**. Significa una de dos cosas, y ninguna es buena:
  o le borraron las políticas junto con el RLS, o hay algo que la lee que la revisión de
  código no vio.

**Lo que esperamos según el repo**: de las 14 tablas que el review nombra como apagadas,
**sólo dos** tienen cero políticas por diseño — `case_events` y `organization_invitations`.
Las otras doce tienen políticas escritas en migraciones y **no se van a apagar**: prender RLS
simplemente vuelve a activar lo que ya estaba escrito.

**El escenario que cambia todo**: el advisor de Supabase reportó 27 hallazgos
`rls_disabled_in_public` y sólo 3 `policy_exists_rls_disabled`. Si eso es una por tabla,
implica que **24 de las 27 no tienen políticas en staging** — o sea que a las políticas
también se las llevaron puestas. En ese caso 1.C va a listar muchas más de dos, con
`intended = false`, y el trabajo deja de ser "prender RLS" para pasar a ser "reaplicar la
0086 completa" (que recrea políticas Y prende RLS, y es idempotente).
**Esa inferencia no está verificada.** 1.C la confirma o la descarta en un segundo, y ése es
exactamente el motivo por el que el pre-flight va primero.

### Guardá la salida de 1.A

Copiala a un archivo antes de seguir. **Es la única foto del estado previo que va a existir.**
Si algo sale mal, es lo único que te va a decir qué tabla estaba en qué estado.

---

## 4. Aplicar, en cuatro bloques

La sección 2 del `.sql` son cuatro transacciones separadas, ordenadas para que **la peor
exposición se cierre primero**. Si parás a la mitad, ya cerraste lo peor y la base queda
consistente.

| Bloque | Tablas | Riesgo de pantalla en blanco |
|---|---|---|
| **1** | `profiles`, `pets`, `pet_events`, `ownerships`, `audit_log` (5) | **Ninguno** — las cinco tienen políticas |
| **2** | Las otras 9 que el review nombró | Dos se apagan: `case_events`, `organization_invitations`, ambas por diseño |
| **3** | Las 25 restantes que tienen políticas | Ninguno |
| **4** | Las 14 de deny-all por diseño | Se apagan todas — **ése es el objetivo** |

### Bloque 1 primero, y frená

El bloque 1 son las cinco tablas que el review probó que están goteando — incluido
`profiles.display_name` con el mail real de un usuario.

Después del `COMMIT` del bloque 1, **pará y corré el probe del paso 5**. Las cinco tienen que
volver vacías o 401 antes de seguir. Si todavía devuelven filas, algo más está pasando y
seguir con más `ALTER` no lo va a arreglar.

### Si 1.C mostró algo con `intended = false`

No corras los bloques 3 y 4 hasta entender por qué. Los bloques 1 y 2 sí: son las tablas de
mayor PII y el review probó que están abiertas.

Todo es **idempotente**: `ENABLE ROW LEVEL SECURITY` sobre una tabla que ya lo tiene no hace
nada. Podés re-correr cualquier bloque sin miedo.

---

## 5. El probe — la única verificación que vale

**Desde SQL no se puede verificar.** Tu sesión se conecta como `postgres`, que bypassea RLS:
mirando desde adentro de la base siempre va a parecer que está todo bien. **La prueba real es
desde afuera, con la anon key.**

```powershell
# La anon key sale del dashboard de Supabase → Project Settings → API → anon/public
$anon = "<ANON_KEY>"
$base = "https://agnwyifsdxxoznodutgq.supabase.co/rest/v1"

foreach ($t in @("profiles","pets","pet_events","ownerships","audit_log")) {
  $r = curl.exe -s -o NUL -w "%{http_code}" "$base/$t`?select=*&limit=1" -H "apikey: $anon"
  $body = curl.exe -s "$base/$t`?select=*&limit=1" -H "apikey: $anon"
  "{0,-14} HTTP {1}  {2}" -f $t, $r, $body.Substring(0, [Math]::Min(80, $body.Length))
}
```

> **`curl.exe`, no `curl`.** En Windows PowerShell 5.1 `curl` es un alias de
> `Invoke-WebRequest`, que **no acepta `-H`** y falla con un error confuso sobre parámetros.
> Escribir `curl.exe` fuerza el binario real y funciona en 5.1 y en pwsh 7 por igual.
> (El review de cutover usa `curl` a secas; si te tira error de parámetros, es por esto.)

### Cómo leer el resultado

| Respuesta | Qué significa |
|---|---|
| `HTTP 200` con `[]` | ✅ **Cerrado.** RLS activo, ninguna política le da acceso al anon |
| `HTTP 401` / `HTTP 403` | ✅ **Cerrado**, y además el grant tampoco alcanza |
| `HTTP 206` o `200` **con filas** | ❌ **Sigue abierto.** No sigas: algo no se aplicó |

Antes del arreglo, las cinco devolvían **206 con filas completas**. Después tienen que
devolver `[]`.

Después del probe, corré las verificaciones SQL de la **sección 3**:

- **3.A** — tablas todavía sin RLS. **Tiene que dar 0.**
- **3.B** — tablas con `FORCE`. **Tiene que no devolver filas.** Si devuelve algo, la app está
  por quedarse afuera de su propia base: `ALTER TABLE public.<x> NO FORCE ROW LEVEL SECURITY;`
  de inmediato.
- **3.C** — tablas con RLS y cero políticas. **Tienen que ser exactamente las 16 del allowlist.**
  Si hay más de 16, alguien perdió una política en el camino.
- **3.D** — repetir 1.D: no puede quedar ninguna política `USING (true)` para anon.

---

## 6. Rollback — y por qué casi nunca es la respuesta

**Correr la sección 4 vuelve a abrir la fuga.** Deja staging en un estado donde cualquiera con
la anon key — una clave que es **publicable por diseño**, pensada para viajar al navegador —
puede paginar 66.732 mascotas, 226.335 eventos, 25 perfiles (7 con teléfono, 2 con
`dni_hash`/`dni_last4`), 7.099 denuncias y el `audit_log` completo.

**Un dato leído no se des-lee. No hay rollback del rollback.**

Por eso la sección 4 está **comentada a propósito** y no trae el rollback completo escrito.

### El único motivo legítimo

Se rompió una pantalla real, identificaste **cuál tabla**, y necesitás esa **una** tabla
abierta mientras escribís su política. En ese caso descomentás **una línea**, con el nombre de
esa tabla. No pegues el bloque entero.

### La pregunta más barata, primero

Antes de deshabilitar nada: **¿la pantalla está en blanco por falta de política, o por RLS?**
Si es falta de política, el arreglo es **escribir la política**, no apagar RLS. Y una política
es una migración, o sea que queda en el árbol en vez de en el historial del SQL editor de
alguien — que es exactamente cómo llegamos acá.

Si de verdad necesitás restaurar el estado previo completo, **la salida de 1.A que guardaste en
el paso 3 es la única fuente correcta** de qué tabla estaba en qué estado.

---

## 7. Después: que no vuelva a pasar

Este script es **respuesta a incidente, no el arreglo**.

Un script de ops corrido a mano contra una base remota es exactamente la clase de acción que
causó esto: algo deshabilitó RLS fuera del árbol de migraciones y, justamente por estar
fuera del árbol, después nadie pudo encontrar qué fue.
Verificado: la cadena `DISABLE ROW LEVEL SECURITY` **no aparece en ningún lado del repo**,
salvo dentro del documento de review que la menciona.

El arreglo durable es una **migración forward-only** (`db/migrations/NNNN_*.sql`, recontando el
próximo entero libre al momento de escribirla) con estos mismos `ALTER`. Con eso:

- `pnpm lint:rls` falla mientras haya una tabla sin RLS
- `pnpm lint:scope-authz` (agregado hoy, commit `f7ccde2a`) falla además ante una política
  `PERMISSIVE` abierta para anon — que `lint:rls` **no puede ver**, porque sólo cuenta políticas

Los dos corren dentro de `pnpm verify`, así que la regresión pasa a ser un build roto en vez de
un advisor de Supabase que nadie mira.

**Escribir esa migración es trabajo de agente. Aplicarla a la base remota es decisión tuya.**

---

## Resumen de un vistazo

1. Consola nueva, pooler **5432** (o SQL Editor del dashboard).
2. Correr **§1 completa** del `.sql`. **Guardar la salida de 1.A.**
3. Leer **1.C**. ¿Algo con `intended = false`? Frenar y explicarlo.
4. Correr **bloque 1**. `COMMIT`.
5. Correr el **probe** (§5). Las cinco tablas tienen que dar `[]`.
6. Correr **bloques 2, 3, 4**.
7. Correr **§3 completa**: 3.A = 0, 3.B vacío, 3.C = 16 tablas, 3.D vacío.
8. Probe de nuevo.
9. **Cerrar la consola** (por el `DATABASE_URL` de staging).
10. Pedir la migración que lo deja fijo.
