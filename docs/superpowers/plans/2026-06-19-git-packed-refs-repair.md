# Plan — Reparar `.git/packed-refs` corrupto (línea truncada)

> **Status:** 🟢 Ready for Claude Code · **Date:** 2026-06-19 · **Infra / operativo (no toca código de la app).**
> · **Origen:** auditoría 2026-06-19 — los comandos git fallan con `fatal: unterminated line in .git/packed-refs`.
> · **Riesgo:** bajo (la corrupción es una sola línea de un ref remoto), pero **edita internals de git** → backup obligatorio y ejecutar fuera de cualquier operación git concurrente.

---

## Diagnóstico (ya hecho — confirmar antes de actuar)
- `git status`, `branch`, `log`, `reflog` fallan **todos** con `fatal: unterminated line in .git/packed-refs: 4698c241…d2596f55 refs/remotes/origin/feat/wav`.
- Causa: la **última línea de `.git/packed-refs` está truncada** a mitad de escritura — termina en `…/feat/wav` **sin salto de línea final** (el nombre del ref quedó cortado). Git rechaza parsear todo el archivo si una línea está malformada → por eso fallan *todos* los refs, no sólo ese.
- La línea dañada es un **ref de seguimiento remoto** (`refs/remotes/origin/feat/wave…`) — el tipo menos valioso: se restaura solo con `git fetch`.
- `HEAD` → `refs/heads/develop` (sano). `ORIG_HEAD` presente (corrió un merge/rebase/reset reciente). Sin `.lock` colgados. Objetos (commits/blobs/trees) intactos: **no hay pérdida de datos**.

⚠️ **Probable causa raíz: una escritura interrumpida de git** (fetch / `pack-refs`) durante el trabajo de Wave 5. Confirmar que **no hay una sesión git/CC escribiendo ahora mismo** antes de reparar (si Wave 5 está corriendo un comando git, esperar a que termine).

---

## 0. Antes de tocar nada
- **NO** correr durante una operación git activa (Wave 5 en vivo). Verificar que no haya `.git/index.lock` ni `.git/*.lock`:
  ```bash
  ls -la .git/*.lock 2>/dev/null || echo "sin locks — ok"
  ```
- Esto **no** es un cambio de la app: sin tests de Vitest, sin PR de feature necesariamente (puede ir como chore). No tocar `db/`, `src/`, `app/`.

---

## Fase A — Backup (obligatorio)
```bash
cp .git/packed-refs .git/packed-refs.bak.$(date +%s)
wc -l .git/packed-refs            # nota el conteo de líneas para verificar después
tail -c 120 .git/packed-refs | cat -A   # confirmar que la última línea es la de 'feat/wav' sin '$' final
```

## Fase B — Reparación quirúrgica (quitar sólo la última línea truncada)
La estrategia más segura es **eliminar únicamente la última línea** (el ref remoto truncado) y garantizar salto de línea final. NO editar ninguna otra línea.

```bash
# Reescribe packed-refs sin su última línea, a un temporal, y reemplaza atómicamente.
head -n -1 .git/packed-refs > .git/packed-refs.fixed
printf '\n' >> /dev/null   # (no-op: head ya deja la nueva última línea con su \n)
mv .git/packed-refs.fixed .git/packed-refs
```

Notas:
- `head -n -1` (GNU coreutils) descarta la última línea; como la línea N-1 ya terminaba en `\n`, el archivo queda bien terminado.
- Si `head -n -1` no estuviera disponible, alternativa equivalente:
  ```bash
  sed '${/refs\/remotes\/origin\/feat\/wav$/d;}' .git/packed-refs > .git/packed-refs.fixed && mv .git/packed-refs.fixed .git/packed-refs
  ```
  (borra la última línea sólo si coincide con el ref truncado — más conservador.)

## Fase C — Verificar que git volvió
```bash
git status                        # ya NO debe tirar 'unterminated line'
git rev-parse --abbrev-ref HEAD   # -> develop
git rev-parse develop             # devuelve un SHA (el ref local sobrevive en packed-refs)
git fsck --connectivity-only      # opcional: integridad de objetos (debe estar limpio)
git log -1 --oneline
```

## Fase D — Restaurar el ref remoto perdido + normalizar
```bash
git fetch --prune origin          # recrea refs/remotes/origin/* (incluido el feat/wave… truncado)
git pack-refs --all               # reescribe packed-refs limpio y consistente
git show-ref | tail               # sanity check
```

---

## Verificación final / criterio de éxito
- `git status` corre sin error y muestra la rama `develop`.
- `git rev-parse develop` y `git log -1` funcionan.
- `git fetch --prune` restauró los refs remotos; ningún ref local se perdió (comparar `git for-each-ref refs/heads` contra lo esperado del trabajo de Wave 5).
- Borrar el backup sólo después de confirmar todo: `rm .git/packed-refs.bak.*`.

## Rollback
Si algo sale mal: `cp .git/packed-refs.bak.<ts> .git/packed-refs` y reintentar / escalar.

## Lo que NO hacer
- **No** re-clonar como "fix" — Wave 5 tiene trabajo sin commitear en el árbol; un clone lo perdería.
- **No** editar a mano otras líneas de `packed-refs` (los SHAs de las ramas locales/remotas son correctos).
- **No** correr esto en paralelo con un comando git de CC (riesgo de carrera sobre `packed-refs`).
