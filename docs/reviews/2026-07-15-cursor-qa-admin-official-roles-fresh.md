# Cursor QA — Fresh batch · Admin + roles oficiales / emergencia

**Fecha:** 15/7/2026 · **Entorno:** `http://localhost:3000` (qa-up, build fresco vs HEAD `f4bfa2ea`)  
**Cuentas:** `admin@dim.test` · `govt-local@dim.test` · `govt@dim.test`  
**Modo:** adversarial UI/UX (sin fixes). Soft-nav a veces no responde → hard URL.

Revalida puntos de [ronda 4 funcionario-admin](./2026-07-15-cowork-qa-ronda4-funcionario-admin.md) y agrega escenarios de emergencia con roles oficiales distintos.

---

## TL;DR

Los hallazgos **duros de admin (A1–A3)** siguen vivos: outbox sin señal clara post-reintento, crons en FALLO, SLA ENO con “100% histórico” + “12 en incumplimiento”.  
En gobierno, lo más grave para una emergencia real es la **incoherencia Panel ↔ Pérdidas** (KPI “3 activas” vs listado vacío) y una **denuncia crítica de peleas sin asignar a los 5 días** aunque ya esté derivada a org.  
**M5 (jurisdicciones nombradas)** está bien en multi-localidad (`Ver tus 3 jurisdicciones`).  
`govt-local` en DB solo tiene Palermo (falta La Plata del seed) — no es UI, es drift de asignaciones.

---

## 1) Revalidación admin (`admin@dim.test`)

| ID | Hallazgo previo | Estado fresco | Evidencia |
|---|---|---|---|
| **A1** | Reintentar outbox sin feedback | **SIGUE** (parcial) | Detalle `/admin/outbox/be47e84a-…`: botón pasa a “Programando…”; al recargar **Intentos=0**, Último intento=—, Próximo reintento solo movió a ~10:51. Sin toast de éxito/fracaso. |
| **A2** | Crons FALLO | **SIGUE** | `/admin/sistema`: `expire_foster_proposals`, `expire_pet_transfers`, `post_adoption_checkin`, `process_eno_queue`, `vaccine_due` — todos FALLO 15 jul 10:46. ENO sigue sin drenar → explica Intentos=0. |
| **A3** | SLA 100% vs breaches | **SIGUE** (copy mejorada, contradicción intacta) | Tarjeta “SLA ENO”: **“12 en incumplimiento”** + “Cumplimiento histórico **100%** de las entregadas · 12 vencidas AHORA”. Badge bandeja **12**. |
| **M6** | Ayuda cron = jerga Vercel/curl | **SIGUE** | Texto “Para el equipo técnico: … dashboard de Vercel … curl con CRON_SECRET”. Operador no puede actuar. |
| **M1** | Mapa del sitio 0×0 | **Indeterminado / posible fix** | Dashboard lista destinos con links reales en a11y (`Panorama`, `Censo`, …). No re-medí bounding boxes en esta pasada. |
| **M3** | Evidencia denuncia no disponible | **N/A** | Cola moderación vacía (0). |
| **B3** | Omnibox “jurisdicción” para admin universal | **Parcial** | Omnibox abre listbox al buscar “Negro”; no capturé el empty-state exacto antes de navegar. |
| **Observaciones** | Badge vs lista | **SIGUE (peor en triage)** | Panel/mapa: Observaciones **1**. Lista mezcla decenas de “Cerrada negativa” y entierra la única **En curso** (Chichila / Palermo) en el medio. Nombres dueño seed (`PANO-Seed-Owner`, `lucia-gen-…`). |
| **Alertas** | Date locale + cola | **Nuevo detalle** | 1 alerta: esterilización CABA 38 vs meta 70, antigüedad **8 días / VENCIDO**. Inputs `type=date` (Desde/Hasta). |

### Outbox emergencia sanitaria

Filas ENO con **Intentos 0** e **INCUMPLIMIENTO** (origen p.ej. “Observación antirrábica iniciada”). Reintentar no mueve Intentos mientras `process_eno_queue` esté caído → el botón da falsa sensación de control.

---

## 2) Gobierno local — emergencia urbana (`govt-local@dim.test`)

**Alcance UI:** `GOB · Palermo, CABA` (1 localidad).  
**Alcance DB:** solo `CABA/Palermo` — **no** aparece `La Plata` aunque el seed lo documenta.

### Escenarios

| Escenario | Qué hice | Hallazgo |
|---|---|---|
| **Rabia / mordedura** | `/gob/casos/CAS-PBJR-G559` (Chichila) | **Bien:** título, normativa (ENO + Ord. CABA + PPP), timeline observación+incidente, jurisdicción Palermo. **Ruido:** “Abrió: `maria-gen-mrau2dv1`” (seed). |
| **Maltrato crítico** | Cola `/gob/maltrato` | 10 denuncias; **Peleas de perros · CRÍTICA** arriba. KPI “SIN ASIGNAR **10** / MÍAS **0**”. A11y muestra el bloque “Denuncias (10)” **repetido ~5×** (sospecha de duplicación DOM / regiones). |
| **Pérdidas** | Panel dice **3** activas; `/gob/perdidas` | **ALTO:** listado **(0)** / “Sin resultados” con filtro default 30 días. Casos regulatorios del panel sí listan mascotas perdidas (Firulais, Luna…). Operador cree que hay casos y la cola está vacía. |
| **Panorama OOS** | `/gob/panorama?province=AR-X` | Caption/UI habla de **Córdoba** sin mensaje claro “fuera de tu alcance” (eco B8). |
| **Guardrail admin** | (probado con `govt@`) `/admin` | Redirige a `/gob` — OK. |

---

## 3) Gobierno remoto / multi-jurisdicción (`govt@dim.test`)

**Alcance:** “3 localidades” + chip **“Ver tus 3 jurisdicciones”** → Ushuaia (TdF), El Calafate (Santa Cruz), Palermo (CABA). **M5 FIXED** en este perfil.

| Escenario | Hallazgo |
|---|---|
| **Denuncia crítica DEN-9KSC-MRMZ** | Detalle usable: gravedad crítica, anónimo + email org, normativa 14.346, export MPF. **Problema operativo:** Estado **Abierta**, Asignado **Sin asignar**, edad **5 días**, y a la vez “Ya derivada a **Mascotas BA Centro** — 11 jul”. Doble lectura: ¿quién es dueño del caso? |
| **Pérdidas** | Misma incoherencia: panel **3** vs listado **0**. |
| **Actividad reciente** | Dominada por “Búsqueda de información personal” — poco útil en emergencia. |
| **Brotes** | Casos `CAS-3CYF-M7PZ` / `CAS-4E6S-KEJS` “Investigación de brote” visibles en panel — buen gancho para rol sanitario. |

---

## 4) Prioridades (oficiales / emergencia)

### ALTO

1. **G1 · Panel “N pérdidas” ≠ `/gob/perdidas` vacío** — bloquea triage de extravíos.  
2. **A2+A1 · Crons FALLO + Reintentar outbox inútil** — ENO/rabia no salen; Intentos quedan en 0.  
3. **A3 · SLA ENO tranquiliza de más** — 100% histórico junto a 12 vencidas ahora.  
4. **G2 · Denuncia crítica abierta 5d sin asignar** pese a derivación a org — ownership ambiguo.

### MEDIO

5. **Observaciones:** activas ahogadas entre cerradas; badge≠foco.  
6. **Maltrato:** posible lista duplicada en DOM; 10/10 sin asignar.  
7. **Panorama OOS** finge provincia ajena (Córdoba).  
8. **Seed/asignaciones:** `govt-local` sin La Plata; nombres `*-gen-*` / `PANO-Seed-*` en casos reales.  
9. **M6** ayuda de cron no operable.

### BAJO / OK

- Multi-jurisdicciones expandibles (**M5 OK** en `govt@`).  
- Caso mordedura Chichila: estructura legal + timeline claros.  
- Govt no entra a `/admin`.

---

## 5) Cuentas y propósito (mapa de prueba)

| Cuenta | Rol | Para qué sirve en QA |
|---|---|---|
| `admin@dim.test` | Admin universal | Salud sistema, outbox ENO, crons, omnibox, observaciones globales |
| `govt-local@dim.test` | Govt 1 barrio (Palermo) | Emergencia urbana: maltrato, mordedura, pérdidas locales |
| `govt@dim.test` | Govt 3 localidades (remoto + Palermo) | Multi-alcance, brotes, chip de jurisdicciones, OOS |

*(Sanitary-authority org no re-testeado en esta batch; la denuncia crítica ya referencia derivación a “Mascotas BA Centro”.)*

---

## 6) Lo que no romper

- Caso mordedura con bloque de normativa + timeline.  
- Chip “Ver tus N jurisdicciones” cuando N>1.  
- Guardrail `/admin` → `/gob` para govt.  
- Severidad crítica visible arriba en maltrato.
