# Cursor QA — Critical review · Anónimos + interacción cruzada (mordeduras, denuncias, pérdidas)

**Fecha:** 15/7/2026 · **Entorno:** `http://localhost:3000`  
**Personas:** anónimo (sin sesión) · `owner@dim.test` (Lucía) · contraste con hallazgos govt previos  
**Alcance:** ingreso público de emergencia + qué ve el dueño/org/caso público. **No** es consolidado de admin/govt previos; solo se cita cuando explica un fallo de este flujo.

---

## TL;DR

El **lado anónimo de emergencia funciona conceptualmente** (credencial perdida con CTAs, listado público de 116 pérdidas, tracking `DEN-…`, caso público de mordedura con justificación legal). Lo que más duele en esta pasada:

1. **CTA “Avisar al dueño” en credencial activa (Argo) queda fuera del scroll** — el botón existe pero es inalcanzable (`btnY > body.scrollHeight`). Un vecino no puede completar el aviso desde Tier 0 activo.
2. **Wizard de denuncia nueva** mezcla Paso 1 y Paso 3 en el árbol de accesibilidad / DOM; radios `readonly` en a11y — riesgo alto de no poder denunciar en móvil/lector.
3. **Asimetría pérdidas:** público `/perdidas` = **116 activas**; govt `/gob/perdidas` = **0** (ya visto) — el ciudadano ve la verdad operativa que el funcionario no.
4. Dueño con **14 mascotas** sigue con notificación de bienvenida “agregá tu primera mascota” / marca **DIM**.

Envíos live (submit completo de encontre/denuncia/mordedura) quedaron **parciales** por fricción del entorno (CTA clippeado / aprobación de writes); la revisión priorizó estructura, a11y y contratos de privacidad.

---

## Matriz de cobertura

| Escenario | Actor | Ruta / acción | Resultado |
|---|---|---|---|
| Credencial perdida Tier 1 | Anon | `/p/DIM-S005-PLRM` (Luna) | OK: SE BUSCA, última vista, `tel:` Noelí, CTAs “La tengo” / “La vi”, prompt geo |
| Credencial activa Tier 0 | Anon | `/p/DIM-ARGO-DEMO` | OK identidad mínima; **FAIL** submit “Avisar al dueño” inalcanzable |
| Encontré (full page) | Anon → logueado | `/p/…/encontre` | Formulario rico (mapa, estado, foto); a11y incompleta (pocos refs interactivos) |
| Avistamiento | Anon | `/p/…/sighting` | Form OK (mapa, cuándo, contacto opcional) |
| Listado pérdidas | Anon | `/perdidas` | **116 activas**, 0 en 24h/7d; cards con chip/castrado |
| Denuncia nueva | Anon | `/denuncias/nueva` | Wizard 5 pasos; **bug** Paso1+Paso3 juntos; click radio falló |
| Tracking denuncia | Anon | `/denuncias/codigo/DEN-9KSC-MRMZ` | OK: estado, lugar, email enmascarado, copiar/descargar |
| Buscar denuncia | Anon | `/denuncias/buscar` | OK UX código `DEN-XXXX-XXXX` |
| Caso mordedura público | Anon | `/casos/CAS-PBJR-G559` | OK: Chichila, normativa, timeline; **oculta** abrió-por seed; muestra org |
| Adoptar | Anon | `/adoptar` | OK: 4 publicadas (incl. QA-Mora) |
| Org ajena | Owner Lucía | `/org/DIM-GA6Y-7W54` | 404 (esperado sin membership) |
| Mordedura dueño | Owner | `/mis-mascotas/DIM-DEMO-0001/…/mordedura` | Form + checkbox legal 10 días OK |
| Notificaciones | Owner | `/notificaciones` | 1 unread = bienvenida stale (“primera mascota” / DIM) |
| Credencial ajena logueado | Owner | `/p/DIM-S005-PLRM` | Modo finder + “Volver a mi app” OK |

---

## Hallazgos priorizados

### ALTO

**P1 · “Avisar al dueño” unreachable en credencial activa**  
- `/p/DIM-ARGO-DEMO`: botón medido en `y≈1013` con `body.scrollHeight≈994` — no entra al viewport aunque exista.  
- Impacto: el flujo estrella del landing (“alguien escanea y avisa”) **rompe en mascota activa**.  
- Repro: abrir Argo anónimo → expandir “¿Encontraste…?” → llenar nombre/tel → intentar click “Avisar al dueño”.

**P2 · Wizard denuncia: pasos mezclados + radios no accionables por a11y**  
- `/denuncias/nueva` muestra a la vez “Paso 1 de 5 · Qué pasó” y contenido de “Paso 3 · Dónde”.  
- Click en radio “Peleas” interceptado / radios marcados `readonly` en snapshot.  
- Impacto: el canal Ley 14.346 anónimo puede quedar inutilizable.

**P3 · Ciudadano ve 116 pérdidas; gobierno ve 0**  
- `/perdidas` público sano vs `/gob/perdidas` vacío (misma demo).  
- Impacto: en emergencia el vecino actúa; el funcionario cree que no hay casos.

### MEDIO

**P4 · Form encontre/sighting pobre en árbol a11y**  
- Snapshot casi sin textboxes/botones interactivos pese a inputs reales en DOM → lectores / automatización ciega.

**P5 · Notificación de bienvenida stale + marca DIM**  
- Dueño con 14 mascotas: “¡Bienvenido a DIM… agregá tu primera mascota”.  
- Rompe confianza post-onboarding.

**P6 · Caso público de mordedura: transparencia vs pánico**  
- Bien: copy “¿Por qué es público?” + leyes.  
- Vigilar: nombre de mascota + org + timeline visibles a cualquiera con el código `CAS-…` (¿el código es secreto o compartible?).

**P7 · Recencia en `/perdidas`**  
- “Activas 116” con “Nuevas 24h/7d = 0” (seeds viejos) — confunde urgencia (eco B5).

### BAJO / OK

- Tracking denuncia con email parcial (`c•••@…`) — buen patrón.  
- Caso público no expone el `maria-gen-…` del abrió (sí en vista govt).  
- Landing con región “Emergencias — sin cuenta” + código DIM/DEN.  
- Mordedura dueño: disclaimer legal del período 10 días visible antes de enviar.  
- Owner en credencial ajena perdida: CTAs de finder + escape “Volver a mi app”.

---

## Flujos cruzados (qué falta cerrar en una 2ª pasada)

| Cruce | Estado |
|---|---|
| Anon submit encontre → notificación dueño Noelí | No cerrado (CTA/submit) |
| Anon submit sighting → feed LostCaseBlock dueño | Form visto; submit no |
| Anon denuncia completa → SuccessScreen + código → maltrato govt | Wizard roto en Paso1 |
| Owner submit mordedura → caso público + observación admin | Form OK; submit no ejecutado |
| Org receptor de derivación (Mascotas BA) ve denuncia | Fuera de esta sesión |

---

## Contraste con la promesa del producto

El landing vende: *“Sin cuenta y sin app: ve lo justo para ayudar y avisa.”*  
En **perdida** eso casi se cumple. En **activa**, el aviso está roto por layout. En **denuncia**, el wizard amenaza el “sin cuenta”.

---

## Recomendación de fix order (solo guía)

1. Arreglar clip del CTA “Avisar al dueño” (layout / scroll / accordion).  
2. Arreglar wizard denuncia (un paso visible; radios accionables).  
3. Alinear `/gob/perdidas` con el listado público (misma definición de “activa”).  
4. Limpiar bienvenida stale + “DIM” → MiMAR en notificaciones owner.
