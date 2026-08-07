# Ronda 5 — "El funcionario curioso" · informe Cursor

**Fecha:** 2026-07-16  
**Entorno:** `http://localhost:3001` · cuenta `lucas@dim.test` (funcionario provincial, 5 localidades CABA)  
**Brief:** `docs/reviews/cowork-cursor-ronda5-funcionario-curioso.md`  
**Método:** QA exploratorio sin recorrido pautado; solo pantalla (sin código ni docs). Caso 0 contrastado también con omnibox admin en `:3000`.  
**Mutaciones:** ninguna (solo búsquedas en omnibox, auditadas en actividad reciente).

---

## 1. TL;DR

**Veredicto: condicional — sirve para monitorear CABA acotado, pero un funcionario real se queda colgado en los casos del día a día.**

El portal gobierno es legible, las jurisdicciones se descubren bien, Panorama y Programa explican métricas con denominador, y la protección de alcance parece sólida. Pero el omnibox no encuentra una mascota que existe en la credencial pública, dos ítems del menú llevan a 404, y comparar provincias desde adentro del portal no es posible para un gobierno acotado a barrios.

---

## 2. Hallazgos priorizados

### BLOQUEA

#### B1 — Omnibox no encuentra mascotas que sí existen (Caso 0)

| Campo | Detalle |
|---|---|
| **Pantalla** | Omnibox en `/gob` (Lucas) y `/admin` (admin universal, `:3000`) |
| **Esperaba** | Buscar `DIM-PAMP-0001` o `Pampa` y llegar al expediente |
| **Vi** | "Sin coincidencias" / "Sin coincidencias en tu jurisdicción" |
| **Pasos** | 1) Abrir `/p/DIM-PAMP-0001` sin login → credencial OK. 2) Login operador. 3) Omnibox → `DIM-PAMP-0001` y `Pampa` → vacío en ambos roles. |
| **Impacto** | Un vecino te llama con el QR; vos no podés cruzar esa credencial con nada del lado operador. |

#### B2 — Rutas del menú que no existen

| Campo | Detalle |
|---|---|
| **Pantalla** | `/gob/analitica`, `/gob/mi-actividad` |
| **Esperaba** | Las secciones "Analítica" y "Mi actividad" del nav lateral |
| **Vi** | 404 "No encontramos esta página" |
| **Pasos** | Click en "Analítica" desde nav, o navegar directo a esas URLs. |

---

### ALTO

#### A1 — Caso 2 (informe antirrábica entre provincias): imposible desde portal gobierno

| Campo | Detalle |
|---|---|
| **Pantalla** | `/gob/programa`, filtros de provincia en todo el portal |
| **Esperaba** | Comparar dos provincias |
| **Vi** | Dropdown Provincia solo tiene **CABA**. Lucas tiene 5 barrios, no provincias. |
| **Workaround parcial** | `/transparencia` tiene CSV/JSON por provincia (CC BY 4.0), pero es dato público agregado — no el tablero interno que pediría el jefe. |

#### A2 — Panorama: chip KPI vs panel lateral (posible contradicción semántica)

| Campo | Detalle |
|---|---|
| **Pantalla** | `/gob/panorama` · preset Cumplimiento antirrábico · 90 días |
| **Esperaba** | Un solo número de cobertura |
| **Vi** | Panel lateral **64,4%** · chip flotante **"11 205 ⊘ k<5 protegido"** · leyenda del mapa dice "conteo por unidad (no porcentaje)" pero el relleno parece porcentual |
| **Pasos** | Panorama → Vista Cumplimiento antirrábico → comparar chip, panel y leyenda del mapa. |

#### A3 — Mapa Panorama muestra comunas fuera de alcance; Registros solo 5 filas

| Campo | Detalle |
|---|---|
| **Pantalla** | `/gob/panorama` · tab Registros |
| **Esperaba** | Coherencia mapa ↔ tabla ↔ mis 5 barrios |
| **Vi** | Mapa colorea Belgrano, Caballito, etc. (fuera de mis 5). Tab Registros dice **"5 filas"** (solo Palermo, Recoleta, Retiro, Puerto Madero, San Nicolás). |
| **Riesgo** | Funcionario cree que ve todo CABA cuando la tabla operativa está acotada. |

#### A4 — Admin: 5 crons caídos visibles en demo (verificado en `:3000`)

| Campo | Detalle |
|---|---|
| **Pantalla** | `/admin` |
| **Vi** | Banner rojo: `expire_foster_proposals`, `expire_pet_transfers`, `post_adoption_checkin`, `process_eno_queue`, `vaccine_due` — todos FALLO. |
| **Nota** | Entorno demo; igual genera desconfianza operativa. |

---

### MEDIO

#### M1 — Credencial pública: vacunación ambigua para el vecino (Caso 0)

| Campo | Detalle |
|---|---|
| **Pantalla** | `/p/DIM-PAMP-0001` · 390px |
| **Vi** | Resumen médico "Vacunación: **1** · 2 faltantes" pero identidad dice "Vacunación: Con registros". Tier 2 médico habilitado permanentemente. Credencial **Activa** (no perdida). Formulario "¿Encontraste a esta mascota?" al final — hay que scrollear. |

**Guion telefónico al vecino:**

> *"Che, escaneaste bien — es **Pampa**, perra mestiza blanca de unos 4 años, credencial activa en MiMAR, con chip. No está marcada como perdida. La página no te da el teléfono del dueño por privacidad, pero abajo tenés un formulario **'¿Encontraste a esta mascota?'** — poné tu nombre, tu celular y dónde la encontraste, tocá **Avisar al dueño**, y el sistema le manda el aviso. Quedate con el perro en un lugar seguro mientras tanto."*

#### M2 — Vigilancia: cumplimiento observación 10d en 0% con 2 abiertas >10d

| Campo | Detalle |
|---|---|
| **Pantalla** | `/gob/vigilancia` · 30 días |
| **Vi** | "CUMPLIMIENTO OBSERVACIÓN 10D: **0%** · 2 abierta(s) > 10 días" — se entiende como alerta, pero un funcionario nuevo no sabe si es bug o incumplimiento real. |

#### M3 — `/gob/usuarios` lista emails completos sin búsqueda previa

| Campo | Detalle |
|---|---|
| **Pantalla** | `/gob/usuarios` |
| **Vi** | Lista default con `lilian@dim.test`, `owner@dim.test`, etc. Aviso de audit log OK, pero la lista aparece sola. |

#### M4 — Nav dice "Mi actividad" pero la ruta real parece ser `/gob/historial` (admin tiene "Historial")

| Campo | Detalle |
|---|---|
| **Pantalla** | Nav gobierno → Mi actividad → 404 |

#### M5 — Denominadores bien explicados en Panel (modelo a seguir)

| Campo | Detalle |
|---|---|
| **Pantalla** | `/gob` |
| **Vi** | "616 perros en el padrón · el padrón cubre 0,1% de la población canina estimada · meta 80%" — esto SÍ se entiende. |

---

### BAJO

- **Bj1** — Badge "Datos de demostración" en Panorama: correcto para QA, pero un funcionario nuevo puede confundirse.
- **Bj2** — "Ver en su cola →" en novedades del panel: no siempre queda claro a qué cola te manda.
- **Bj3** — Reglas gobierno: solo lectura repetida 5 veces (una por barrio) — funcional pero verbose.

---

### IDEA

- **I1** — Link "Ver credencial pública" desde omnibox/expediente cuando buscás un DIM token.
- **I2** — En Panorama, atenuar comunas fuera de alcance en vez de colorearlas igual que las tuyas.
- **I3** — Para el informe provincial: un "modo comparación" en `/gob/programa` o redirigir a `/transparencia` con copy claro.

---

## 3. Consistencia

| Momento | Lado A | Lado B | ¿Misma historia? |
|---------|--------|--------|------------------|
| **Caso 0 — Pampa** | Público `/p/DIM-PAMP-0001`: Activa, Tier 2, vacuna 1/3, esterilizada, chip sí | Operador omnibox: **no existe** | **NO — CRÍTICO** |
| Cobertura antirrábica | Panel `/gob`: 64,4% · 616 perros · meta 80% | Programa tabla: Antirrábica 64,4% | **SÍ** |
| Cobertura antirrábica | Panel/Programa: 64,4% | Panorama chip: "11 205" | **NO — CRÍTICO** (¿conteo? ¿perros sin vacunar?) |
| Alcance mapa | Mapa Panorama: ~48 comunas CABA coloreadas | Registros: 5 filas | **NO** |
| Pérdidas activas | Panel widget: 3 | Casos regulatorios lista: Firulais, Luna×2 (3 lost cases) | **SÍ** (coherente) |
| URL Mendoza | URL `?province=Mendoza` | UI sigue en CABA | **SÍ** (scope enforced — bueno) |

---

## 4. Callejones sin salida

| Problema | Dónde me quedé |
|----------|----------------|
| Encontrar Pampa desde operador | Omnibox → sin resultados; no hay otro camino obvio |
| Comparar 2 provincias (Caso 2 interno) | Solo CABA en filtros; Inteligencia no probada (nav Analítica rota) |
| Analítica gobierno | `/gob/analitica` → 404 |
| Mi actividad / historial propio | `/gob/mi-actividad` → 404 |
| Caso 3 localidad chiquita fuera de alcance | Panorama muestra barrios ajenos en mapa pero Registros no; k-anon "Datos insuficientes (privacidad)" en Vigilancia — protección OK pero confusa |
| Descargar CSV transparencia | Click en CSV desde `/transparencia` — no se verificó contenido del archivo en esta sesión |

---

## 5. Lo que funciona muy bien

1. **Jurisdicciones claras (Caso 1):** Badge "GOB · 5 LOCALIDADES" + botón "Ver tus 5 jurisdicciones" lista Retiro, Puerto Madero, San Nicolás, Recoleta, Palermo. `/gob/reglas` lo confirma barrio por barrio.

2. **Denominadores honestos:** Panel y Programa nombran padrón, meta, población censal estimada, período ("Calculado al 16/7/26").

3. **Protección de alcance (Caso 5):** `?province=Mendoza` ignorado → CABA. `/admin/panorama` con Lucas → redirect a `/gob`. Omnibox Lucas: "Sin coincidencias **en tu jurisdicción**" para Pampa.

4. **k-anonimato visible:** Panorama "⊘ k<5 protegido", Vigilancia "Datos insuficientes (privacidad)", transparencia explica supresión.

5. **Transparencia activa (Caso 4):** `/transparencia` explica Ley 27.275, CC BY 4.0, k=5, actualización diaria, qué NO se publica. CSV/JSON por indicador. Camino claro para periodista.

6. **Maltrato:** Cola filtrada por jurisdicción, severidades legibles, códigos DEN-XXXX.

7. **Panorama export:** CSV, PNG, informe PDF — camino completo para mandar datos al jefe (dentro de CABA).

---

## 6. Anexo

### Casos cubiertos (Cursor / Lucas)

| Caso | Resultado |
|------|-----------|
| **0** (público + operador) | Público OK; operador NO puede cruzar |
| **1** Jurisdicciones | ✅ Resuelto en 2 clics |
| **2** Informe antirrábica 2 provincias | ❌ Solo CABA; transparencia como workaround |
| **3** Localidad chiquita | ⚠️ k-anon funciona; mapa vs registros confuso |
| **4** Periodista | ✅ `/transparencia` claro; descarga pendiente verificar |
| **5** Espionaje fuera de alcance | ✅ Bloqueado |
| **6** Curiosidad | Reglas, Censo, Vigilancia, Usuarios, Panorama export, Mi actividad (404) |

### Casos Cowork (`admin@dim.test` · `:3000`) — pendientes

Quedan para el agente Cowork: Casos 1–5 admin (lunes, veterinaria, denuncia, intendente, curiosidad). Solo se verificó omnibox admin y banner de crons para Caso 0.

### Datos mutados

**Ninguno.** Solo búsquedas en omnibox (registradas en "Actividad reciente" del panel).

### Superficies visitadas

- `/p/DIM-PAMP-0001` (público, 390px)
- `/gob` (Panel)
- `/gob/panorama`
- `/gob/programa`
- `/gob/vigilancia`
- `/gob/poblacion`
- `/gob/censo`
- `/gob/usuarios`
- `/gob/maltrato`
- `/gob/reglas`
- `/gob/analitica` (404)
- `/gob/mi-actividad` (404)
- `/transparencia`
- `/admin` omnibox (Caso 0, `:3000`)
