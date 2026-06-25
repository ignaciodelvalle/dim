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

### Estado actual (2026-06-24, sesión integrada)
- **▶ Rama activa (browser/review): `integration/session-review`** — TODO el trabajo de la sesión
  mergeado en UNA rama: demo+panorama (#732) **+** seguridad advisor (#734) **+** backlog completo
  (A3 invariante account_type↔role · A4 nav dedupe · A7 DNI RUPPPA · A8 INDEC fallback · A10
  panorama↔analytics se mantienen ambos · A11 quick-capture prefill) **+** design-system operador
  (F1 tokens `st-*` · F2 OpStatusPill · F3 OpButton · F3-full 91 botones migrados · F4 casos density).
  Es la ÚNICA rama que refleja el estado completo; cowork la checkea para navegar y revisar honestamente.
  **Probada end-to-end:** `pnpm verify` verde · `pnpm test` verde (**6511 passed, 0 failed**, 510 files)
  · `pnpm demo:verify` verde (10/10 invariantes). DB local: `seed:panorama` (~45.8k mascotas) +
  `seed:demo:scenario` (focal CABA) + migración `0112_ownerships_pet_id_idx` aplicada.
  Levantar: `git checkout integration/session-review; git pull; $env:NEXT_PUBLIC_DEMO_MODE="true"; pnpm dev`.
- **Dos superficies de revisión (a propósito):**
  - **Browser QA (cowork):** se navega la app corriendo sobre `integration/session-review` — la ÚNICA rama
    que junta todo. Es la rama para probar visualmente / filmar.
  - **Review por diff:** se hace sobre los PRs individuales del backlog (#732, #734–#745), que están
    **abiertos** y cada uno trae un diff acotado a su feature (bases apiladas). NO se cerraron ni se
    fusionaron en un PR gigante: `integration/session-review` vs `develop` son ~491 archivos / ~47k líneas,
    inrevisables como una sola unidad. Cada PR granular sigue siendo la unidad de merge real.
  - Verificado con `git merge-base`: el contenido de las 14 ramas del backlog está 100% contenido en
    `integration/session-review`, así que navegar esa rama = ver todo el trabajo de la sesión.
- **Acción del owner (no-código):** activar *leaked password protection* en el Supabase Dashboard
  (Authentication → Password) para cerrar el último WARN crítico — detalle en el PR #734.
- **Salud del repo:** `git fsck --full` limpio (solo objetos *dangling* normales). El trabajo uncommitted
  previo se preservó en `wip/demo-panorama-rescue`. El fix de `server-only` (`ca44d624`+`488337bb`) **ya
  está** en `integration/session-review` → los seeds corren sin el workaround manual del stub.
- **Gotcha resuelto:** la migración `0112` (índice `ownerships_pet_id_idx`) no se había aplicado en la DB
  local (0113/0114 sí, 0112 no — se saltó), lo que hacía timeoutear los tests de performance de
  `/admin/programa` (seq-scan ~135s). Resuelto con `pnpm db:migrate`. Si `admin-analytics-perf` vuelve a
  timeoutear a los 5000ms exactos → falta un índice en la DB local, correr `pnpm db:migrate`.
