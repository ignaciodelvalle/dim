# QA Cursor — Pack LITE paralelo (solo lectura: anon + visual)

**URL:** https://dim-staging-a3ynpgcos-ignacio-dim.vercel.app
**Solo necesitás UNA cuenta:** `govt@dim.test` / `Test1234!` (para el punto 4). Todo lo demás es SIN login.
**Tu lane:** superficie pública + visual. NO toques flujos con mutación (signup, denuncias, transferencias, adopciones) — Cowork los corre en paralelo. Reportá: OK / FALLA + captura.

## 1. Landing (los 3 fixes de hoy + el hero nuevo)
- **Hero "credencial viva"**: la mini credencial cicla 6 estados tintando la card ENTERA (rojo en PERDIDA con "📞 Llamar al dueño"); los puntitos son clickeables (pausa y retoma solo); el ícono ↻ gira a la mini libreta y vuelve; línea MRZ estilo DNI abajo; el QR escanea de verdad.
- **Pantallas de la historia** (scrolleá "Una mascota. Muchas manos."): junto a "Pampa" en la pantalla de la vet ya NO hay un artefacto gris (ahora el badge AL DÍA se ve completo); la raza es "Caniche" a secas; en la pantalla del refugio la frase "Es Pampa, de Martín — a 1,2 km, en camino." va en UNA sola línea; el chip dice "Cambio de estado" (no `status_changed`).
- **/funcionalidades**: carga, 3 niveles con badges, linkeada desde el footer.
- Reduced motion (si podés): con `prefers-reduced-motion` el hero queda quieto en AL DÍA.

## 2. Superficie pública anónima (sin crear nada)
- `/p/DIM-DEMO-0001`: sin PII del dueño; badge de vacuna verificada visible.
- `/perdidas` y `/adoptar` cargan; concordancia de género en los cards ("Perdido" para machos).
- `/leyes`: sin jerga interna (no deben aparecer `pet_identifications` ni `export_subject_data`).

## 3. Panorama visual — la geometría NUEVA (govt@, solo mirar)
- /gob/panorama: zoom al AMBA — los partidos costeros (Avellaneda, San Isidro) deben abrazar la costa real del Río de la Plata, SIN triángulos naranjas cruzando el agua ni huecos negros entre partidos (era el bug de hoy).
- Zoom adentro (z≥6.5) en cualquier provincia: aparecen los contornos de departamentos SIEMPRE; en CABA, los 48 barrios.
- KPIs con decimales: "41,3%" con coma.

## 4. Chequeo de estabilidad (govt@)
- Cargá /gob/panorama 3 veces seguidas: el mapa pinta siempre (≤30s), nunca skeletons eternos. Si aparece "No pudimos cargar los indicadores", reportalo con la hora exacta (es el modo degradado — anotar frecuencia).

Veredicto: lista de OK/FALLA por punto. Corto y visual — sin narrativa larga.
