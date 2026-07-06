# Génesis — world ledger (relay baton)

> Operador: Cursor · sesión 2026-07-06 · entorno `localhost:3000` (build prod, **seed demo — NO mundo vacío**)

## Precondición

| Esperado (handoff) | Observado |
|---|---|
| `db:reset + bootstrap` + solo `admin@dim.test` | Seed completo: 3 govts, 12 orgs, 13 usuarios personales, KPIs demo |
| Ledger vacío al inicio | Este archivo se crea en la primera pasada del operador |

**Impacto:** los actos 3/4/6 del ciudadano no pueden correr en cadena real hasta que Cowork arranque act 2 y deje `AWAITING` en este archivo. La pasada operador documenta UX sobre seed como proxy.

---

## Ledger (cronológico)

```
[pre] ENTORNO: seed demo detectado — 3 govts preexistentes (lucas@, govt-local@, govt@), admin ya logueado
[act 1] UI-only admin → /admin/govts/new (form completo Palermo/CABA, STOP antes de submit — contrato no irreversible)
        → NO se creó govt-genesis-palermo@dim.test
        AWAITING: act 1 real requiere mundo vacío + submit autorizado por PO

[act 2] — ciudadano (Cowork) — AWAITING: primer signup + pet DIM-XXXX
[act 3] — ciudadano registra org → AWAITING VERIFY (operador no recibió token del ledger)
[act 3-proxy] admin exploró /admin/organizaciones — 7 orgs Pendiente con botón "Proponer verificación"
[act 3-side] admin clic "Proponer verificación" en Refugio Pendiente Verificación (Recoleta) — creó approval_request (side-effect reversible solo vía cola reject)
        Cola /admin/cola?type=organization_verification sigue vacía en scope admin universal (inconsistencia — ver M2)
        AWAITING: org del act 3 ciudadano + verificación en cola visible

[act 4] — AWAITING: matrícula request del ciudadano (alejo@ u otro)
        /gob/cola?type=role_upgrade_vet vacía para govt@ (scope Ushuaia/El Calafate/Santa Cruz — no CABA)

[act 5] — proxy orgadmin@ → org Refugio Test ORG-token DIM-8PZY-92FC
        /org/DIM-8PZY-92FC/admin/permisos → 500 "Algo salió mal" (sin-digest) — BLOCKER B1
        Panel refugio muestra matriz "Tus permisos" read-only (incl. event.write Concedido) pero nav Permisos rota
        AWAITING: act 5 real post-org-verificada + miembro sin event.write para conceder en matriz

[act 6] — ciudadano (Cowork) — AWAITING acts 3✓ 4✓ 5✓

[act 7] govt@ → /gob/reglas → 500 BLOCKER B2
        admin@ → /admin/reglas árbol OK
        admin@ → /admin/reglas/AR/CABA/Palermo → 500 BLOCKER B3
        /gob panel: filtros Provincia/Localidad presentes; KPIs demo visibles; cola widget "Ver todos (20)" vs cola vacía
        AWAITING: datos generados en act 6 + drill-down reglas funcional
```

## Tokens útiles (seed, no génesis)

| Entidad | Token / email |
|---|---|
| Refugio Test (verificado) | `DIM-8PZY-92FC` · orgadmin@dim.test |
| Refugio Pendiente Verificación | Recoleta CABA · CUIT 30-71000005-5 |
| Govt remoto (3 loc) | govt@dim.test |
| Govt local (La Plata + Palermo) | govt-local@dim.test |

## Próximo desbloqueo

1. PO resetea a mundo vacío **o** acepta relay sobre seed con Cowork escribiendo `[act 2]` aquí.
2. Operador retoma cuando aparezca `AWAITING VERIFY` / `AWAITING APPROVE` con token concreto.
3. Fix blockers B1–B3 antes de re-run act 5/7.
