# QA Cowork — VERIFICACIÓN DE CIERRE — los remates + los features nuevos

**URL:** https://dim-staging-el6eq8nyg-ignacio-dim.vercel.app
**Cuentas (todas `Test1234!`):** owner@ · owner2@ · govt@ (CABA ciudad-entera) · govt-local@ (una localidad) · admin@ · orgadmin@ (Refugio Test) · alejo@ (4 orgs) · lilian@ (vet, Clínica Recoleta) · noeli@ (foster)
**Método:** click-through real, sin atajos de API.

> **Esto NO es otra corrida histórica.** Es verificación DIRIGIDA: confirmar que los 6 blockers del histórico ahora CIERRAN, y que los 4 features nuevos funcionan. Si algo de esto falla, es regresión de un fix de HOY — reportá el token/código exacto.

---

## BLOQUE 1 — Los 3 remates legales del Bloque F (antes ROTOS, hoy deberían cerrar)

1. **Rabia POSITIVA escala** (antes: no-op silencioso). Como una org/clínica: registrá una mordedura → se abre la observación de 10 días → en `/admin/observaciones/[token]` cerrala con outcome **"POSITIVO — rabia confirmada"**. DEBE: registrar el cierre (sin no-op silencioso) + **notificar a la autoridad sanitaria** (verificá que aparece una notificación/outbox a la autoridad, no solo al dueño). Probá también cerrar una observación **sin bite_event_id** (una vieja) → debe cerrar con mensaje claro, sin zod crudo.
2. **Derechos ARCO (Ley 25.326)** (antes: "schema pii does not exist"). Como owner@: `/cuenta/privacidad` → **Descargar JSON** (debe bajar, sin error de Postgres) → probá el **borrado de cuenta** (con confirmación) → debe purgar de verdad. Ambos deben funcionar.
3. **Aprobar una matrícula** (antes: solicitud huérfana). Con una cuenta nueva: `/cuenta/upgrade` → cargá matrícula (localidad CABA) → enviá. Después como **admin@** andá a `/admin/cola`: la solicitud DEBE aparecer (antes el contador decía 1 pero la cola estaba vacía) → aprobala → el owner queda vet.

## BLOQUE 2 — Los 2 de refugio (antes ROTOS)

4. **Intake con microchip**: como orgadmin@, intake de una mascota CON número de chip → DEBE crear sin "Invalid payload for microchip_implanted" (zod crudo). El país del chip default **032 (Argentina)**, no 858.
5. **Aceptación org→org**: como alejo@, proponé una custodia de una org a otra, después **aceptá desde la org receptora** → DEBE aceptar (antes: "Estás operando desde una organización distinta").

## BLOQUE 3 — Privacidad del denunciante (tu decisión de hoy)

6. **Denuncia anónima logueado**: logueado como owner@, cargá una denuncia eligiendo **"Enviar anónima"** → DEBE caer en la pantalla de código DEN-XXXX (tracking anónimo), **NO** en /denuncias/mias, y NO debe quedar vinculada a tu cuenta. (Una denuncia CON identidad sí va a /denuncias/mias.)

## BLOQUE 4 — Los 4 features nuevos (verificar que se ven y funcionan)

7. **Procedencia de vacunas** (#78): en la ficha de un pet con vacuna **declarada por el dueño** (sin firma de vet) → debe mostrar el estado DUAL: verde "lo que tenés" + ámbar "para el registro oficial, un vet debe firmarla". En el panorama (`/gob/panorama`, capa antirrábica) → el toggle **"solo firmado por matrícula"** (Capas → Detalle, con cobertura activa) debe cambiar el número, y el KPI debe mostrar AMBOS (total + firmado).
8. **Denominadores dobles** (#79): en el panorama y /gob, la cobertura debe decir el doble denominador: "X% del padrón (N perros) · el padrón cubre Y% de la población canina estimada".
9. **Mordeduras en el mapa** (#75): al cargar la mordedura del Bloque 1, el form debe pedir **ubicación con el picker de mapa**. Después en `/gob/panorama` con zoom cercano (capa mordeduras) → debe aparecer el punto donde la cargaste (solo en TU jurisdicción como operador).
10. **Bitemporalidad** (#77): en el scrubber del panorama ("Reproducción temporal", siempre visible — ya no hay `<details>` "Reproducir en el tiempo"), el toggle **"Cuándo ocurrió / Según lo conocido al momento"** (modo Detalle del scrubber) debe estar y cambiar la animación. En un PDF MPF (cerrá un caso welfare y exportá) → debe tener la sección **"Cronología según conocimiento"**.

## Veredicto
Por bloque: ¿cierra o falla? Foco en los Bloques 1-3 (los remates) — si cerraron, el sistema pasó de "casi" a "sí, para un piloto". Los tokens/códigos que generes, anotalos.
