// ============================================================
// DIRECCIÓN A — TIER OPERADOR · Gob parte 3
// Vigilancia (MAPA MULTICAPA) · Reglas por jurisdicción · Catálogo regulatorio
// ============================================================

// Pins de muestra para el mapa multicapa (left% / top% / layer / label)
const GOB_PINS = [
  // maltrato (rojo)
  [50,52,'maltrato','!'], [38,44,'maltrato','!'], [62,63,'maltrato','!'], [44,70,'maltrato','!'],
  // zoonosis (violeta)
  [30,35,'zoonosis','z'], [70,40,'zoonosis','z'], [58,30,'zoonosis','z'],
  // brotes (ámbar) — clusters
  [26,58,'brotes','3','c'], [72,68,'brotes','2','c'], [48,38,'brotes','1'],
  // perdidas (azul)
  [40,55,'perdidas','p'], [55,48,'perdidas','p'], [64,52,'perdidas','p'], [34,64,'perdidas','p'], [60,72,'perdidas','p'], [46,46,'perdidas','p'],
];
const GOB_HEAT = [
  ['rgba(183,28,28,.35)',46,52,150], ['rgba(106,76,147,.30)',62,36,130], ['rgba(156,103,0,.30)',28,60,160],
];

function GobVigilancia() {
  const layers = [
    ['maltrato','Maltrato','Ley 14.346 · denuncias',14,true],
    ['zoonosis','Zoonosis','rabia · lepto · hidatidosis',12,true],
    ['brotes','Brotes activos','focos epidemiológicos',6,true],
    ['perdidas','Mascotas perdidas','últimos 30 días',312,false],
  ];
  return (
    <div className="gob" data-screen-label="Gob · Vigilancia (mapa multicapa)">
      <GobRail active="vigilancia" />
      <div className="gob-main">
        <GobTopbar crumbs={['Panel','Vigilancia']} scope="UNIVERSAL">
          <button className="gob-tbtn"><i className="fa fa-clock-o" /> Tiempo real</button>
          <button className="gob-tbtn"><i className="fa fa-download" /> Exportar capa</button>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap">
            <div className="gob-head">
              <div>
                <div className="gob-eyebrow is-danger"><span className="dot" /> Vigilancia epidemiológica · tiempo real</div>
                <h1 className="gob-h1">Mapa de vigilancia</h1>
                <p className="gob-lead">Capas superpuestas de maltrato, zoonosis, brotes y pérdidas sobre la jurisdicción. <b>Encendé y apagá capas</b> para cruzar patrones territoriales.</p>
              </div>
              <div className="sp" />
              <div className="gob-head-actions">
                <a href="#" className="gob-tbtn gob-tbtn--danger"><i className="fa fa-flask" /> Declarar brote</a>
              </div>
            </div>

            <div className="gob-kpis" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
              <div className="gob-kpi-sm" data-tone="danger"><div className="l">Zoonosis activas</div><div className="v">12</div><div className="h">3 rabia · 7 lepto · 2 hidat.</div></div>
              <div className="gob-kpi-sm" data-tone="warn"><div className="l">Brotes en seguimiento</div><div className="v">6</div><div className="h">2 críticos</div></div>
              <div className="gob-kpi-sm"><div className="l">Cobertura antirrábica</div><div className="v">72%</div><div className="h">meta 80%</div></div>
              <div className="gob-kpi-sm" data-tone="blue"><div className="l">Radio de alerta</div><div className="v">5 km</div><div className="h">de cada foco activo</div></div>
            </div>

            <div className="gob-mapwrap">
              <div className="gob-map">
                <span className="gob-map-tag">AMBA · capas activas: maltrato · zoonosis · brotes</span>
                <span className="gob-map-scope"><i className="fa fa-globe" /> UNIVERSAL</span>
                {GOB_HEAT.map((h,i) => <span key={i} className="gob-heat" style={{background:h[0],left:h[1]+'%',top:h[2]+'%',width:h[3],height:h[3],transform:'translate(-50%,-50%)'}} />)}
                {GOB_PINS.filter(p => p[2]!=='perdidas').map((p,i) => (
                  <span key={i} className={'gob-pin'+(p[4]?' is-cluster':'')} data-layer={p[2]} style={{left:p[0]+'%',top:p[1]+'%'}}>
                    <span className="marker">{p[4] ? <b>{p[3]}</b> : <i className={'fa '+(p[2]==='maltrato'?'fa-exclamation':p[2]==='zoonosis'?'fa-stethoscope':'fa-flask')} />}</span>
                  </span>
                ))}
                {GOB_PINS.filter(p => p[2]==='perdidas').map((p,i) => (
                  <span key={'p'+i} className="gob-pin" data-layer="perdidas" style={{left:p[0]+'%',top:p[1]+'%',opacity:.85}}><span className="marker" style={{width:18,height:18}}><i className="fa fa-paw" style={{fontSize:8}} /></span></span>
                ))}
              </div>

              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div className="gob-layers">
                  <div className="gob-layers-head">Capas</div>
                  {layers.map(([id,nm,sub,ct,on]) => (
                    <div key={id} className={'gob-layer'+(on?' is-on':' is-off')} data-layer={id}>
                      <span className="sw" />
                      <div className="bd"><b>{nm}</b><span>{sub}</span></div>
                      <span className="ct">{ct}</span>
                      <span className="tgl" />
                    </div>
                  ))}
                  <div className="gob-layers-foot">Las pérdidas están apagadas por defecto. Encendé la capa para cruzar zonas calientes de extravío con focos sanitarios.</div>
                </div>

                <div className="gob-layers">
                  <div className="gob-map-stat"><div className="n" data-tone="danger">2</div><div className="t">focos críticos dentro de radio de 5 km de zona poblada</div></div>
                  <div className="gob-map-stat" style={{borderBottom:0}}><div className="n">4 h</div><div className="t">última señal · rabia en murciélago, Tigre</div></div>
                </div>
              </div>
            </div>

            <div className="gob-card" style={{marginTop:16}}>
              <div className="gob-card-head"><h3>Focos activos en el mapa</h3><div className="sp" /><a href="#">Ver todos →</a></div>
              {[
                ['BRT-RAB-2026-014','danger','Rabia · murciélago','Tigre','Buenos Aires','crítico','hace 4 h'],
                ['BRT-LP-2026-003','warn','Leptospirosis','La Plata','Buenos Aires','activo','08 may'],
                ['BRT-HID-2026-001','warn','Hidatidosis','Esquel','Chubut','seguimiento','02 may'],
              ].map(b => (
                <div key={b[0]} className="gob-row is-link" style={{gridTemplateColumns:'180px 1fr 200px 110px 90px'}}>
                  <span className="gob-codebadge" data-tone={b[1]}><i className="fa fa-flask" /> {b[0]}</span>
                  <div style={{fontSize:13.5,fontWeight:600}}>{b[2]}</div>
                  <div style={{fontSize:12,color:'var(--g-ink-2)'}}>{b[3]}, <span className="gob-muted">{b[4]}</span></div>
                  <span className="gob-pill" data-tone={b[5]==='crítico'?'danger':'warn'}>{b[5]}</span>
                  <span className="gob-mono gob-muted" style={{fontSize:11}}>{b[6]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GOB · REGLAS POR JURISDICCIÓN
// ============================================================
function GobReglas() {
  const rows = [
    ['CABA','Ciudad Autónoma',true,true,true,'obligatorio'],
    ['Buenos Aires','provincia · 135 partidos',true,true,false,'obligatorio'],
    ['Córdoba','provincia',true,false,true,'recomendado'],
    ['Santa Fe','provincia',true,true,false,'obligatorio'],
    ['Mendoza','provincia',false,true,true,'recomendado'],
    ['Tucumán','provincia',true,false,false,'obligatorio'],
  ];
  return (
    <div className="gob" data-screen-label="Gob · Reglas por jurisdicción">
      <GobRail active="reglas" />
      <div className="gob-main">
        <GobTopbar crumbs={['Regulación','Reglas']} scope="UNIVERSAL">
          <button className="gob-tbtn gob-tbtn--primary"><i className="fa fa-plus" /> Nueva regla</button>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div style={{marginBottom:16}}>
              <div className="gob-eyebrow">Regulación · reglas por jurisdicción</div>
              <h1 className="gob-h1">Reglas</h1>
              <p className="gob-lead">Qué exige cada jurisdicción. Define obligatoriedad de registro, antirrábica, castración y multas. <b>Las localidades heredan de su provincia salvo override.</b></p>
            </div>
            <div className="gob-list">
              <div className="gob-jrow gob-list-head"><div>Jurisdicción</div><div>Registro obligatorio</div><div>Antirrábica anual</div><div>Castración subsid.</div></div>
              {rows.map(r => (
                <div key={r[0]} className="gob-jrow">
                  <div className="prov">{r[0]}<span>{r[1]}</span></div>
                  <div className={'gob-jrule '+(r[2]?'on':'off')}><i className={'fa '+(r[2]?'fa-check-circle':'fa-circle-o')} /> {r[2]?'Obligatorio':'No exigido'}</div>
                  <div className={'gob-jrule '+(r[3]?'on':'off')}><i className={'fa '+(r[3]?'fa-check-circle':'fa-circle-o')} /> {r[3]?'Sí':'No'}</div>
                  <div className={'gob-jrule '+(r[4]?'on':'off')}><i className={'fa '+(r[4]?'fa-check-circle':'fa-circle-o')} /> {r[4]?'Disponible':'No'}</div>
                </div>
              ))}
            </div>
            <div className="gob-panel" style={{marginTop:14,marginBottom:0,borderStyle:'dashed',display:'flex',gap:10,alignItems:'center',fontSize:12,color:'var(--g-mute)'}}>
              <i className="fa fa-info-circle" /><span>Cambiar una regla provincial impacta a todas sus localidades sin override. Cada cambio queda firmado en el audit log.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GOB · CATÁLOGO REGULATORIO (vacunas, razas, especies)
// ============================================================
function GobCatalogo() {
  const cat = [
    ['Antirrábica','vacuna','Obligatoria anual · todas las especies','vigente'],
    ['Quíntuple (DHPPI)','vacuna','Recomendada anual · caninos','vigente'],
    ['Triple felina','vacuna','Recomendada anual · felinos','vigente'],
    ['Leptospirosis','vacuna','Obligatoria en zonas de brote','condicional'],
    ['Pitbull Terrier','raza','Razas con normativa especial (Ley local)','regulada'],
    ['Dogo Argentino','raza','Razas con normativa especial (Ley local)','regulada'],
  ];
  return (
    <div className="gob" data-screen-label="Gob · Catálogo regulatorio">
      <GobRail active="catalogo" />
      <div className="gob-main">
        <GobTopbar crumbs={['Regulación','Catálogo']} scope="UNIVERSAL">
          <button className="gob-tbtn"><i className="fa fa-download" /> Exportar</button>
          <button className="gob-tbtn gob-tbtn--primary"><i className="fa fa-plus" /> Nuevo ítem</button>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div style={{marginBottom:14}}>
              <div className="gob-eyebrow">Regulación · catálogo maestro</div>
              <h1 className="gob-h1">Catálogo regulatorio</h1>
              <p className="gob-lead">El vocabulario controlado del sistema: vacunas del calendario nacional, razas con normativa especial y especies. Lo que ofrece cada formulario sale de acá.</p>
            </div>
            <div className="gob-tabs">
              <button className="gob-tab is-active">Todo <span className="ct">{cat.length}</span></button>
              <button className="gob-tab">Vacunas <span className="ct">4</span></button>
              <button className="gob-tab">Razas reguladas <span className="ct">2</span></button>
              <button className="gob-tab">Especies <span className="ct">5</span></button>
            </div>
            <div className="gob-list">
              <div className="gob-row gob-list-head" style={{gridTemplateColumns:'110px 1fr 130px 18px'}}><div>Tipo</div><div>Ítem</div><div>Estado</div><div></div></div>
              {cat.map(c => (
                <div key={c[0]} className="gob-row is-link" style={{gridTemplateColumns:'110px 1fr 130px 18px'}}>
                  <span className="gob-kindbadge" data-k={c[1]==='vacuna'?'vet':'org'}><i className={'fa '+(c[1]==='vacuna'?'fa-medkit':'fa-paw')} /> {c[1]}</span>
                  <div><div style={{fontSize:13.5,fontWeight:600}}>{c[0]}</div><div style={{fontSize:11.5,color:'var(--g-mute)',marginTop:1}}>{c[2]}</div></div>
                  <span className="gob-pill" data-tone={c[3]==='vigente'?'ok':c[3]==='regulada'?'danger':'warn'}>{c[3]}</span>
                  <i className="fa fa-angle-right gob-muted" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { GobVigilancia, GobReglas, GobCatalogo });
