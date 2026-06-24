# Plan: Endurecimiento del modelo de acceso — features & system settings (gob/admin)

> **Para Claude Code — ejecución autónoma.** Sale del *critique del modelo de acceso* (control · acceso a la
> información · seguridad) sobre los portales `/gob` y `/admin`: cómo se conceden y se enforcing las features y los
> system settings. No son hallazgos visuales — son del modelo de autorización y auditoría. Severidad: 🔴 bloqueante ·
> 🟡 fricción/riesgo · 🟢 polish. SDD test-first, docs en el mismo PR. No tocar nada de `Verificado CORRECTO`.

## Verificado CORRECTO (no rehacer)
- **Modelo de 4 roles** sólido: `profiles.account_type` con CHECK en DB; `personal` (owner/vet) vs `institutional` (govt/admin). Las cuentas de servicio no pueden tener mascotas ni identidad Mi Argentina. ✅
- **Decomiso como role-level, no org-capability** (`requireDecomisoPrincipal`, `lib/auth-guards.ts:163`): razonamiento legal correcto (Ley 14.346, DC1 — un refugio no puede auto-decomisar). No convertir a capability de org. ✅
- **Búsqueda scope-aware**: `searchUsers(query, { role, jurisdictions })` da scope universal a admin y jurisdiccional a govt — un solo surface sirve a ambos sin filtrar datos entre jurisdicciones. ✅
- **Omnibox ya audita bien**: `searchOmniboxAction` es server action, jurisdiction-scoped y PII-logged en el server (`OpOmnibox.tsx:6`). El hueco de auditoría (AC2) es **solo** en las páginas de lista, no acá. ✅
- **`/admin` sí gatea desactivación**: `requireAdminOrRedirect` rechaza `deactivatedAt !== null` (`lib/auth-guards.ts:121`). El hueco (AC1) es exclusivo del guard compartido de `/gob`. ✅
- **Sin fuga de información en acceso a orgs**: `notFound()` en vez de redirect (decisión D4, `lib/auth-guards.ts:52-60`). ✅

## Hallazgos

| # | Hallazgo | Sev | Ubicación / evidencia | Fix |
|---|---|---|---|---|
| AC1 | **El guard compartido de `/gob` no chequea `deactivatedAt`.** `requireAdminOrGovtOrRedirect` valida sólo el `role`; **no** rechaza cuentas desactivadas. Pero el comentario del layout afirma lo contrario: *"requireAdminOrGovtOrRedirect which already gates on deactivated_at for institutional roles (Fase 5 invariant)"*. Resultado: una cuenta **govt o admin desactivada conserva acceso de lectura y escritura a todo `/gob/*`** — PII (búsqueda de usuarios), propuestas de cambio de rol, decomisos — porque las server actions gatean por este mismo guard. Un admin desactivado queda bloqueado en `/admin` pero **no** en `/gob`. | 🔴 | `lib/auth-guards.ts:78-93` (guard sin check) · `app/gob/layout.tsx:16-18` (comentario que miente) · call sites de escritura en `app/actions/admin-proposals.ts:288,300,314` · `requireDecomisoPrincipal` lo hereda (`auth-guards.ts:163-168`) | En `requireAdminOrGovtOrRedirect`: tras resolver `profile`, rechazar también `profile.deactivatedAt !== null` (redirect a `/`), igual que `requireAdminOrRedirect`. `getProfileCached` ya trae `deactivatedAt` — sin query nueva. Corregir el comentario del layout para que describa lo real. `requireDecomisoPrincipal` queda cubierto automáticamente (reusa el guard). |
| AC2 | **Auditoría de PII incompleta en las páginas de lista.** El log es *fire-and-forget* (`void logPiiQueryForAuthority(...)`) y **sólo cuando hay query**. El landing sin query muestra "los primeros N usuarios" con nombre, ID y rol **sin registrar nada** → se puede navegar PII sin dejar rastro; y si el insert falla, la lectura igual se sirve. La función en sí (`logPiiQueryForAuthority`) hace un insert limpio — el problema es el patrón en el call site. | 🟡 | `app/gob/usuarios/page.tsx:54-58` · `app/gob/organizaciones/page.tsx` · `app/admin/usuarios/page.tsx` · `app/admin/organizaciones/page.tsx` (mismo patrón `if (query) void log...`) · función en `app/actions/admin-proposals.ts:22-35` | Dos partes: (a) **registrar también el landing sin query** (loggear con `query=""` / un marcador `list_landing`) **o** no exponer PII hasta que haya búsqueda — elegir una y aplicarla a las 4 páginas; (b) **no perder el log en silencio**: envolver en `try/catch` que escriba a `console.error` ante fallo (sin romper el render). Mantener el omnibox como está (ya correcto). |
| AC3 | **Nav de admin cruza de portal vía redirect + 3 páginas muertas.** Tres ítems del nav admin (Cola, Usuarios, Organizaciones) apuntan a `/admin/*` que el middleware 308-redirige a `/gob/*`. Las páginas `app/admin/{cola,usuarios,organizaciones}/page.tsx` quedaron como **código muerto duplicado** del surface de `/gob` y **ya divergieron** (sus `ROLE_LABELS` usan copy sin acentos: "Dueno/a"). Riesgo: que alguien las "reviva" sin el redirect ni el scope correcto; y el nav hace un salto 308 innecesario en cada clic. | 🟡 | `middleware.ts:40-56` (los tres 308) · `components/layout/nav-presets.ts` `ADMIN_NAV_SECTIONS` (hrefs `/admin/cola`, `/admin/usuarios`, `/admin/organizaciones`) · carpetas muertas `app/admin/cola/`, `app/admin/usuarios/`, `app/admin/organizaciones/` | Una sola superficie por feature: **borrar** las tres páginas admin muertas y **repuntar** los hrefs de `ADMIN_NAV_SECTIONS` a `/gob/{cola,usuarios,organizaciones}` (admin conserva scope universal ahí vía el layout de `/gob`). **Mantener** los 308 del middleware para bookmarks externos. Extender el test de integridad de nav: ningún href del nav debe resolver a un 308. |
| AC4 | **Reglas a nivel localidad inalcanzables por UI.** AGENTS.md §227-229 y el propio header de la página prometen reglas "por país, provincia **o localidad**" con cascada `localidad > provincia > país`. El backend está completo (ruta `[country]/[province]/[locality]/reglas`, forms y query aceptan `jurisdictionLocality`), pero la página de listado sólo pinta país y provincias, generando siempre el segmento localidad como `"_"`. El admin **no tiene forma en la UI** de crear/ver una regla de localidad salvo escribir la URL a mano. | 🟡 | `app/admin/jurisdicciones/page.tsx:64,95` (locality hardcodeado `"_"`) · ruta dinámica de localidad ya existente bajo `app/admin/jurisdicciones/[country]/[province]/[locality]/reglas/` | Agregar drill-down a localidad: al entrar a una provincia, listar sus localidades (catálogo INDEC ya existe) o un selector, y linkear con la localidad real en el segmento en vez de `"_"`. Mostrar el conteo de reglas por localidad como ya se hace por provincia. |

## Cobertura del barrido (para trazabilidad)
Revisados en código: `lib/auth-guards.ts`, `middleware.ts`, `lib/request-cache.ts` (`getProfileCached`/`getJurisdictionsCached`),
`components/layout/nav-presets.ts`, `app/gob/layout.tsx`, `app/admin/layout.tsx`, `app/gob/usuarios/page.tsx`,
`app/admin/{cola,usuarios,organizaciones}/page.tsx`, `app/admin/jurisdicciones/page.tsx`, `app/actions/admin-proposals.ts`,
`components/ui/dashboard/OpOmnibox.tsx`. Sub-páginas de detalle (`[id]`/`[token]`) no se abrieron una por una.

## Ejecución (orden sugerido, autónomo)
1. **AC1** — el fix de seguridad, primero. Contenido: un check en el guard + el comentario + test de rechazo.
2. **AC2** — cerrar el hueco de auditoría de PII en las 4 páginas de lista.
3. **AC3** — borrar páginas muertas + repuntar nav (cuidado: las páginas `/gob` ya importan componentes desde `../../gob/...`; al borrar las de admin, mover/duplicar cualquier import que dependa de ellas — verificar con `tsc`).
4. **AC4** — drill-down a localidad en jurisdicciones.

## Tests
- **AC1**: integración/unit del guard — una cuenta `govt` con `deactivated_at` seteado, y un `admin` desactivado, son **rechazados** al entrar a `/gob` y al invocar una server action de `admin-proposals` (no 200). Caso de control: cuenta activa pasa. e2e opcional: `GET /gob` con sesión desactivada → redirect a `/`.
- **AC2**: integración — entrar a `/gob/usuarios` **sin** query inserta una fila `pii_queried` (o no expone PII, según la opción elegida); con query, sigue insertando con `result_count` correcto. Unit: el fallo del insert no tira el render pero deja `console.error`.
- **AC3**: el test de integridad de nav (ya existe para "ningún href perdido") se extiende a "ningún href de `ADMIN_NAV_SECTIONS` matchea una regla 308 del middleware". `tsc` y build verdes tras borrar las carpetas.
- **AC4**: e2e — desde `/admin/jurisdicciones` se puede navegar a la lista de reglas de una **localidad** concreta (segmento ≠ `"_"`) y crear una; unit del resolver de cascada con un override de localidad ganándole a uno de provincia.

> Al cerrar, marcar en [`docs/superpowers/README.md`](../README.md) (sección de hardening / extiende el barrido admin 2026-06-22).
> AC1 es además un **síntoma** del modelo "authz solo en el edge" — ver la nota de seguimiento sobre defensa en profundidad en el handoff de conversación (queda fuera de este plan a propósito).
