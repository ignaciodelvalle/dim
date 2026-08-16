# Nota de diseño — ventanas personalizadas superpuestas vs. k-anonimato (L-8)

**Fecha**: 2026-08-16 · **Estado**: NOTA DE DISEÑO — sin implementación, para discusión.
**Origen**: hallazgo L-8 (loop de pulido, 2026-08-10), `docs/plans/PENDIENTES.md`; ítem C-c del plan de gobernanza 2026-08-15.
**Severidad, con honestidad**: requiere un actor YA autorizado sobre la jurisdicción en
cuestión (admin nacional o funcionario de esa jurisdicción). No es una fuga pública ni
anónima — es un actor con acceso legítimo pudiendo, con varias consultas propias,
reconstruir un número que el sistema decidió no mostrarle en una sola consulta. Es un
hueco de disciplina interna (defensa en profundidad), no una brecha externa.

## El mecanismo del ataque

`suppressSmallCells` decide por CELDA, por REQUEST: si `count < k` (k=5), la celda se
oculta. No hay memoria entre requests. Un actor autorizado que pida:

- Ventana A: ene–dic (12 meses) → un número agregado, visible (≥5)
- Ventana B: jul–dic (6 meses) → un número agregado, visible (≥5)

puede restar B de A y obtener ene–jun — un número que el sistema JAMÁS mostró
directamente porque, aislado, era `< 5`. La suma es visible; el residuo no lo es; la
resta lo revela igual. Es el mismo ataque de diferenciación que `suppressDelta` ya
resuelve para el ÚNICO caso que lo consume (tendencia, dos ventanas fijas
consecutivas) — pero `period=custom` acepta CUALQUIER rango arbitrario, así que el
espacio de pares de ventanas que un actor puede construir es efectivamente ilimitado.

## Dónde vive la maquinaria hoy

- `lib/metrics/anonymity.ts` — `suppressSmallCells` (celda única), `complementarySuppress`
  (supresión secundaria contra un total publicado), `suppressDelta`/`deltaCells`
  (regla de diferenciación de DOS ventanas, un solo consumidor: la capa `tendencia`
  vía `provinceCellPreDecided` en `build-features.ts`).
- Toda la maquinaria es PURA y SIN ESTADO: recibe dos ventanas dadas y devuelve un
  veredicto para ESE par. No hay registro de qué vio un actor en un request anterior.
- `period=custom` (`ViewPeriod` en `view-state.ts`) es un rango libre, resuelto por
  request (`resolveAnalyticsPeriod`), sin memoria entre resoluciones.

## Superficies expuestas

Solo dos rutas renderizan Panorama, ambas detrás de guardas de rol:
- `/admin/panorama` — admin nacional (ve todas las jurisdicciones).
- `/gob/panorama` — funcionario, acotado a su propia jurisdicción.
No hay superficie pública. El actor que podría explotar esto YA tiene acceso legítimo
a esos números agregados — el hueco es que puede llegar al residuo protegido
combinando consultas, no que pueda ver algo fuera de su mandato.

## Qué significaría "memoria de supresión", en concreto

No es "recordar toda consulta para siempre" — es acotar el espacio de RESIDUOS
reconstruibles. Tres formas concretas de expresarlo:

1. **Memoria por sesión/actor**: registrar, por (actor, jurisdicción, dimensión),
   las ventanas YA consultadas esta sesión. Antes de servir una nueva ventana
   custom, calcular si {ventanas ya vistas} ∪ {nueva ventana} permite derivar por
   resta/suma un residuo cuya celda subyacente sea `< k`. Si sí, servir esa celda
   igual de suprimida que si hubiera sido pedida directa.
2. **Cuantización de ventanas**: en vez de aceptar cualquier `{from, to}` arbitrario,
   redondear `period=custom` a un grid fijo (p.ej. límites de mes calendario). Esto
   no elimina el ataque pero reduce drásticamente el espacio de pares reconstruibles
   — de "cualquier día" a "cualquier combinación de meses completos", que es mucho
   más fácil de auditar/loggear después.
3. **Auditoría + límite de tasa, no bloqueo silencioso**: en vez de prevenir la
   reconstrucción matemáticamente (caro, con falsos positivos), LOGUEAR cada consulta
   `period=custom` con su rango exacto (actor, jurisdicción, ventana) — igual que
   Lote B3 ya hizo para vistas de detalle con PII — y dejar que el mismo mecanismo de
   auditoría que gobierna el resto del sistema haga su trabajo: un actor autorizado
   que reconstruye sistemáticamente residuos protegidos deja rastro, revisable
   después, en vez de invisible para siempre.

## Candidatas, con costo/beneficio

| # | Diseño | Gana | Cuesta |
|---|---|---|---|
| **1** | Memoria de supresión por sesión (estado con TTL de sesión) | Cierra el hueco matemáticamente, en el momento | Estado nuevo que mantener; una sesión larga acumula ventanas → el chequeo combinatorio crece; requiere definir qué es "misma dimensión" para agrupar ventanas comparables |
| **2** | Cuantización de `period=custom` a límites de mes/trimestre | Reduce drásticamente el espacio de ataque con un diff chico (redondear el input antes de resolver el período); sin estado nuevo | No lo elimina — un actor paciente igual puede combinar meses; cambia UX (ya no se puede pedir "del 15 al 20") |
| **3** | Solo auditoría (loguear cada custom-period query, sin bloquear nada) | Diff mínimo, reutiliza el patrón ya validado de Lote B3; deja "¿esto es abuso?" a un humano con contexto, no a una heurística | No previene nada en el momento — es detectivo, no preventivo; requiere que alguien revise los logs |

**Recomendación tentativa, no decisión**: empezar por **#3** (auditoría) porque reutiliza
maquinaria ya construida y aprobada (Lote B3), no bloquea a un operador legítimo
haciendo su trabajo, y da visibilidad real sobre si esto se explota en la práctica antes
de invertir en #1 o #2. Si la auditoría muestra un patrón de abuso real, escalar a #2
(cuantización, diff chico) antes que a #1 (memoria con estado, el más caro).

## Lo que esta nota NO decide

Cuál de las tres implementar, ni el umbral de "cuántas ventanas combinadas dispara
una alerta". Eso es del PO.
