# Guía de proyecto y Git — CC es el dueño de Git

> **Quién hace qué.** En este proyecto **Claude Code (CC) codea y maneja Git en su totalidad**.
> Nacho conduce el producto y **no corre comandos** en el día a día. Casi toda esta guía son **reglas
> para CC**. Lo único que Nacho necesita está al final (§ Salida de emergencia).
>
> Objetivo de este doc: que el repo **no vuelva a quedar frágil** (branches sin commits, árbol con
> cientos de archivos staged, packs de git corruptos).

---

## TL;DR para CC (no negociable)

1. **Una branch por tarea**, ramificada de la base correcta. **Commiteá al terminar cada tarea.**
2. **Entregá siempre el árbol LIMPIO** (`git status` sin cambios sin commitear). Nunca dejes trabajo
   staged/sin commitear ni una branch sin ningún commit.
3. **Antes de cada commit:** `pnpm verify` + los tests relevantes. **Antes del PR:** `/security-review` + `/review`.
4. **Chequeo de salud:** al empezar la sesión corré `git status` y `git fsck --full`. Si hay
   corrupción, arreglala **antes** de codear (§ Runbook).
5. **El remoto (GitHub) es la fuente de verdad.** La corrupción local siempre se recupera re-clonando.

## Comandos del día a día (qué hace cada uno)

| Comando | Qué hace |
|---|---|
| `pnpm db:start` | Levanta Supabase local (Postgres + Auth + Storage) en Docker. |
| `pnpm db:bootstrap` | Schema + migraciones + triggers + RLS + storage + seeds, en un comando (idempotente, solo local). |
| `pnpm db:status` | Lista la DB local y sus credenciales. |
| `pnpm db:reset` | Reinicia la DB local a cero (para un baseline limpio de tests). |
| `pnpm seed:panorama` | Datos sintéticos con volumen (cola, casos, observaciones, outbox). |
| `pnpm db:migrate` | Aplica `db/migrations/*.sql` vía `scripts/migrate.ts` (tracking en `_dim_migrations`). |
| `pnpm dev` | App en http://localhost:3000. |
| `pnpm test` | Vitest (necesita la DB corriendo). |
| `pnpm verify` | tsc + Biome + lint:tokens + lint:ui + next build. **El gate de "verde".** |

> Docker Desktop tiene que estar corriendo antes de cualquier comando `db:*`.

## La regla de dependencia

**spec → plan → PR → flip README.** El código desciende de los documentos, no al revés. Si un cambio
choca con lo escrito, **planteralo antes de codear** (no codees alrededor). Detalle de handoffs:
`docs/templates/dim-handoff/SKILL.md`.

## Reglas de Git que mantienen el repo sano (CC las cumple siempre)

1. **Commiteá temprano y seguido.** Fin de tarea = commiteado y árbol limpio. Un commit chico y
   frecuente nunca se pierde; un pile de cambios staged sin commit, sí.
2. **Nunca trabajes sobre una branch con cero commits.** Si te encontrás una (como
   `fix/demo-panorama-consolidated` el 2026-06-24: sin commits + cientos de archivos staged),
   **primero preservá el trabajo** (`git stash` o un commit en una branch `wip/...`), documentá qué
   era, y recién después seguí. No pierdas trabajo y no lo dejes colgando.
3. **Nombre de branch:** `fix/` · `feat/` · `chore/` · `perf/` + descripción corta. Ramificá de la
   base acordada (p. ej. `review/all-session-prs`), no de cualquier lado.
4. **PRs chicos, merge en orden**, con nota de supersesión cuando dos PRs tocan lo mismo (lo cubre el
   skill `dim-handoff`).
5. **Nunca interrumpas/mates un comando de git a mitad de escritura** (ctrl-C en un `commit`/`gc`/
   `fetch`) — es la causa típica de packs corruptos (`improper chunk offset`).
6. **Al cerrar la sesión:** `git status` **debe** estar limpio, o explícitamente stasheado con una
   nota de qué quedó. Nunca devuelvas el repo a Nacho en estado ambiguo.

## Runbook — si Git está corrupto (CC lo arregla)

Síntomas: `error: improper chunk offset(s) ...`, `fatal: loose object ... is corrupt`, fallos de fsck.

```bash
git fsck --full                 # 1. ver qué está roto
git gc --prune=now              # 2. compactar; muchas veces alcanza
git repack -ad                  # 3. re-empaquetar objetos
git fetch origin                # 4. re-traer objetos faltantes del remoto
# 5. último recurso (siempre funciona): re-clonar limpio y re-aplicar lo no commiteado.
#    El remoto es la fuente de verdad — un clone limpio recupera todo lo pusheado.
```

Después de reparar, confirmá con `git fsck --full` (sin errores) antes de seguir codeando.

## Setup de una sola vez para que NUNCA vuelva a pasar (Nacho lo hace una vez y se olvida)

Estas dos cosas son la causa raíz #1 de corrupción en Windows:

1. **El repo NO puede vivir dentro de OneDrive / Dropbox / Google Drive.** La sincronización en la
   nube + `.git` = packs corruptos. Si `C:\dim` está bajo una carpeta sincronizada, movelo a una ruta
   local plana (p. ej. `C:\dev\dim`) y re-clonalo ahí.
2. **Excluí el repo (o `.git`) del antivirus en tiempo real.** Los escáneres pueden corromper packs
   mientras git escribe.

Hecho esto, no tenés que tocar git nunca más.

## Salida de emergencia (lo ÚNICO que Nacho hace con git)

No corrés git. Si CC te dice que el repo está roto, o ves errores raros, decile a CC, textual:

> "El repo git está roto. Diagnosticá con `git fsck --full` y arreglalo siguiendo el runbook de
> `docs/ops/git-and-workflow.md`. Si no se puede, re-cloná de GitHub y re-aplicá lo no commiteado."

Eso es todo. Todo está en GitHub; un clone limpio siempre recupera. Te podés desentender.
