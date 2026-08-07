# QA — Panorama mapa de superficie (Cursor)

**Fecha:** 2026-07-16  
**Entorno:** `http://localhost:3001` · cuentas `admin@dim.test` + `govt@dim.test`  
**Branch / HEAD:** `integration/all-20260703` @ `def94e82` (mismo HEAD que el informe admin-polish del mismo día)  
**Brief:** `docs/reviews/panorama-surface-map-2026-07-16.md`  
**Método:** recorrido browser; sin mutaciones de datos. No se ejercitó `govt-local@dim.test`.

## Veredicto

La consola funciona como producto: **17 capas**, auto-desagg por zoom, drill CABA, cambio de vista sin perder cámara, k-anon visible, contraste admin/govt en el botón de alcance, y rebote OOS. Lo que más rompe confianza es la **honestidad rótulo↔mapa↔KPI↔footer** (especialmente “Argentina / todas las provincias” cuando el alcance no lo es, y leyenda de conteos en capas %).

---

## Hallazgos

### ALTO · Admin + Govt · Footer / título dicen “Nacional / todas las provincias” con alcance acotado
- **Esperaba:** copy de alcance alineado con chip de jurisdicción y con lo que el mapa está pintando.
- **Vi (admin, zoom locality / post-drill):** footer tipo “Argentina (todas las provincias)” mientras el mapa y Registros están a nivel departamento/localidad; KPIs a veces siguen nacionales.
- **Vi (govt):** chip `Alcance Tierra del Fuego, Santa Cruz, CABA` + KPIs scoped, pero título **“Centro de Situación Nacional”** y footer **“Argentina (todas las provincias)”**. Dropdown de provincia sí está bien limitado (solo AR-V / AR-Z / AR-C).

### ALTO · Admin · Zoom a locality en capa % · leyenda de conteos vs copy de meta %
- **Esperaba:** misma unidad (% o conteo) en mapa, leyenda, dock y prosa.
- **Vi (Cumplimiento / cobertura, zoom AMBA ~z=6.5):** `level=locality` aparece solo (cámara estable — bien); dock admite “conteo por unidad; % solo provincia”; leyenda pasa a **conteos (p. ej. 5–736)**; el copy del mapa sigue hablando de **cobertura % / Meta 80%**. El operador cree estar mirando un % cuando el relleno es un conteo.

### ALTO · Admin · KPIs nacionales con mapa local (mismo momento de zoom)
- **Esperaba:** chips y mapa contando la misma geografía.
- **Vi:** tras auto-desagg a locality, KPIs siguen en marco nacional mientras choropleth/registros son locales. Misma familia de incoherencia que el footer.

### ALTO · Admin · Abrir “Línea de tiempo” puede resetear la cámara a nacional
- **Esperaba:** abrir el dock no mueve el mapa.
- **Vi:** al menos una vez, abrir Línea de tiempo llevó la cámara a ~`z=3.5` nacional. En un drill CABA posterior **no** se reprodujo. Intermitente / estado-dependiente — suficiente para marcar ALTO porque el brief exige “el zoom nunca mueva la cámara sola”.

### MEDIO · Admin · Índice territorial · KPI vacío / mapa poco legible
- **Esperaba:** choropleth provincia + KPI con lectura útil (o empty-state claro).
- **Vi:** al zoom, `level` no baja (correcto: solo provincia); KPI: vacío tipo “Ningún indicador corresponde…”; mapa nacional se vio casi blanco / muy pobre en una captura. Capas nuevas (acceso-veterinario, antiparasitario, índice, clínicas) **sí están** en Capas.

### MEDIO · Admin · Brotes activos @ CABA · Registros 0 vs KPIs con señal
- **Esperaba:** tabla Registros coherente con chips / mapa.
- **Vi:** vista brotes en CABA con KPIs de señal, pero dock Registros en 0. Duda si es vacío real, filtro, o desacople de proyección.

### MEDIO · Govt · Choropleth multi-provincia casi vacío
- **Esperaba:** las 3 provincias del alcance coloreadas (o residual honesto).
- **Vi (Control poblacional / esterilización):** mapa principal casi blanco; CABA vive en inset; Santa Cruz a veces sombreada. Con `Registros 3` el dato existe, pero el mapa no comunica el alcance.

### MEDIO · Admin · “Volver a Nacional” deja señales cruzadas
- **Esperaba:** un solo alcance coherente tras volver.
- **Vi:** conviven “Alcance Nacional” con restos de CABA (panel / KPIs / copy de burbujas) un rato. Mismo síntoma reportado en admin-polish QA.

### BAJO · Thin / no ejercitado en esta pasada
- Hover popup y **drawer** por click en unidad: no cerrados end-to-end.
- Export: menú verificado (Copiar vista / Vistas guardadas / CSV / PNG / Informe); **descargas PNG/informe no click-through**.
- `govt-local@dim.test` (solo Palermo): no corrido.
- Toast OOS: redirect a `?notice=fuera-de-alcance` observado; mensaje canónico en `NoticeToast` = “No tenés acceso a esta jurisdicción”. Toast sonner no capturado en a11y (efímero).

---

## PASSes (contraste + mecánicas)

| Check | Resultado |
|---|---|
| Auto-desagg por zoom (admin) | PASS — locality aparece; cámara no se mueve sola en el zoom |
| Badge Provincias / Departamentos | PASS (cuando el nivel es honesto) |
| Cambio de vista preserva zoom/scope | PASS (p. ej. → control-poblacional mismo z/lat/lng) |
| 17 capas en Capas (admin y govt) | PASS — incl. acceso-veterinario, antiparasitario, índice territorial, clínicas |
| Drill CABA + inset | PASS |
| Admin botón alcance | PASS — **“Vista nacional”** (no “Volver a mi jurisdicción”) |
| Govt botón alcance | PASS — **“Volver a mi jurisdicción”** |
| Govt chip 3 jurisdicciones | PASS — Ushuaia / El Calafate / Palermo |
| OOS `?province=AR-X` | PASS — rebota; URL pasa por `notice=fuera-de-alcance` |
| Dropdown provincia govt | PASS — solo las 3 provincias del scope |
| Bitemporal en Línea de tiempo | PASS — “Cuándo ocurrió” / “Según lo conocido al momento”; `basis` **no** en URL |
| k-anon | PASS — “Protegido (k<5)” en registros + leyenda `k<5 protegido` |
| KPIs con base temporal etiquetada | PASS parcial — chips dicen “estado actual” / “período”; falla cuando geografía del chip ≠ mapa |

---

## Checklist del brief (rápido)

1. Desagregación automática por zoom — **PASS** (con ALTO de honestidad %/conteo/KPI).
2. Drill por click provincia / CABA — **PASS**.
3. Hover popup — **no ejercitado**.
4. Click unidad → drawer — **no ejercitado**.
5. k-anon rayado vs sin datos — **PASS** (leyenda + registros).
6. KPIs base temporal — **PASS rótulo**; **FAIL alineación geo**.
7. Cambio de vista sin sacar zoom — **PASS**.
8. Contraste govt vs admin — **PASS mecánico**; **FAIL copy “Nacional/todas”** en govt.
9. Privacidad denuncias / points — no se intentó romper; denuncias copy en Capas menciona centroide (bien).

---

## Prioridad sugerida de fix

1. Unificar strings de alcance (título, footer, chip, KPIs) a la geografía real de la proyección.
2. En desagg locality de capas %, o pintar % honestos, o dejar de decir “Meta X%” / “cobertura” en copy/leyenda cuando el fill es conteo.
3. No resetear cámara al abrir Línea de tiempo (repro intermitente).
4. Índice territorial + brotes@CABA Registros=0: revisar empty vs proyección rota.
