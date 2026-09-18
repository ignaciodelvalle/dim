# Prompt para el loop "Rumbo al piloto"

> **Cómo se usa.** Abrís Claude Code en la raíz del repo, con el modelo que
> elijas para implementar, y pegás el bloque de abajo tal cual, empezando por
> `/loop`. El `/loop` sin intervalo hace que la sesión se marque el ritmo sola:
> trabaja, decide cuándo volver, y sigue hasta cerrar la tanda o toparse con algo
> que necesite tu mano.
>
> Escrito 2026-09-18. El plan lo armó otro modelo; este prompt es para el que lo
> ejecuta. Si el contrato y el código no coinciden, gana el código y la sesión lo
> dice en su reporte.

---

/loop Sos el responsable de ejecutar el plan **"Rumbo al piloto"** de miMAR: dejar el producto lo más cerca posible de un piloto municipal, de nuestro lado. Trabajás sola/o, un cambio chico por iteración, y no frenás hasta cerrar la tanda en curso o toparte con algo que sea del PO.

## Lo primero, y no sigas sin hacerlo

Leé **`docs/handoff/rumbo-al-piloto.md`** entero antes de tocar una línea. Es tu contrato: las decisiones ya tomadas (sección 1, con fecha y con el default que aplicás), las ocho compuertas que definen "listo" (sección 2), las cinco tandas con cada ítem, su archivo y su criterio de terminado (sección 3), cómo corre una iteración (sección 5), cuándo parás (sección 6), qué es del PO y no intentás (sección 7) y cómo reportás (sección 8).

Después leé **`/CLAUDE.md`** del repo (la Definición de Terminado y las cuatro firmas de rojo) y el índice de memoria de la máquina, `~/.claude/projects/C--dev-dim/memory/MEMORY.md`, que lista las trampas que este repo ya pagó. No arranques la primera compuerta sin haberlo leído.

**No hay decisiones abiertas.** Si encontrás una que te parece abierta, el contrato ya la cerró y no la viste; volvé a buscarla. Si genuinamente falta, aplicá un default razonado, anotalo en el reporte bajo "decidí sin el PO", y seguí. Nunca preguntes en medio del loop.

## Cómo trabajás

1. **Estado**: el topic de engram `pilot/plan-2026-09-18/state` (proyecto `dim`). En la primera iteración lo creás desde la sección 3 del contrato, una fila por ítem. Tomás el siguiente `todo` de la tanda en curso.
2. **Implementás** el ítem. Lo XS vos; lo S/M con un solo escritor subagente y `model` explícito (mecánico → `sonnet`; autorización, PII, RLS, espina de eventos, migraciones → el más fuerte que tengas).
3. **Preflight** completo (sección 5.3 del contrato): Node 22.23.2 en el PATH, biome, typecheck de web y móvil, las dos rejas de UI, TODAS las `lint:*` en una pasada, la cadena de facts si entró un test, `seed:panorama` si la suite anterior tocó panorama. Diez minutos que ahorran corridas de treinta y cinco.
4. **Compuerta**: `pnpm verify` y después `pnpm test:verified`, en un runner desprendido, con el árbol congelado, y pegás el renglón del veredicto textual:
   `reported N file(s); N discovered; 0 failing test(s); 0 broken file(s)`
   Cualquier archivo faltante, test fallando o archivo roto es rojo. Leés el rojo por su firma (sección 5.5), no tirás el dado de nuevo.
5. **Revisión adversarial de contexto fresco** antes de cada push; `security-reviewer` si tocaste autorización, PII, RLS o la espina. Lo que encuentra entra como su propio commit `fix(...)`.
6. **Commit y push a `main`** por unidad de trabajo, conventional commits en castellano explicando por qué, **sin ninguna atribución de IA**. Staging se redespliega solo; anotás el SHA.
7. **Tachás la fila** que cerraste en la cola que la tenía, en el mismo commit. Al cerrar una tanda actualizás la página del PO (https://claude.ai/artifact/6LMQn7Zi2j4MyX5cK2J2KG, por `url`) con los veredictos, y guardás el resumen de sesión en engram.
8. **Programás el siguiente despertar** y seguís.

## Las reglas que te van a morder si no las sabés

- **El Node.** El repo fija 22.23.2 y el shell resuelve 24. Un verde en Node 24 no es verde.
- **`pnpm test` miente.** Es `pnpm test:verified`, siempre, y el veredicto es la línea, no el código de salida.
- **No edites nada mientras corre la compuerta**, ni un doc. Varias rejas escanean el árbol entero.
- **Migraciones**: se escriben, se prueban en local, y se aplican a la base de ensayo con `db:doctor` antes y después, preguntándole a la base y no al ledger. No existe producción.
- **El repo es público.** Ningún secreto entra al árbol, a un commit ni al chat.
- **Una fila cerrada sin tachar es la falla que este plan existe para evitar.** Tachá en el mismo commit.

## Cuándo parás

Parás y escribís el reporte (sección 8 del contrato) cuando:

- terminaste la tanda y la siguiente es sólo la mitad del PO de la Tanda 5;
- lo que sigue es irreversible y hacia afuera y no está preaprobado (secretos, DNS, facturación, borrar datos, un texto legal público);
- un rojo se reproduce con el árbol congelado, cae dentro de tu propio cambio, y dos intentos honestos no lo explicaron;
- el PO escribió algo que cambia la sección 1.

Si el PO te comenta algo que vio probando, lo anotás como fila nueva con su tanda y seguís con lo tuyo; sólo interrumpe una pérdida de datos de usuarios o una fuga en curso.

Arrancá ahora leyendo el contrato, y después la Tanda 0.
