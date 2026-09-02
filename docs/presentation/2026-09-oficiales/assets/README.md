# Assets — piezas gráficas de la presentación

> Snapshot: `c10f4ff03` (`main`) · Facts: `docs/architecture/facts.json` generated 2026-09-02
> Verified against code on 2026-09-02 by writer E (opus subagent) · Status: reviewed
> Numbers in this file are `<!-- fact:key -->` markers checked by `__tests__/architecture-facts.test.ts`.

Acá deja Cowork lo que dibuja a partir de los doce specs del pack: los diagramas en SVG y en PNG, las reducciones ejecutivas, el juego de íconos de los cinco actores y el afiche "mapa del sistema".

Convención de nombres: `D01..D12-<slug>.{svg,png}` — número de dos dígitos, guion, resumen corto en minúsculas, extensión. Cada diagrama va en `1920x1080` y en 4:3 (`2048x1536`).

Las reducciones ejecutivas llevan el sufijo `-exec`; el afiche es `D00-mapa-del-sistema`.

Cowork no commitea nada: deja los archivos, y Claude Code los revisa contra el spec —conjunto de nodos, semántica de color, etiquetas del glosario— y recién ahí los commitea.

Un archivo que esté acá y no corresponda a ningún spec de `docs/presentation/2026-09-oficiales` se borra: la carpeta no es un depósito.
