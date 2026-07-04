// Story device screens — illustrative renders of the real product surfaces,
// built from the shipped DS components (LnRegistry/LnRegRow/LnBadge/
// LnStatusFlag/LnVstamp/LnPetPhoto/OpKpiSm). Ported from the handoff
// prototype (landing2/screens.jsx, story-screens.jsx, console.jsx).
//
// All screens live inside an aria-hidden PhoneFrame / console window: they
// are decorative illustrations; the narrative copy lives in the chapters.

import { Icon } from "@/components/Icon";
import {
  CONSOLE_KPIS,
  LIBRETA_EVENTS,
  MAP_TILES,
  PAMPA,
  mapTintStep,
} from "@/components/landing/landing-content";
import { LnBadge } from "@/components/ui/Badge";
import { LnPetPhoto, LnRegRow, LnRegistry } from "@/components/ui/RegRow";
import { LnStatusFlag, LnVstamp } from "@/components/ui/StatusFlag";
import { OpKpiSm } from "@/components/ui/dashboard/OpKpi";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function AppHead({
  title,
  sub,
  photo,
  right,
}: {
  title: string;
  sub?: string;
  photo?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="lp-app-head">
      {photo}
      <div className="min-w-0 flex-1">
        <div className="lp-ah-t">{title}</div>
        {sub && <div className="lp-ah-s">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cap 1 · Dueño — "Mis mascotas"
// ---------------------------------------------------------------------------

const MY_PETS = [
  {
    name: "Pampa",
    status: "ok" as const,
    species: "Canino",
    breed: "Caniche × Border collie",
    next: "Al día · próx. vacuna jun 2027",
  },
  {
    name: "Tomás",
    status: "lost" as const,
    species: "Canino",
    breed: "Beagle",
    next: "Perdido hace 4 h · 3 avistamientos",
  },
  {
    name: "Luna",
    status: "pregnant" as const,
    species: "Conejo",
    breed: "Holland Lop",
    next: "Parto estimado en 12 días",
  },
];

export function DuenoScreen() {
  return (
    <>
      <div className="lp-scr-top" />
      <AppHead title="Hola, Martín" sub="3 mascotas · 1 alerta activa" />
      <div className="lp-app-body px-3 pt-2.5">
        <LnRegistry>
          {MY_PETS.map((p) => (
            <LnRegRow
              key={p.name}
              name={p.name}
              status={p.status}
              species={p.species}
              breed={p.breed}
              nextLine={p.next}
              photoSize={46}
            />
          ))}
        </LnRegistry>
        <div className="lp-ph-caps mt-3">
          <span className="lp-ph-cap">
            <Icon name="share" size="sm" decorative className="text-[var(--color-ln-azul)]" />
            Compartir libreta
          </span>
          <span className="lp-ph-cap">
            <Icon name="perdida" size="sm" decorative className="text-[var(--color-ln-err)]" />
            Modo perdido
          </span>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cap 2 · Vet — turno + vacuna firmada con matrícula validada
// ---------------------------------------------------------------------------

const VET = {
  matricula: "MP 4821",
  nombre: "Dra. Lucía Romero",
};

export function VetTurnoScreen() {
  return (
    <>
      <div className="lp-scr-top" />
      <AppHead
        title="Vet. Belgrano"
        sub={`${VET.nombre} · ${VET.matricula}`}
        right={<LnBadge variant="success">Verificada</LnBadge>}
      />
      <div className="lp-app-body lp-ph-pad">
        <div className="lp-ph-card">
          <div className="lp-ph-label">Turno de hoy</div>
          <div className="flex items-center gap-3">
            <span className="grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-[var(--radius-input)] bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)]">
              <Icon name="reloj" size="sm" decorative />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[var(--text-md)] font-bold text-[var(--color-ln-ink)]">
                Pampa · Vacunación antirrábica
              </div>
              <div className="mt-0.5 text-[var(--text-sm)] text-[var(--color-ln-ink-2)]">
                Jueves 12 jun · 10:30 · confirmado
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2 border-t border-[var(--color-ln-line-2)] pt-2.5 text-[var(--text-sm)] text-[var(--color-ln-mute)]">
            <Icon name="celular" size="sm" decorative />
            Reservado por Martín desde la app · llega con la libreta completa
          </div>
        </div>

        <div className="lp-ph-ok">
          <Icon name="vacuna" size="sm" decorative className="mt-0.5 text-[var(--color-ln-ok)]" />
          <div className="flex-1">
            <div className="lp-t">Vacuna aplicada y firmada</div>
            <div className="lp-s">Lote AR-2214 · próximo refuerzo se agenda solo</div>
          </div>
          <LnVstamp variant="ok" />
        </div>

        <div className="lp-ph-card">
          <div className="lp-ph-label">Así queda en la libreta</div>
          <div className="lp-lib-t">Vacunación: antirrábica</div>
          <div className="lp-lib-foot">
            <span className="lp-lib-type">vaccination_administered</span>
            <span className="lp-lib-by">firmado · {VET.matricula}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cap 3 · Anónimo — credencial pública en modo perdido (sin cuenta, sin app)
// ---------------------------------------------------------------------------

export function AnonLostScreen() {
  return (
    <>
      <div className="lp-scr-top" />
      <div className="lp-lostb">
        Mascota perdida
        <small>desde el 14 mar 2024 · 09:14</small>
      </div>
      <div className="lp-lost-hero">
        <div className="flex justify-center">
          <LnPetPhoto alt={`${PAMPA.name}, perdida`} status="lost" size={120} />
        </div>
        <div className="lp-lh-name">¡Hola! Soy {PAMPA.name}</div>
        <div className="lp-lh-sub">
          Mansa, responde a su nombre.
          <br />
          Si la viste o la tenés, por favor avisá.
        </div>
      </div>
      <div className="lp-lost-actions">
        <span className="lp-lost-btn lp-lost-btn--call">
          <Icon name="telefono" size="sm" decorative /> Llamar a Martín
        </span>
        <span className="lp-lost-btn lp-lost-btn--found">
          <Icon name="ubicacion" size="sm" decorative /> La encontré
        </span>
      </div>
      <div className="lp-ph-card mx-4 mt-2.5 flex items-start gap-2.5">
        <Icon name="map-pin" size="sm" decorative className="mt-0.5 text-[var(--color-ln-err)]" />
        <div>
          <div className="text-[var(--text-sm)] font-bold text-[var(--color-ln-ink)]">
            Última vez vista
          </div>
          <div className="mt-0.5 text-[var(--text-sm)] text-[var(--color-ln-ink-2)]">
            Barrancas de Belgrano · CABA — hoy 09:14
          </div>
        </div>
      </div>
      <div className="lp-lost-note">
        Sin cuenta y sin app: solo escaneaste un QR. Los datos de Martín quedan protegidos.
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cap 4 · Refugio — ingreso, chip verificado, custodia devuelta
// ---------------------------------------------------------------------------

export function OrgIntakeScreen() {
  return (
    <>
      <div className="lp-scr-top" />
      <AppHead
        title="Refugio Patitas del Barrio"
        sub="Panel de ingresos"
        right={<LnBadge variant="info">Verificada</LnBadge>}
      />
      <div className="lp-app-body lp-ph-pad">
        <div className="lp-ph-card">
          <div className="lp-intake-row">
            <span className="lp-iic">
              <Icon name="checkin" size="sm" decorative />
            </span>
            <div>
              <b>Ingreso registrado</b>
              <span className="lp-intake-sub">
                La trajo una vecina · <span className="lp-lib-type">shelter_intake_recorded</span>
              </span>
            </div>
          </div>
          <div className="lp-intake-row">
            <span className="lp-iic">
              <Icon name="microchip" size="sm" decorative />
            </span>
            <div>
              <b>Chip verificado</b>
              <span className="lp-intake-sub">
                941 000 100 000 001 → es <b className="inline">Pampa</b>, de Martín
              </span>
            </div>
          </div>
          <div className="lp-intake-row" data-t="ok">
            <span className="lp-iic">
              <Icon name="bell" size="sm" decorative />
            </span>
            <div>
              <b>Dueño notificado</b>
              <span className="lp-intake-sub">Martín está a 1,2 km · en camino</span>
            </div>
          </div>
          <div className="lp-intake-row" data-t="ok">
            <span className="lp-iic">
              <Icon name="casa" size="sm" decorative />
            </span>
            <div>
              <b>Custodia devuelta</b>
              <span className="lp-intake-sub flex flex-wrap items-center gap-1.5">
                <span className="lp-lib-type">status_changed</span> <LnStatusFlag status="ok" />
              </span>
            </div>
          </div>
        </div>
        <p className="lp-ph-note">
          Refugio, red de rescate, veterinaria, municipal — <b>se llamen como se llamen</b>, el
          acceso llega por solicitud verificada. El público ve un solo sello.
        </p>
        <div className="lp-ph-caps mt-auto">
          <span className="lp-ph-cap">
            <Icon name="check" size="sm" decorative /> Custodia trazable
          </span>
          <span className="lp-ph-cap">
            <Icon name="check" size="sm" decorative /> Adopciones y tránsitos
          </span>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cap 5 · La libreta — the 10 real events, append-only
// ---------------------------------------------------------------------------

export function LibretaScreen() {
  return (
    <>
      <div className="lp-scr-top" />
      <AppHead
        photo={<LnPetPhoto alt={PAMPA.name} status="ok" size={40} />}
        title={PAMPA.name}
        sub={PAMPA.breed}
        right={<LnStatusFlag status="ok" />}
      />
      <div className="lp-app-body lp-lib-feed">
        {LIBRETA_EVENTS.map((e) => (
          <div className="lp-lib-row" key={`${e.type}-${e.year}-${e.month}-${e.title}`}>
            <div className="lp-lib-when">
              <div className="lp-lib-y">{e.year}</div>
              <div className="lp-lib-m">{e.month}</div>
            </div>
            <div className="lp-lib-spine">
              <span className="lp-lib-dot" data-t={e.tone} />
            </div>
            <div>
              <div className="lp-lib-t">
                {e.title}
                {e.flag && <LnStatusFlag status={e.flag} />}
                {e.stamp && (
                  <span className="ml-auto">
                    <LnVstamp variant={e.stamp} />
                  </span>
                )}
              </div>
              <div className="lp-lib-meta">{e.meta}</div>
              <div className="lp-lib-foot">
                <span className="lp-lib-type">{e.type}</span>
                <span className="lp-lib-by">{e.by}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="lp-lib-lock">
        <Icon name="candado" size="sm" decorative /> append-only — nada se edita, nada se borra
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cap 6 · Estado — navy console with the celeste silhouette cartogram
// ---------------------------------------------------------------------------

function ConsoleCartogram() {
  return (
    <div className="lp-map-grid">
      {MAP_TILES.map((t) => (
        <div
          key={t.ab}
          className="lp-mtile"
          data-q={mapTintStep(t.v)}
          style={{ gridColumn: t.c + 1, gridRow: t.r + 1 }}
          title={`${t.name} · ${t.v.toFixed(1).replace(".", ",")} /100k`}
        >
          <span className="lp-ab">{t.ab}</span>
          <span className="lp-mv">{t.v.toFixed(1).replace(".", ",")}</span>
        </div>
      ))}
    </div>
  );
}

const LEGEND_STEPS: Array<[0 | 1 | 2 | 3 | 4, string]> = [
  [0, "<1,5"],
  [1, "1,5–4"],
  [2, "4–6"],
  [3, "6–8"],
  [4, "≥8"],
];

const LEGEND_TINT: Record<number, string> = {
  0: "color-mix(in srgb, var(--color-ln-celeste) 12%, transparent)",
  1: "color-mix(in srgb, var(--color-ln-celeste) 28%, transparent)",
  2: "color-mix(in srgb, var(--color-ln-celeste) 48%, transparent)",
  3: "color-mix(in srgb, var(--color-ln-celeste) 70%, transparent)",
  4: "var(--color-ln-celeste)",
};

export function EstadoConsole() {
  return (
    <div className="lp-estado" data-section="estado-console">
      <div className="lp-estado-head">
        <div>
          <p className="lp-eyebrow">Vista · Estado</p>
          <h3 className="lp-display lp-h-sub mt-3">Tendencias, no planillas.</h3>
          <p className="lp-lead mt-3.5 text-[var(--text-lg)]">
            Cada libreta suma a la foto sanitaria del país. La consola llega prefiltrada: señales
            zoonóticas por jurisdicción, en tiempo real.
          </p>
        </div>
        <div className="lp-kicks">
          <div className="lp-kick">
            <span className="lp-kic">
              <Icon name="chart-line" size="sm" decorative />
            </span>
            <div>
              <b>Señales tempranas</b>
              <span className="lp-kick-sub">
                Síntomas y diagnósticos agregados detectan patrones antes.
              </span>
            </div>
          </div>
          <div className="lp-kick">
            <span className="lp-kic">
              <Icon name="map-pin" size="sm" decorative />
            </span>
            <div>
              <b>Por jurisdicción</b>
              <span className="lp-kick-sub">Cobertura, denuncias y brotes, comuna por comuna.</span>
            </div>
          </div>
          <div className="lp-kick">
            <span className="lp-kic">
              <Icon name="candado" size="sm" decorative />
            </span>
            <div>
              <b>Anonimizado por diseño</b>
              <span className="lp-kick-sub">Solo datos agregados — nunca individuales.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-mac" aria-hidden="true">
        <div className="lp-mac-bar">
          <span className="lp-mac-dot" />
          <span className="lp-mac-dot" />
          <span className="lp-mac-dot" />
          <span className="lp-mac-title">miMAR · Consola de vigilancia</span>
        </div>
        <div className="lp-con">
          <div className="lp-con-bar">
            <span className="lp-con-title">
              <Icon name="shield" size="sm" decorative /> Señales zoonóticas
            </span>
            <span className="lp-fpill">Últimos 12 meses</span>
            <span className="lp-fpill">Rabia + leptospirosis</span>
            <span className="lp-fpill">Confirmadas y sospechosas</span>
          </div>
          <div className="lp-con-body">
            <div className="lp-con-rail">
              {CONSOLE_KPIS.map((k) => (
                <div className="lp-navy-card op-surface" key={k.label}>
                  <OpKpiSm label={k.label} value={k.value} tone={k.tone} />
                </div>
              ))}
              <div className="lp-con-railnote">
                fuente: libretas + campañas oficiales
                <br />
                agregado y anónimo por diseño
                <br />
                datos ilustrativos · demo
              </div>
            </div>
            <div className="lp-con-map">
              <div className="lp-con-map-h">
                <b>Señales por 100 mil habitantes</b>
                <span className="lp-con-map-sub">por jurisdicción</span>
              </div>
              <ConsoleCartogram />
              <div className="lp-legend">
                {LEGEND_STEPS.map(([q, label]) => (
                  <span className="lp-lg" key={q}>
                    <span className="lp-sw" style={{ background: LEGEND_TINT[q] }} /> {label}
                  </span>
                ))}
                <span className="flex-1" />
                <span>actualizado hoy · 07:00</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="lp-con-note">consola ilustrativa · datos de demostración</p>
    </div>
  );
}
