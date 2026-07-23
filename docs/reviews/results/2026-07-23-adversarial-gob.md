# Adversarial polish review — /gob (2026-07-23, code-based)

## CRITICAL
- C1 Denuncias hub DEFAULT tab (triage): MaltratoQueueScreen sin underHub — header propio
  completo bajo el header del hub, h1 repite "Denuncias" (denuncias/page.tsx:163-170 vs
  MaltratoQueueScreen.tsx:282-292). Fix: underHub + ScreenHeader (como Moderacion).
- C2 Padrón hub DEFAULT tab (población): PoblacionScreen sin underHub — eyebrow+h1 propios
  bajo el header del hub (padron/page.tsx:99 vs PoblacionScreen.tsx:138-149). Mismo fix.
  → AMBOS hubs muestran header doblado en el tab donde se aterriza por defecto.
- C3 Nav "Mi actividad" → /gob/historial muestra por DEFAULT la actividad de TODOS los
  operadores de la jurisdicción (toggle "solo mía" off; h1 "Historial de auditoría").
  El label promete un scope que la vista no entrega. Fix: label honesto "Historial".

## HIGH
- H1 Eyebrow repite el h1 verbatim: analytics ("· Analítica"/"Analítica"), mortalidad,
  PoblacionScreen, programa (near-dup). Fix: eyebrow queda solo con el prefijo de sección.
- H2 maltrato/[id]:295-320 chips de metadata hechos a mano — existe OpKpiSm (mortalidad
  ya lo usa idéntico). Fix: 4 OpKpiSm.

## MEDIUM
- M1 ScreenHeader adoptado solo en los 10 screens de la fusión; ~24 pantallas top-level
  copian el h1 a mano — ROOT CAUSE de C1/C2. Fix: migrar todos los headers /gob a
  ScreenHeader (underHub default false).
- M2 Outbox: nav "Bandeja de salida" / h1 "Cola de notificaciones" — 3 nombres. Fix: h1
  "Bandeja de salida — tu jurisdicción".
- M3 Reglas eyebrow prefix difiere por rol (miMAR Gobierno· vs Admin·). Baja prioridad.

## LOW: brotes/perdidas/vigilancia solapan 1 palabra eyebrow/h1 — no-issue, documentado.

## LIMPIO (explícito): underHub correcto en 8/10 migrados; disciplina OpFilterBar/OpKpi/
OpCard/nature/guardInput/tabular-nums EXCELENTE app-wide; detail pages scope-guardean con
notFound() sin leaks; back-links post-fusión correctos (sin cadenas de redirect); RulesWizard
100% compuesto de primitivos; Panorama con degraded-handling cuidadoso.
