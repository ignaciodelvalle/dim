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

---

### Estado actual (2026-06-23)
- **Rama activa:** `fix/demo-panorama-consolidated` (consolida EXEC #730 + NAV #731 + Panorama/CAM en curso).
- PRs abiertos: **#730** (demo-readiness, EXEC) y **#731** (nav diferida) — ya en `origin`.
- La consolidada desciende de `review/all-session-prs` e incluye todo lo de #730/#731 sin rehacerlo.
