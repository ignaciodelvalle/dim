# Entorno & coordinación Cowork ↔ Claude Code (CC)

> Convención para que **Cowork** (revisión humana / sesión cowork) y **CC** (Claude Code) nunca trabajen
> ni prueben sobre un entorno o una rama desactualizada. Origen: confusión 2026-06-23 por carpetas `dim-*`
> fantasma y ramas viejas.

## Regla 0 — UN solo working copy: `C:\dim`

- El **único repo real** es `C:\dim` (tiene `.git` como carpeta = clon principal).
- Las carpetas `C:\dim-admin`, `C:\dim-dash`, `C:\dim-gate`, `C:\dim-pano`, `C:\dim-panorama`, `C:\dim-seed`
  son **fantasmas**: solo contienen un `node_modules` huérfano (sin código, sin `.git`, sin `package.json`).
  Quedaron de worktrees de una corrida multi-agente vieja (21/6). **No se trabaja ni se prueba ahí.**
  `C:\dim-salvage` solo tiene `.patch`/`.md` viejos (archivo, no repo).
- **Acción recomendada (una vez):** borrarlas para no volver a abrirlas por error:
  ```powershell
  Remove-Item C:\dim-admin,C:\dim-dash,C:\dim-gate,C:\dim-pano,C:\dim-panorama,C:\dim-seed,C:\dim-salvage -Recurse -Force
  ```

## Regla 1 — La verdad vive en GitHub (origin), no en el disco

Todo el trabajo terminado está **commiteado y pusheado** a `origin`. El disco local puede estar en cualquier
rama; lo que vale es lo que está en `origin` + la **rama activa** declarada abajo.

## Regla 2 — Rama activa declarada (el único lugar que Cowork mira)

CC mantiene actualizado el marcador en [`docs/superpowers/README.md`](../superpowers/README.md) → sección
**“▶ Rama activa”**. Antes de probar, Cowork lee esa línea y se para en ESA rama.

## Regla 3 — Antes de probar, Cowork sincroniza (3 comandos)

```powershell
cd C:\dim
git fetch origin
git checkout <RAMA-ACTIVA> ; git pull
pnpm install
# levantar la demo:
$env:NEXT_PUBLIC_DEMO_MODE="true"; pnpm dev   # http://localhost:3000
```

Si la app no muestra cambios esperados → casi siempre es **rama vieja** o **dev server viejo**: parar el server
(Ctrl+C), `git checkout <RAMA-ACTIVA>; git pull`, y volver a levantar.

## Regla 4 — CC pushea por work-package

CC hace push de la rama activa después de cada WP, así Cowork siempre puede `git pull` y ver lo último.
CC marca el avance en el orquestador (`docs/superpowers/plans/2026-06-23-CONSOLIDATED-demo-panorama-cc.md`)
y en el README.

## Regla 5 — Seed local, idempotente

El seed de demo es local-only (guards). Para datos de cámara:
`pnpm seed:panorama` → `pnpm seed:test` → `pnpm seed:demo:scenario`, y `pnpm demo:verify` como gate.
Re-correrlos no duplica.

## Regla 6 — Nunca `verify`/`build` con el dev server prendido

`next dev` y `next build` pelean por la misma carpeta `.next` → el build **se cuelga** (se vio: 64 min
trabado). Antes de `pnpm verify` o `pnpm build`, **parar el `pnpm dev`** (Ctrl+C / matar node). Volver a
levantarlo después. Si un build parece colgado, casi siempre es esto: matar node y reintentar limpio.

---

### Estado actual (2026-06-24)
- **▶ Rama activa (browser/review): `integration/session-review`** — TODO junto: demo+panorama (#732)
  **+** seguridad advisor (#734) mergeados. Es la ÚNICA rama que refleja el estado completo actual;
  cowork la checkea para navegar y revisar honestamente. `pnpm verify` verde · `pnpm demo:verify` verde
  · tests RLS verdes. DB local: `seed:panorama` (45.796 mascotas) + `seed:demo:scenario` (focal CABA).
  Levantar: `git checkout integration/session-review; git pull; $env:NEXT_PUBLIC_DEMO_MODE="true"; pnpm dev`.
- PRs abiertos (unidades de review en GitHub — NO navegar acá, revisar el diff):
  - **#732** demo+panorama (base `feat/nav-deferred-population-cycle`) — lo **visible** en browser.
  - **#734** seguridad advisor 0113+0114 (base `review/all-session-prs`) — **solo DB** (RLS/migraciones/
    grants), no se ve en browser; se revisa por el diff + el advisor.
  - #733 cerrado sin merge; rama `fix/sec-advisor-rls-errors` borrada (su contenido vive en #734).
- **Acción del owner (no-código):** activar *leaked password protection* en el Supabase Dashboard
  (Authentication → Password) para cerrar el último WARN crítico — detalle en el PR #734.
- **Salud del repo:** `git fsck --full` limpio (sin corrupción; solo objetos *dangling* normales). El
  trabajo uncommitted previo se preservó en `wip/demo-panorama-rescue`. ⚠️ La base
  `review/all-session-prs` está **stale**: le falta el fix de `server-only` (seeds crashean en bootstrap)
  — conviene forward-portear `ca44d624`+`488337bb` o rebasear. Detalle en el reporte de la sesión.
