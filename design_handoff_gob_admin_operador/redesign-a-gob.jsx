// ============================================================
// DIRECCIÓN A — TIER OPERADOR · Shell + Gob parte 1
// Panel de jurisdicción · Cola de solicitudes · Detalle de solicitud
// Estética "Libreta Nacional · Operador". Clases .gob* de redesign-a-gob.css
// ============================================================

// ---------- Shell ----------
function GobRail({ active, admin }) {
  const gob = [
    { lbl:'Operación', items:[
      ['panel','fa-th-large','Panel'],
      ['cola','fa-inbox','Cola',23,'warn'],
      ['vigilancia','fa-stethoscope','Vigilancia',3,'danger'],
      ['casos','fa-folder-open-o','Casos',9],
    ]},
    { lbl:'Regulación', items:[
      ['reglas','fa-balance-scale','Reglas'],
      ['catalogo','fa-archive','Catálogo'],
    ]},
  ];
  const adm = [
    { lbl:'Plataforma', items:[
      ['panel','fa-th-large','Panel'],
      ['equipo','fa-users','Equipo','12/4'],
      ['moderacion','fa-flag-o','Moderación',6,'warn'],
    ]},
    { lbl:'Sistema', items:[
      ['jurisdicciones','fa-map-o','Jurisdicciones'],
      ['sistema','fa-cog','Sistema','outbox 2','danger'],
    ]},
  ];
  const secs = admin ? adm : gob;
  return (
    <aside className="gob-rail">
      <div className="gob-brand">
        <div className="mk">m·</div>
        <div><b>miMAR</b><span>{admin ? 'Plataforma' : 'Gobierno'}</span></div>
      </div>
      <nav className="gob-nav">
        {secs.map(s => (
          <div key={s.lbl} className="gob-nav-sec">
            <div className="lbl">{s.lbl}</div>
            {s.items.map(([id,ic,l,ct,tone]) => (
              <a key={id} href="#" className={'gob-nav-item'+(id===active?' is-active':'')}>
                <i className={'fa '+ic} /><span style={{flex:1}}>{l}</span>
                {ct!==undefined && <span className={'ct'+(tone==='danger'?' is-danger':tone==='warn'?' is-warn':'')}>{ct}</span>}
              </a>
            ))}
          </div>
        ))}
        {admin && (
          <div className="gob-nav-sec">
            <div className="lbl">Cross-portal</div>
            <a href="#" className="gob-nav-item" style={{color:'var(--g-navy-mute)'}}><i className="fa fa-external-link" /><span>Ir a Gobierno</span></a>
          </div>
        )}
      </nav>
      <div className="gob-rail-foot">
        <div className="av">CF</div>
        <div style={{flex:1,minWidth:0}}><b>Dra. Camila Ferrer</b><span>{admin?'ADMIN':'ADMIN'} · Universal</span></div>
      </div>
    </aside>
  );
}
function GobScope({ scope='UNIVERSAL', prov }) {
  return (
    <span className="gob-scope"><i className="fa fa-globe" /><b>{scope}</b><span>·</span>{prov ? <b style={{color:'var(--g-navy-mute)'}}>{prov}</b> : <span>scope</span>}</span>
  );
}
function GobTopbar({ crumbs, scope, prov, children, admin }) {
  return (
    <div className="gob-topbar">
      <div className="gob-crumbs">
        {crumbs.map((c,i) => (
          <React.Fragment key={i}>
            {i>0 && <i className="fa fa-angle-right" />}
            {i===crumbs.length-1 ? (/^(req_|OBS|CAS|DSP|BRT|rep_)/.test(c) ? <b className="mono">{c}</b> : <b>{c}</b>) : <span>{c}</span>}
          </React.Fragment>
        ))}
      </div>
      {admin ? <span className="gob-scope" style={{background:'var(--g-danger)'}}><i className="fa fa-shield" /><b>SUPERADMIN</b></span> : <GobScope scope={scope} prov={prov} />}
      <div className="sp" />
      {children}
    </div>
  );
}

// ---------- Datos compartidos del console ----------
window.GOB_AUDIT = [
  ['Vos','Aprobaste matrícula MP-8421 · Vet. del Sur','hoy · 09:42'],
  ['Lic. Ariel Bustos (CABA)','Rechazó verificación de “Patitas Felices”','hoy · 08:11'],
  ['Sistema','Cerró automáticamente OBS-RAB-2581 (10 días sin síntomas)','ayer · 23:00'],
  ['Dra. Liliana Pérez (PBA)','Asignó disputa DSP-2026-0017 a sí misma','ayer · 19:14'],
  ['Vos','Cerraste brote BRT-LP-2026-002 · Leptospirosis · La Plata','21/05 · 15:22'],
  ['Lic. Ariel Bustos (CABA)','Suspendió organización “Mascotas Rescate Sur”','20/05 · 11:08'],
];
window.GOB_CASES = [
  ['OBS-RAB-2604','danger','Observación antirrábica','open','Belgrano','CABA','15 may','Pampa','fa-stethoscope'],
  ['CAS-MALT-117','danger','Maltrato físico','escalated','Barracas','CABA','12 may',null,'fa-exclamation-triangle'],
  ['DSP-2026-0017','warn','Disputa de custodia','open','Recoleta','CABA','10 may','Lobo','fa-balance-scale'],
  ['BRT-LP-2026-003','warn','Brote · Leptospirosis','open','La Plata','Buenos Aires','08 may',null,'fa-flask'],
  ['OBS-RAB-2589','neutral','Observación antirrábica','triaged','Caballito','CABA','06 may','Tomy','fa-stethoscope'],
  ['CAS-MALT-114','neutral','Negligencia','triaged','San Telmo','CABA','04 may','Bruno','fa-exclamation-triangle'],
  ['CAS-MALT-110','ok','Abandono','closed','Vicente López','Buenos Aires','01 may',null,'fa-exclamation-triangle'],
];

// ============================================================
// GOB · PANEL DE JURISDICCIÓN
// ============================================================
function GobPanel() {
  return (
    <div className="gob" data-screen-label="Gob · Panel de jurisdicción">
      <GobRail active="panel" />
      <div className="gob-main">
        <GobTopbar crumbs={['Panel']} scope="UNIVERSAL">
          <button className="gob-tbtn"><i className="fa fa-search" /> Buscar caso / org / persona</button>
          <button className="gob-tbtn"><i className="fa fa-bell-o" /></button>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap">
            <div className="gob-head">
              <div>
                <div className="gob-eyebrow">miMAR Gobierno · ADMIN · Universal</div>
                <h1 className="gob-h1">Panel de jurisdicción</h1>
                <p className="gob-lead">Vista de superadmin · ves todas las jurisdicciones del país. Los govts ven solamente sus localidades asignadas.</p>
              </div>
              <div className="sp" />
              <div className="gob-head-actions">
                <a href="#" className="gob-tbtn gob-tbtn--primary"><i className="fa fa-inbox" /> Cola de aprobaciones</a>
                <a href="#" className="gob-tbtn gob-tbtn--outline"><i className="fa fa-id-card" /> Habilitación</a>
                <a href="#" className="gob-tbtn gob-tbtn--danger"><i className="fa fa-gavel" /> Acta de infracción</a>
              </div>
            </div>

            <div className="gob-filterbar">
              <div className="gob-ranges">
                {['Hoy','Esta semana','Este mes','Últimos 30 días','Personalizado'].map((r,i) => <button key={r} className={'gob-range'+(i===2?' is-active':'')}>{r}</button>)}
              </div>
              <div className="sp" />
              <div className="gob-fsel"><div className="l">Provincia</div><div className="sel"><span>Todas las provincias</span><i className="fa fa-angle-down" /></div></div>
              <div className="gob-fsel"><div className="l">Localidad</div><div className="sel"><span>Todas</span><i className="fa fa-angle-down" /></div></div>
              <div className="gob-fsel"><div className="l">Tipo</div><div className="sel"><span>Todas las orgs</span><i className="fa fa-angle-down" /></div></div>
            </div>

            <div className="gob-kpis">
              <a href="#" className="gob-kpi" data-tone="ok"><div className="l">Cobertura antirrábica</div><div className="v">72%</div><div className="bar"><span style={{width:'72%'}} /></div><div className="sub">meta 80% · 23 partidos por debajo</div></a>
              <div className="gob-kpi"><div className="l">Esterilizaciones / mes</div><div className="v">1.482</div><div className="delta"><i className="fa fa-arrow-up" /> ↑ 12% <span style={{color:'var(--g-mute)',fontWeight:400}}>vs mes ant.</span></div><div className="sub">58 organizaciones</div></div>
              <div className="gob-kpi" data-tone="warn"><div className="l">Mordeduras / 10k hab.</div><div className="v">2,4</div><div className="delta is-down"><i className="fa fa-arrow-up" /> ↑ 4% <span style={{color:'var(--g-mute)',fontWeight:400}}>vs mes ant.</span></div><div className="sub">812 reportes · 30 días</div></div>
              <a href="#" className="gob-kpi" data-tone="danger"><div className="l">Casos zoonosis activos</div><div className="v">12</div><div className="sub" style={{marginTop:'auto'}}>3 rabia · 7 lepto · 2 hidat.</div></a>
            </div>

            <div className="gob-grid-2-1">
              <div className="gob-col">
                <div className="gob-card">
                  <div className="gob-card-head"><h3>Cola de aprobaciones</h3><div className="sp" /><a href="#">Ver cola →</a></div>
                  <div className="gob-giant">
                    <div className="n">23</div>
                    <div className="meta"><b>solicitudes esperando revisión</b><div className="br"><span>· 14 matrículas veterinarias</span><span>· 6 verificaciones de org</span><span>· 3 credenciales RUPGA</span></div></div>
                  </div>
                </div>

                <div className="gob-card">
                  <div className="gob-card-head"><h3>Actividad reciente</h3><div className="sp" /><a href="#">Ver audit log →</a></div>
                  {window.GOB_AUDIT.map((r,i) => (
                    <div key={i} className={'gob-rowfeed'+(i%2?' alt':'')}>
                      <div><div className="who">{r[0]}</div><div className="what">{r[1]}</div></div>
                      <div className="when">{r[2]}</div>
                    </div>
                  ))}
                </div>

                <div className="gob-card">
                  <div className="gob-card-head"><h3>Casos regulatorios</h3><div className="sp" /><a href="#">Ver todos →</a></div>
                  {window.GOB_CASES.slice(0,5).map(c => (
                    <div key={c[0]} className="gob-row is-link" style={{gridTemplateColumns:'160px 1fr auto 18px'}}>
                      <span className="gob-codebadge" data-tone={c[1]}><i className={'fa '+c[8]} /> {c[0]}</span>
                      <div style={{minWidth:0}}><div style={{fontSize:13,fontWeight:600}}>{c[2]}</div>{c[7] && <div style={{fontSize:11,color:'var(--g-mute)',marginTop:1}}><i className="fa fa-paw" /> {c[7]}</div>}</div>
                      <span className="gob-mono gob-muted" style={{fontSize:11}}>abierto {c[6]}</span>
                      <i className="fa fa-angle-right gob-muted" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="gob-col">
                <div className="gob-card" data-accent="danger"><div className="gob-card-head"><h3>Vigilancia</h3><div className="sp" /><a href="#">Ver →</a></div><div className="gob-astat" data-tone="danger"><div className="n">3</div><div className="t">brotes activos en seguimiento</div><div className="d">Última señal: <b style={{color:'var(--g-ink)'}}>rabia en murciélago</b>, Tigre · hace 4 h.</div></div></div>
                <div className="gob-card" data-accent="warn"><div className="gob-card-head"><h3>Denuncias ciudadanas</h3><div className="sp" /><a href="#">Bandeja →</a></div><div className="gob-astat" data-tone="warn"><div className="n">47</div><div className="t">nuevas · últ. 7 días</div><div className="d">11 maltrato · 9 abandono · 21 negligencia · 6 otros. 18 sin triagear.</div></div></div>
                <div className="gob-card"><div className="gob-card-head"><h3>Pérdidas</h3><div className="sp" /><a href="#">Ver →</a></div><div className="gob-astat"><div className="n">312</div><div className="t">mascotas perdidas registradas</div><div className="d">Drill-down a <code>/p/[token]</code> de cada caso.</div></div></div>
                <div className="gob-panel" style={{borderStyle:'dashed',marginBottom:0}}><div className="gob-sectionlabel" style={{marginBottom:6}}>Vista de superadmin</div><div style={{fontSize:11,color:'var(--g-mute)',lineHeight:1.6}}>Como <b style={{color:'var(--g-ink)'}}>admin</b>, ves KPIs nacionales. Cambiá el filtro de provincia/localidad para enfocar.</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GOB · COLA DE SOLICITUDES (bulk select)
// ============================================================
window.GOB_COLA = [
  ['req_4Kx9pZ','vet','Matrícula veterinaria','Dr. Matías Iglesias','La Plata','Buenos Aires','22 may · 09:14'],
  ['req_2vQ7nM','org','Verificación de organización','Refugio Patitas Felices','Vicente López','Buenos Aires','22 may · 08:31'],
  ['req_8pBwL0','rupga','Credencial RUPGA','Lucía Romero · perra Pampa','Belgrano','CABA','22 may · 07:48'],
  ['req_J3kYqA','vet','Matrícula veterinaria','Dra. Florencia Cabral','Rosario','Santa Fe','21 may · 22:09'],
  ['req_FcLM4w','org','Verificación de organización','Clínica Vet. del Sur','Quilmes','Buenos Aires','21 may · 18:42'],
  ['req_uRpQ2X','vet','Matrícula veterinaria','Dra. Camila Suárez','Córdoba','Córdoba','21 may · 16:11'],
  ['req_g7Yn1S','rupga','Credencial RUPGA','Federico Acosta · perro León','Almagro','CABA','21 may · 14:28'],
  ['req_iEa9Hd','org','Verificación de organización','Red Animalista del Norte','Tucumán','Tucumán','21 may · 11:55'],
  ['req_qXmJ7P','vet','Matrícula veterinaria','Dr. Ramiro Vega','Mar del Plata','Buenos Aires','21 may · 10:02'],
  ['req_Bn4LkV','org','Verificación de organización','Mascotas Rescate Sur','Avellaneda','Buenos Aires','20 may · 22:33'],
];
function GobCola() {
  const sel = [0,2,4];
  const kindLabel = { vet:'Matrículas veterinarias', org:'Verificación de orgs', rupga:'Credenciales RUPGA' };
  const counts = { all: window.GOB_COLA.length, vet:0, org:0, rupga:0 };
  window.GOB_COLA.forEach(r => counts[r[1]]++);
  return (
    <div className="gob" data-screen-label="Gob · Cola de solicitudes">
      <GobRail active="cola" />
      <div className="gob-main">
        <GobTopbar crumbs={['Panel','Cola']} scope="UNIVERSAL">
          <button className="gob-tbtn"><i className="fa fa-filter" /> Filtros</button>
          <button className="gob-tbtn"><i className="fa fa-download" /> Exportar CSV</button>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div style={{marginBottom:14}}>
              <div className="gob-eyebrow">Cola · jurisdicción universal</div>
              <h1 className="gob-h1">Cola de solicitudes</h1>
              <p className="gob-lead"><b>{window.GOB_COLA.length} solicitudes pendientes.</b> Aprobá una a una con el detalle, o marcá varias para decidir en bloque.</p>
            </div>
            <div className="gob-tabs">
              <button className="gob-tab is-active">Todas <span className="ct">{counts.all}</span></button>
              <button className="gob-tab">Matrículas veterinarias <span className="ct">{counts.vet}</span></button>
              <button className="gob-tab">Verificación de orgs <span className="ct">{counts.org}</span></button>
              <button className="gob-tab">Credenciales RUPGA <span className="ct">{counts.rupga}</span></button>
            </div>

            <div className="gob-bulkbar">
              <span className="cnt">{sel.length}</span>
              <b>solicitudes seleccionadas</b>
              <span className="hint">· Aprobá en bloque o pedí razón al rechazar</span>
              <div className="sp" />
              <button className="gob-bulkbtn gob-bulkbtn--ghost"><i className="fa fa-times" /> Cancelar</button>
              <button className="gob-bulkbtn gob-bulkbtn--reject">Rechazar seleccionadas</button>
              <button className="gob-bulkbtn gob-bulkbtn--approve"><i className="fa fa-check" /> Aprobar seleccionadas</button>
            </div>

            <div className="gob-list">
              <div className="gob-row gob-list-head" style={{gridTemplateColumns:'24px 210px 1fr 190px 130px 18px'}}>
                <div></div><div>Tipo</div><div>Aplicante</div><div>Jurisdicción</div><div>Creada</div><div></div>
              </div>
              {window.GOB_COLA.map((r,i) => (
                <div key={r[0]} className={'gob-row is-link'+(sel.includes(i)?' is-sel':'')} style={{gridTemplateColumns:'24px 210px 1fr 190px 130px 18px'}}>
                  <span className={'gob-check'+(sel.includes(i)?' is-on':'')}>{sel.includes(i) && <i className="fa fa-check" />}</span>
                  <span className="gob-kindbadge" data-k={r[1]}><i className={'fa '+(r[1]==='vet'?'fa-id-card':r[1]==='org'?'fa-building-o':'fa-paw')} /> {kindLabel[r[1]]}</span>
                  <div className="gob-applicant"><b>{r[3]}</b><div className="tk">{r[0]}</div></div>
                  <div style={{fontSize:12,color:'var(--g-ink-2)'}}>{r[4]}, <span className="gob-muted">{r[5]}</span></div>
                  <div className="gob-mono gob-muted" style={{fontSize:12}}>{r[6]}</div>
                  <i className="fa fa-angle-right gob-muted" style={{fontSize:12}} />
                </div>
              ))}
            </div>
            <div className="gob-panel" style={{borderStyle:'dashed',marginTop:14,marginBottom:0,display:'flex',gap:10,alignItems:'center',fontSize:11,color:'var(--g-mute)'}}>
              <i className="fa fa-info-circle" /><span>Las solicitudes RUPGA requieren confirmar la matrícula del médico que firmó. Las verificaciones rechazadas se mantienen 90 días en <code className="gob-mono">/gob/cola?status=rejected</code>.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GOB · DETALLE DE SOLICITUD (review + decisión firmada)
// ============================================================
function GobColaDetalle() {
  return (
    <div className="gob" data-screen-label="Gob · Detalle de solicitud">
      <GobRail active="cola" />
      <div className="gob-main">
        <GobTopbar crumbs={['Panel','Cola','req_2vQ7nM']} scope="VICENTE LÓPEZ" prov="Buenos Aires">
          <a href="#" className="gob-tbtn"><i className="fa fa-angle-left" /> Volver a la cola</a>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--narrow">
            <div style={{marginBottom:18}}>
              <div className="gob-eyebrow is-warn" style={{color:'var(--g-warn)'}}><span className="dot" /> Pendiente</div>
              <h1 className="gob-h1 gob-h1--sm">Verificación de organización</h1>
              <div style={{marginTop:8,fontSize:12,color:'var(--g-mute)',display:'flex',gap:14,flexWrap:'wrap',alignItems:'center'}}>
                <span className="gob-mono" style={{color:'var(--g-ink-2)'}}>req_2vQ7nM</span><span>·</span><span>Vicente López, Buenos Aires</span><span>·</span><span>creada 22 may · 08:31</span>
              </div>
            </div>

            <div className="gob-sectionlabel">Aplicante</div>
            <div className="gob-panel">
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:40,height:40,borderRadius:'50%',background:'linear-gradient(135deg,#3a6cb3,#6a4c93)',color:'#fff',display:'grid',placeItems:'center',fontWeight:700,fontSize:14}}>RP</div>
                <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>Refugio Patitas Felices</div><div style={{fontSize:11,color:'var(--g-mute)',marginTop:1}}>Rol actual: <span className="gob-mono" style={{color:'var(--g-ink-2)'}}>owner</span></div></div>
                <a href="#" style={{fontSize:12,color:'var(--g-azul)',fontWeight:600,textDecoration:'none'}}>Ver perfil →</a>
              </div>
            </div>

            <div className="gob-sectionlabel">Organización a verificar</div>
            <div className="gob-panel">
              <div className="gob-defgrid">
                <div className="gob-def"><div className="k">Nombre legal</div><div className="v">Asoc. Civ. Patitas Felices</div></div>
                <div className="gob-def"><div className="k">Razón social</div><div className="v">Refugio Patitas Felices</div></div>
                <div className="gob-def"><div className="k">CUIT</div><div className="v mono">30-71234567-8</div></div>
                <div className="gob-def"><div className="k">Tipo</div><div className="v mono">shelter</div></div>
              </div>
              <div className="gob-verify"><i className="fa fa-search" /><span>Verificá el CUIT en <a href="#">AFIP →</a> y la inscripción en <a href="#">Registro de Asoc. Civiles PBA →</a></span></div>
            </div>

            <div className="gob-sectionlabel">Payload</div>
            <div className="gob-panel" style={{padding:0,border:0}}>
              <pre className="gob-json">{`{
  "kind": "organization_verification",
  "applicantId": "usr_8Kx9pZqL",
  "applicantRole": "owner",
  "jurisdiction": {
    "country": "AR",
    "province": "Buenos Aires",
    "locality": "Vicente López"
  },
  "payload": {
    "legalName": "Asoc. Civ. Patitas Felices",
    "taxId": "30-71234567-8",
    "orgType": "shelter"
  },
  "createdAt": "2026-05-22T11:31:14Z",
  "status": "pending"
}`}</pre>
            </div>

            <div className="gob-sectionlabel">Decidir</div>
            <div className="gob-panel">
              <div className="gob-infobox"><i className="fa fa-info-circle" /> Tu decisión queda firmada con tu cuenta. Si rechazás, agregá una razón clara — el aplicante la recibe por mail.</div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:600,marginBottom:4}}>Notas internas <span className="gob-muted" style={{fontWeight:400}}>(opcional · solo visible para govts)</span></div>
                <textarea className="gob-textarea" rows="3" defaultValue="CUIT verificado en AFIP. Personería jurídica en orden. Aprobar." />
              </div>
              <div className="gob-decide-actions">
                <button className="gob-dbtn gob-dbtn--reject"><i className="fa fa-times" /> Rechazar</button>
                <button className="gob-dbtn gob-dbtn--approve"><i className="fa fa-check" /> Aprobar</button>
              </div>
            </div>
            <div className="gob-audit"><i className="fa fa-eye" /> request_viewed → audit_log (Dra. Camila Ferrer · req_2vQ7nM)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { GobRail, GobTopbar, GobScope, GobPanel, GobCola, GobColaDetalle });
