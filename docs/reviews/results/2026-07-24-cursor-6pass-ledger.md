# Cursor 6-pass series — ledger de veredictos verificados (2026-07-24)

Serie: Trust · Privacy · Disputes · QR · Metrics · Scale. Cada claim verificado contra
código + DB viva (`supabase_db_DIM`, 200.028 pet_events) antes de tomarlo. Regla: nada
válido por defecto.

## Trust (writer authenticity)
| ID | Veredicto | Nota |
|---|---|---|
| T1 KPIs cuentan datos auto-declarados | CONFIRMADO (3 brazos) | Fix ≠ filtrar (colapsa antirrábica a 0,1%: 42 firmadas vs 48.277 declaradas). Fix = doble lente Declarado\|Firmado. → PREGUNTA |
| T2 confirmed_by_lab eleva a institutional_verified, checkbox en form de dueño | CONFIRMADO | Fix (b): rechazar el flag si authorRole=owner. → PREGUNTA (bundle) |
| T3 authorVerified = matrícula en un path, org.verified en otro | CONFIRMADO | Intake clínico (chip/tatuaje) es el inconsistente real. → PREGUNTA (bundle) |
| T4 org-bite estampa vet+org.verified sin matrícula del firmante | CONFIRMADO | Recepcionista de clínica firma como vet. → PREGUNTA (bundle) |
| T5 firmado_at/firma_hash nunca poblados (0/200.028) | CONFIRMADO | Columnas reservadas para export SENASA, no mecanismo de firma. → AUTO (documentar) |
| T7 posesión de token = alcance clínico | CONFIRMADO (diseño deliberado) | Fix = notificar al dueño en cada atender (no relationship gate). → AUTO |

## Privacy
| ID | Veredicto | Nota |
|---|---|---|
| P1 /privacidad afirma cumplir registro AAIP/DNPDP sin inscripción | CONFIRMADO | El QA harness bloquea el string fuerte pero deja pasar el reformulado — esquiva de wording. → PREGUNTA (legal) |
| P2 Tier2 "siempre" ata datos médicos al token estable | CONFIRMADO | Fix = re-consentimiento periódico. → PREGUNTA (bundle) |
| P3 share link expone historia clínica + chip/tatuaje + nombre | CONFIRMADO | Hardening existe; "sin vencimiento" es el hueco. → PREGUNTA (bundle) |
| P4 defaults de columna disclose_* permisivos vs wizard OFF | CONFIRMADO | Camino real publica PII si el form omite campos. → AUTO (migración + fail-closed) |
| P5 GPS de finder guardado, copy promete utilidad sin read-path | CONFIRMADO | Alineado con decisión GPS "declarar la realidad". → AUTO (reword copy) |
| P6 erase retiene eventos sanitarios; export vuelca payloads full | CONFIRMADO | Free-text PII sobrevive al borrado. → AUTO (redactar keys de texto libre) |
| P7 política omite Tier2, share, búsqueda PII de autoridad, open data | CONFIRMADO | → AUTO (sección "con quién se comparten") |

## Disputes + QR
| ID | Veredicto | Nota |
|---|---|---|
| D1 muerte irreversible, sin evento compensatorio | CONFIRMADO | Solo salida por psql. → PREGUNTA (death_voided) |
| D2 /p mudo durante disputa de custodia | CONFIRMADO | Bruno se presenta como del dueño actual. → AUTO (banner + freeze contacto) |
| D3 amend admin/gob existe pero sin superficie /gob | CONFIRMADO | → OLA ES (feature) |
| D4 resolución de disputa single-actor | CONFIRMADO | → PREGUNTA (four-eyes) |
| V2 "verificada" chrome incondicional (desktop-only) | CONFIRMADO | → AUTO (→ "registrada") |
| V3 sin rotación/revocación de publicToken | CONFIRMADO | Chapita robada resuelve para siempre. → PREGUNTA (diseño) |
| V8 URL relativa en service-dog presentar | CONFIRMADO | → AUTO (one-liner) |

## Metrics + Scale
| ID | Veredicto | Nota |
|---|---|---|
| K2 100% cumplimiento junto a breaches vivos | PARCIAL | ENO ya arreglado; falta el tile rabies-10d. → AUTO (portar patrón ENO) |
| K3 citas legales sin badge | PARCIAL | 5daa6a33 cubrió catálogo; faltan PppPublicBadge + 2 forms. → AUTO |
| K4 cap 2000 + cubo OFF + export sin flag truncado | PARCIAL | UI ya avisa; el CSV del map-table no. → AUTO (flag en CSV) |
| K5 next_due_at ignora overlay | PARCIAL (causa distinta) | Eventos SÍ se overlayean; el stale es reminders.due_at nunca re-derivado. → AUTO (refresher de reminder en amend) |
| K8 sin methodologyVersion | CONFIRMADO | → AUTO (campo + stamp en ⓘ) |
| S1/S2 1 cron diario, 55s, 22 jobs, outbox+ENO al final | CONFIRMADO | Primeras víctimas del budget. → PREGUNTA (Vercel Pro) |
| S3 refresh_cube des-agendado + CUBE_READS OFF | CONFIRMADO | Comentario "cada 15 min" es falso. → se pliega a decisión "cubo ON" ya tomada |
| S4 pet_events sin particionar | CONFIRMADO | → OLA ES (spec de rebuild) |
| S5 drift 2000/noche detect-only | CONFIRMADO (con cursor de resume) | Barrido rodante completo; OK. → sin acción urgente |
| S8 sin error sink; alerting console-only si webhook unset | CONFIRMADO | → AUTO (setear webhook) + PREGUNTA menor (sink) |
