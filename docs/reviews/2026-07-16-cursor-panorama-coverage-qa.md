# QA — Panorama cobertura puntual (Cursor)

**Fecha:** 2026-07-16  
**Entorno:** `http://localhost:3001` · `admin@dim.test`, `govt-local@dim.test` (y evidencia previa `govt@`)  
**Branch / HEAD:** `integration/all-20260703` @ `def94e82`  
**Brief:** pasada puntual post-`2026-07-16-cursor-panorama-surface-qa.md` (drawer / export / govt-local / mapas vacíos)  
**Método:** browser click-through; sin mutaciones de datos.

## Veredicto

Hover + popup pin funcionan; el **drawer de departamento está roto** (nombre "—", sin sparkline/historial). Exports CSV/Informe OK; PNG/Copiar vista disparan el path de código pero el feedback en automation es débil. **govt-local cae en Palermo** bien. Los “mapas vacíos” de la pasada anterior **no son proyección rota** (salvo honestidad de badge en brotes).

---

## 1. Drawer + hover

### PASS · Hover popup
- **Esperaba:** valor de la unidad al pasar el mouse.
- **Vi:** hover Córdoba nacional → `Córdoba · 74,7 · Cobertura antirrábica`; click departamento → popup pinneado `Tercero Arriba · 47% · meta 80% · Ver detalle →`.

### ALTO · Drawer departamento (cobertura @ Córdoba)
- **Esperaba:** nombre de unidad + sparkline + eventos recientes + link usable.
- **Vi:** drawer abre (`DETALLE DE CAPA · Cobertura antirrábica`); **Departamento/partido = "—"**; **Perros vacunados = 47**; link `Ver analítica → · abre en portal Gobierno ↗`. **Sin** sección “Historia de la unidad” / sparkline / eventos.
- **Causa (código):** `SituationalMap` al clickear `pano-div-fill-*` arma `properties` con `locality`/`departmentName`/`value` pero **sin `province`**. `DetailDrawer` lee `province`/`locality` para el nombre; `shouldFetchHistory` exige `province` string → no fetch.

### ALTO · Capa `esterilizacion` sin cuerpo de drawer
- **Esperaba:** mismas 4 capas drillables (sintomas/esterilizacion/microchip/ppp) con datos.
- **Vi (código):** `FeatureBody` switch tiene `cobertura|mortalidad|microchip|ppp` y `sintomas`, pero **no `esterilizacion`** → cae en `"Sin detalle para esta capa."`. microchip/ppp compartirían el bug de props de división.

### MEDIO · Click provincia nacional = drill, no drawer
- Click en provincia a nivel nacional **drilla** el alcance (Córdoba) en vez de abrir drawer. Drawer solo vía `Ver detalle →` en el popup pinneado (a nivel división). Esperable según código; el brief habla de “click en unidad” — el path real es **click → pin → Ver detalle**.

### PASS parcial · Link del drawer
- Href `/gob/analytics` con sufijo honesto de cruce de portal. No se click-through completo (evitar salir del panorama mid-pass).

---

## 2. Exportar

### PASS · CSV
- Click `Descargar CSV` → link `download="panorama-mapa.csv"` + blob URL.
- Misma fuente que Registros (`mapTableRows`): celdas k-anon = **"Protegido (k<5)"** (visto en tabla Córdoba: “2 de Abril”; builder en `PanoramaConsole.tsx`).
- Columnas alineadas con Registros (UNIDAD + capa conteo/%).

### PASS · Informe de situación
- Genera DOM imprimible: `Informe de situación · Córdoba`.
- KPIs coinciden con chips: **74,7% / 43,6% / 57,3%**.
- Nota k-anon: “108 unidades protegidas…”.

### PASS (código + click) · PNG
- Click `Exportar PNG` dispara `exportPng` → `panorama-mimar.png` con pie de método (`buildExportFooter`). Sin verificación visual del archivo descargado en esta sesión (download del browser automation).

### MEDIO · Copiar vista
- Click no mostró “· copiada” (clipboard puede fallar en automation).
- Contrato: copia `window.location.href` (incluye preset/layers/period/province/z/lat/lng/level). URL actual ya era compartible.

### PASS · Menú Exportar
- Copiar vista / Vistas guardadas / CSV / PNG / Informe presentes con copy honesto.

---

## 3. govt-local (solo Palermo)

### PASS · Default Palermo
- Footer/copy: `Palermo, CABA`; chip topbar `GOB · PALERMO, CABA`; alcance `CABA · Palermo`; `Registros 1`; KPIs 62,1% / 38,3% / 82,1%; mapa zoom barrio con Palermo destacado.

### MEDIO · Título sigue “Centro de Situación Nacional”
- Mismo patrón de copy nacional con alcance local (ya visto en govt@).

### MEDIO · Localidad UI “Todas” disabled con 50 opciones en el combo
- Alcance real es Palermo; el switcher dice “Todas” disabled — confunde.

### PASS con matiz · OOS `?province=AR-X`
- Rebota a `province=AR-C` (no queda en Córdoba) — **PASS** de denegación.
- **ALTO matiz:** tras el rebote el alcance queda **CABA completa** (`Alcance CABA`, footer “CABA”), no Palermo; aparece `← Volver a Nacional`. El operador local pierde el scope de barrio.

---

## 4. Mapas “vacíos” — veredicto

| Caso | Conclusión | Evidencia |
|---|---|---|
| **Índice territorial** (admin, nacional) | **Supresión/UX, no proyección rota** | Choropleth pinta provincias (leyenda 53–72; paint match con scores por `AR-*`). Registros llega a 1.487 tras load. KPI vacío (“Ningún indicador corresponde…”) = gap de mapeo KPI↔capa, no mapa blanco. |
| **Brotes activos @ CABA** | **Desacople badge↔tabla, no mapa vacío** | Mapa coloreado (cobertura 5–205); hatch k-anon visible. Badge **Registros 0** porque el total de capas *count* (zoonosis) es 0 (+3 protegidas). Al expandir: **51 filas** de cobertura + copy “0 eventos… (+3 protegidas)”. |
| **Esterilización / control poblacional como govt@ (3 provincias)** | **Sparse honest + copy mentiroso** (pasada anterior) | Registros 3; mapa casi blanco con CABA en inset; Santa Cruz a veces sombreada. No es “0 features rotos” — es alcance multi-provincia con poca pintura + footer “Argentina (todas…)”. |

---

## Hallazgos (formato brief)

1. **ALTO** · Drawer departamento · Esperaba nombre + historial/sparkline · Vi "—" y solo conteo 47; historial no monta (falta `province` en props del click).
2. **ALTO** · Drawer `esterilizacion` · Esperaba detalle · Vi (código) default “Sin detalle para esta capa”.
3. **ALTO** · govt-local OOS · Esperaba rebote a Palermo · Vi rebote a CABA provincia + “Volver a Nacional”.
4. **MEDIO** · Brotes@CABA badge · Esperaba Registros coherente con mapa · Vi badge 0 con 51 filas de cobertura debajo.
5. **MEDIO** · Título “Nacional” en govt-local / govt · copy vs alcance.
6. **MEDIO** · Copiar vista · sin confirmación “copiada” en automation (clipboard).
7. **IDEA** · Drawer: mapear `departmentName` → label y siempre pasar `province` desde el scope efectivo.

---

## Checklist brief

| # | Resultado |
|---|---|
| 1 Drawer E2E | **FAIL** (abre pero incompleto) |
| 1 Hover | **PASS** |
| 1 Links drawer | **PASS parcial** (href + portal suffix) |
| 2 CSV | **PASS** |
| 2 PNG | **PASS** (click + código pie) |
| 2 Informe | **PASS** (KPIs = chips) |
| 2 Copiar vista | **PASS débil** (URL contract; sin “copiada”) |
| 3 govt-local default | **PASS** |
| 3 OOS | **PASS denegación / FAIL restore Palermo** |
| 4 Mapas vacíos | Índice OK · Brotes badge misleading · govt sparse |
