# Adversarial polish review — /admin + twins (2026-07-23, code-based)

## HIGH
- /admin/moderacion quedó como página standalone SIN fusionar: chrome viejo, lógica
  duplicada, comentario stale referenciando /gob/moderacion (que ya redirige al hub).
  Dos UIs distintas para la misma cola. Fix: redirect param-preserving a
  /gob/denuncias?etapa=moderacion (admin ya puede ver el hub post no-bounce).

## MEDIUM/HIGH
- Padrón "Población" doble header en AMBOS twins (= C2 del review gob).

## MEDIUM
- admin/casos tiene savedViewsKey; el CasosScreen gob (twin) no — paridad de features.
- ScreenHeader solo en ~11/50+ pantallas (misma raíz que gob M1).
- 5 h1 no-canónicos: admins, admins/new, govts, govts/new (text-xl tracking-tight),
  sistema/crons (text-lg + breadcrumb bespoke).

## LOW
- admin/casos sin eyebrow (único sin "Admin · X").
- admin home repite "Universal" 3× (eyebrow + subtitle + OpScopeChip).

## LIMPIO (explícito): admin home bien compuesto; Panorama twin sin drift (shell
compartido, divergencia de scope documentada); familia Observaciones consistente;
re-exports thin (cola/suscripciones/reglas/directorio) = cero drift por construcción;
sin window.confirm() en todo /admin; fechas 100% por formatDate* (80 call sites);
admin/mascotas/[token] correcto.
