// ============================================================
// DIRECCIÓN A — Organización / Refugio (back-office)
// Tier Operador (azul-marino). Reusa clases .gob* + .org* específicas.
// Dashboard · Mis mascotas · Adopciones (pipeline) · Agenda · Equipo
// ============================================================

function OrgRail({ active }) {
  const secs = [
    { lbl:'Operación', items:[
      ['panel','fa-th-large','Panel'],
      ['mascotas','fa-paw','Mascotas',38],
      ['adopciones','fa-inbox','Adopciones',12,'warn'],
      ['agenda','fa-calendar-o','Agenda'],
    ]},
    { lbl:'Organización', items:[
      ['equipo','fa-users','Equipo'],
      ['servicios','fa-stethoscope','Servicios'],
    ]},
  ];
  return (
    <aside className="gob-rail">
      <div className="gob-brand">
        <div className="mk" style={{background:'#5FD0B0',color:'#073A33'}}>R</div>
        <div><b>Belgrano R</b><span>Organización</span></div>
      </div>
      <nav className="gob-nav">
        {secs.map(s => (
          <div key={s.lbl} className="gob-nav-sec">
            <div className="lbl">{s.lbl}</div>
            {s.items.map(([id,ic,l,ct,tone]) => (
              <a key={id} href="#" className={'gob-nav-item'+(id===active?' is-active':'')}>
                <i className={'fa '+ic} /><span style={{flex:1}}>{l}</span>
                {ct!==undefined && <span className={'ct'+(tone==='warn'?' is-warn':'')}>{ct}</span>}
              </a>
            ))}
          </div>
        ))}
        <div className="gob-nav-sec"><div className="lbl">Cross-portal</div><a href="#" className="gob-nav-item" style={{color:'var(--g-navy-mute)'}}><i className="fa fa-exchange" /><span>Cambiar de org</span></a></div>
      </nav>
      <div className="gob-rail-foot">
        <div className="av" style={{background:'linear-gradient(135deg,#2f9e84,#1d6b58)'}}>VM</div>
        <div style={{flex:1,minWidth:0}}><b>Valeria Méndez</b><span>COORDINADORA</span></div>
      </div>
    </aside>
  );
}
function OrgTopbar({ crumbs, children }) {
  return (
    <div className="gob-topbar">
      <div className="gob-crumbs">{crumbs.map((c,i) => (<React.Fragment key={i}>{i>0 && <i className="fa fa-angle-right" />}{i===crumbs.length-1 ? <b>{c}</b> : <span>{c}</span>}</React.Fragment>))}</div>
      <span className="gob-scope" style={{background:'#0B3B42'}}><i className="fa fa-building-o" /><b>BELGRANO R</b><span>·</span><span style={{textTransform:'none',letterSpacing:0}}>CABA · verificada</span></span>
      <div className="sp" />
      {children}
    </div>
  );
}

// ============================================================
// ORG · PANEL
// ============================================================
function OrgPanel() {
  return (
    <div className="gob is-org" data-screen-label="Org · Panel del refugio">
      <OrgRail active="panel" />
      <div className="gob-main">
        <OrgTopbar crumbs={['Panel']}>
          <button className="gob-tbtn"><i className="fa fa-search" /> Buscar mascota / postulante</button>
          <button className="gob-tbtn"><i className="fa fa-bell-o" /></button>
        </OrgTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div className="gob-head">
              <div>
                <div className="gob-eyebrow">Refugio Belgrano R · CABA · verificada</div>
                <h1 className="gob-h1">Buen día, Valeria</h1>
                <p className="gob-lead">38 mascotas en adopción · <b>12 postulaciones</b> esperan respuesta · 3 turnos hoy.</p>
              </div>
              <div className="sp" />
              <div className="gob-head-actions">
                <a href="#" className="gob-tbtn gob-tbtn--primary"><i className="fa fa-plus" /> Publicar mascota</a>
                <a href="#" className="gob-tbtn gob-tbtn--outline"><i className="fa fa-inbox" /> Ver adopciones</a>
              </div>
            </div>

            <div className="gob-kpis">
              <div className="gob-kpi"><div className="l">En adopción</div><div className="v">38</div><div className="sub" style={{marginTop:'auto'}}>33 publicadas · 5 pausadas</div></div>
              <a href="#" className="gob-kpi" data-tone="warn"><div className="l">Postulaciones nuevas</div><div className="v">12</div><div className="sub" style={{marginTop:'auto'}}>4 sin leer · 2 entrevistas hoy</div></a>
              <div className="gob-kpi" data-tone="ok"><div className="l">Adopciones (mes)</div><div className="v">9</div><div className="delta"><i className="fa fa-arrow-up" /> ↑ 2 vs mes ant.</div></div>
              <div className="gob-kpi"><div className="l">En tránsito</div><div className="v">7</div><div className="sub" style={{marginTop:'auto'}}>en 5 hogares voluntarios</div></div>
            </div>

            <div className="gob-grid-2-1">
              <div className="gob-col">
                <div className="gob-card">
                  <div className="gob-card-head"><h3>Postulaciones a revisar</h3><div className="sp" /><a href="#">Ver todas →</a></div>
                  {[
                    ['Mora','Camila Rodríguez','Casa con patio · experiencia previa','hace 2 h','alta'],
                    ['Nacho','Pablo Giménez','Departamento · primera vez','hace 5 h','media'],
                    ['Kira','Flia. Suárez','Casa · 2 perros · corre a diario','ayer','alta'],
                    ['Orson','Lucía Paz','Casa con patio grande','ayer','alta'],
                  ].map((p,i) => (
                    <div key={i} className="gob-row is-link" style={{gridTemplateColumns:'26px 1fr auto 18px'}}>
                      <span style={{width:26,height:26,borderRadius:6,background:'repeating-linear-gradient(135deg,#e2e7ea 0 5px,#eef1f3 5px 10px)'}} />
                      <div style={{minWidth:0}}><div style={{fontSize:13,fontWeight:600}}><span style={{fontFamily:'var(--g-serif)'}}>{p[0]}</span> · {p[1]}</div><div style={{fontSize:11.5,color:'var(--g-mute)',marginTop:1}}>{p[2]}</div></div>
                      <span className="gob-pill" data-tone={p[4]==='alta'?'ok':'warn'}>{p[4]==='alta'?'Buen match':'A revisar'}</span>
                      <i className="fa fa-angle-right gob-muted" />
                    </div>
                  ))}
                </div>
                <div className="gob-card">
                  <div className="gob-card-head"><h3>Agenda de hoy</h3><div className="sp" /><a href="#">Ver agenda →</a></div>
                  {[
                    ['09:30','vet','Control post-castración · Pelusa','Dra. Romero'],
                    ['11:00','adopcion','Entrevista de adopción · Mora','Camila Rodríguez'],
                    ['16:00','visita','Visita de seguimiento · Toby','Flia. Acosta'],
                  ].map((a,i) => (
                    <div key={i} className="gob-row" style={{gridTemplateColumns:'56px 1fr auto'}}>
                      <span className="gob-mono" style={{fontSize:12,fontWeight:700}}>{a[0]}</span>
                      <div><div style={{fontSize:13,fontWeight:600}}>{a[2]}</div><div style={{fontSize:11,color:'var(--g-mute)',fontFamily:'var(--g-mono)'}}>{a[3]}</div></div>
                      <span className="gob-pill" data-tone={a[1]==='vet'?'triaged':a[1]==='adopcion'?'progress':'warn'}>{a[1]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="gob-col">
                <div className="gob-card" data-accent="warn"><div className="gob-card-head"><h3>Requiere atención</h3></div><div className="gob-astat" data-tone="warn"><div className="n">3</div><div className="t">mascotas con vacuna por vencer</div><div className="d">Pelusa, Orson y Kira · antirrábica vence este mes.</div></div></div>
                <div className="gob-card"><div className="gob-card-head"><h3>Equipo activo</h3><div className="sp" /><a href="#">Ver →</a></div><div className="gob-astat"><div className="n">9</div><div className="t">voluntarios · 5 hogares de tránsito</div><div className="d">2 invitaciones pendientes de aceptar.</div></div></div>
                <div className="gob-panel" style={{borderStyle:'dashed',marginBottom:0}}><div className="gob-sectionlabel" style={{marginBottom:6}}>Estado de verificación</div><div style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}><span className="gob-pill" data-tone="ok"><i className="fa fa-check-circle" /> Verificada</span><span className="gob-muted">por GCBA · vence 12/2026</span></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ORG · MIS MASCOTAS (gestión de adopción)
// ============================================================
function OrgMascotas() {
  const pets = [
    ['MORA','Mora','Mestiza · H · 2a','published',14,'3 postulaciones'],
    ['PELU','Pelusa','Mestiza · H · 3a','published',8,'1 postulación'],
    ['ORSO','Orson','Mastín · M · 4a','published',22,'5 postulaciones'],
    ['KIRA','Kira','Galga · H · 5a','paused',5,'pausada'],
    ['SIMB','Simba','Mestizo · M · 1a','draft',0,'borrador'],
    ['NINA','Nina','Siamesa · H · 2a','adopted',0,'adoptada 02/06'],
  ];
  return (
    <div className="gob is-org" data-screen-label="Org · Mis mascotas">
      <OrgRail active="mascotas" />
      <div className="gob-main">
        <OrgTopbar crumbs={['Mascotas']}>
          <button className="gob-tbtn"><i className="fa fa-filter" /> Filtros</button>
          <button className="gob-tbtn gob-tbtn--primary"><i className="fa fa-plus" /> Publicar mascota</button>
        </OrgTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div style={{marginBottom:14}}>
              <div className="gob-eyebrow">Gestión de adopción</div>
              <h1 className="gob-h1">Mis mascotas</h1>
              <p className="gob-lead">Publicá, pausá o marcá como adoptada. <b>33 publicadas · 5 pausadas · 1 borrador.</b></p>
            </div>
            <div className="gob-tabs">
              <button className="gob-tab is-active">Todas <span className="ct">38</span></button>
              <button className="gob-tab">Publicadas <span className="ct">33</span></button>
              <button className="gob-tab" data-tone="warn">Pausadas <span className="ct">5</span></button>
              <button className="gob-tab">Borradores <span className="ct">1</span></button>
              <button className="gob-tab">Adoptadas <span className="ct">204</span></button>
            </div>
            <div className="org-petgrid">
              {pets.map(p => (
                <div key={p[1]} className="org-petcard">
                  <div className="org-petcard-top">
                    <div className="org-petcard-photo">{p[0]}</div>
                    <div className="org-petcard-body">
                      <div className="org-petcard-name">{p[1]}<span className="org-statebadge" data-s={p[3]}>{p[3]==='published'?'Publicada':p[3]==='paused'?'Pausada':p[3]==='draft'?'Borrador':'Adoptada'}</span></div>
                      <div className="org-petcard-breed">{p[2]}</div>
                      <div className="org-petcard-meta">
                        {p[3]==='published' && <span className="gob-pill" data-tone="triaged"><i className="fa fa-eye" /> {p[4]} vistas</span>}
                        {p[5] && <span className="gob-pill" data-tone={p[3]==='adopted'?'progress':p[3]==='published'?'ok':'neutral'}>{p[5]}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="org-petcard-foot">
                    {p[3]==='published' && <><button className="org-actbtn"><i className="fa fa-pause" /> Pausar</button><div className="sp" /><button className="org-actbtn org-actbtn--ok"><i className="fa fa-check" /> Marcar adoptada</button></>}
                    {p[3]==='paused' && <><button className="org-actbtn org-actbtn--primary"><i className="fa fa-play" /> Reanudar</button><div className="sp" /><button className="org-actbtn">Editar</button></>}
                    {p[3]==='draft' && <><button className="org-actbtn org-actbtn--primary"><i className="fa fa-upload" /> Publicar</button><div className="sp" /><button className="org-actbtn">Editar</button></>}
                    {p[3]==='adopted' && <><span className="stat"><i className="fa fa-heart" style={{color:'var(--g-viol)'}} /> Encontró familia</span><div className="sp" /><button className="org-actbtn">Ver ficha</button></>}
                  </div>
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
// ORG · ADOPCIONES (pipeline)
// ============================================================
function OrgAdopciones() {
  const cols = [
    ['nueva','Nuevas',4,[['Mora','Camila Rodríguez','Casa c/ patio · exp. previa','hace 2 h','alta'],['Orson','Lucía Paz','Casa patio grande','hace 6 h','alta']]],
    ['revision','En revisión',3,[['Nacho','Pablo Giménez','Depto · primera vez','ayer','media'],['Frida','Marta Ruiz','Depto · tiene gato','ayer','media']]],
    ['entrevista','Entrevista',3,[['Kira','Flia. Suárez','Casa · 2 perros','mañana 11h','alta'],['Pelusa','Diego Mora','Casa c/ patio','vie 16h','alta']]],
    ['resuelta','Resueltas',2,[['Nina','Flia. Acosta','Adoptada ✓','02/06',''],['Toby','Sol Vera','Adoptada ✓','28/05','']]],
  ];
  return (
    <div className="gob is-org" data-screen-label="Org · Adopciones (pipeline)">
      <OrgRail active="adopciones" />
      <div className="gob-main">
        <OrgTopbar crumbs={['Adopciones']}>
          <button className="gob-tbtn"><i className="fa fa-filter" /> Filtros</button>
          <button className="gob-tbtn"><i className="fa fa-download" /> Exportar</button>
        </OrgTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap">
            <div style={{marginBottom:14}}>
              <div className="gob-eyebrow">Postulaciones recibidas</div>
              <h1 className="gob-h1">Adopciones</h1>
              <p className="gob-lead">Seguí cada postulación por etapa. Arrastrá entre columnas para avanzar el proceso. <b>12 activas.</b></p>
            </div>
            <div className="org-pipe">
              {cols.map(col => (
                <div key={col[0]} className="org-pipe-col">
                  <div className="org-pipe-head" data-stage={col[0]}><span className="dot" /><b>{col[1]}</b><span className="ct">{col[2]}</span></div>
                  <div className="org-pipe-body">
                    {col[3].map((a,i) => (
                      <div key={i} className="org-appcard">
                        <div className="pet"><span className="av" /><b>{a[0]}</b></div>
                        <div className="who">{a[1]}</div>
                        <div className="meta">{a[2]}</div>
                        <div className="foot"><span className="when">{a[3]}</span><span className="sp" />{a[4] && <span className={'match'+(a[4]==='media'?' mid':'')}>{a[4]==='alta'?'★ buen match':'match medio'}</span>}{col[0]==='resuelta' && <span className="gob-pill" data-tone="ok">✓</span>}</div>
                      </div>
                    ))}
                  </div>
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
// ORG · AGENDA
// ============================================================
function OrgAgenda() {
  const hours = [
    ['08:00',[]],
    ['09:00',[['09:30','vet','Control post-castración · Pelusa','Dra. Romero']]],
    ['10:00',[]],
    ['11:00',[['11:00','adopcion','Entrevista de adopción · Mora','Camila Rodríguez']]],
    ['12:00',[]],
    ['14:00',[['14:30','castracion','Castración · Simba + Nina','Quirófano 1']]],
    ['16:00',[['16:00','visita','Visita de seguimiento · Toby','Flia. Acosta']]],
    ['17:00',[]],
  ];
  return (
    <div className="gob is-org" data-screen-label="Org · Agenda">
      <OrgRail active="agenda" />
      <div className="gob-main">
        <OrgTopbar crumbs={['Agenda']}>
          <button className="gob-tbtn"><i className="fa fa-list" /> Vista semana</button>
          <button className="gob-tbtn gob-tbtn--primary"><i className="fa fa-plus" /> Nuevo turno</button>
        </OrgTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div style={{marginBottom:14}}>
              <div className="gob-eyebrow">Turnos y actividades</div>
              <h1 className="gob-h1">Agenda</h1>
            </div>
            <div className="org-daybar">
              <button className="nav"><i className="fa fa-angle-left" /></button>
              <div className="today">Lunes 9 de junio<span>4 turnos</span></div>
              <button className="nav"><i className="fa fa-angle-right" /></button>
              <div className="org-daypills">
                {[['LUN','9',true],['MAR','10',false],['MIÉ','11',false],['JUE','12',false],['VIE','13',false]].map((d,i) => (
                  <div key={i} className={'org-daypill'+(d[2]?' is-active':'')}><div className="d">{d[0]}</div><div className="n">{d[1]}</div>{(i<4) && <div className="dot" />}</div>
                ))}
              </div>
            </div>
            <div className="org-agenda">
              {hours.map(([h,appts],i) => (
                <React.Fragment key={i}>
                  <div className="org-agenda-hour">{h}</div>
                  <div className="org-agenda-slot">
                    {appts.map((a,j) => (
                      <div key={j} className="org-appt" data-t={a[1]}><span className="tm">{a[0]}</span><div className="bd"><b>{a[2]}</b></div><span className="pers">{a[3]}</span></div>
                    ))}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ORG · EQUIPO
// ============================================================
function OrgEquipo() {
  const team = [
    ['VM','Valeria Méndez','valeria.m','admin','Coordinadora','activo'],
    ['DR','Dra. Lucía Romero','lucia.romero','vet','Veterinaria de planta','activo'],
    ['MA','Martín Acosta','martin.a','transito','Hogar de tránsito (2 activos)','activo'],
    ['SP','Sofía Paz','sofia.paz','voluntario','Voluntaria · eventos','activo'],
    ['JL','Julián Leiva','julian.l','voluntario','Voluntario · paseos','invitado'],
  ];
  return (
    <div className="gob is-org" data-screen-label="Org · Equipo">
      <OrgRail active="equipo" />
      <div className="gob-main">
        <OrgTopbar crumbs={['Equipo']}>
          <button className="gob-tbtn gob-tbtn--primary"><i className="fa fa-user-plus" /> Invitar miembro</button>
        </OrgTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div style={{marginBottom:14}}>
              <div className="gob-eyebrow">Voluntarios y planta</div>
              <h1 className="gob-h1">Equipo</h1>
              <p className="gob-lead">Coordinadores, veterinarios, hogares de tránsito y voluntarios. <b>9 activos · 2 invitaciones pendientes.</b></p>
            </div>
            <div className="gob-kpis" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
              <div className="gob-kpi-sm"><div className="l">Activos</div><div className="v">9</div><div className="h">en 4 roles</div></div>
              <div className="gob-kpi-sm" data-tone="ok"><div className="l">Hogares de tránsito</div><div className="v">5</div><div className="h">7 mascotas alojadas</div></div>
              <div className="gob-kpi-sm" data-tone="blue"><div className="l">Veterinarios</div><div className="v">2</div><div className="h">de planta</div></div>
              <div className="gob-kpi-sm" data-tone="warn"><div className="l">Invitaciones</div><div className="v">2</div><div className="h">pendientes de aceptar</div></div>
            </div>
            <div className="gob-card">
              <div className="gob-card-head"><h3>Miembros</h3><div className="sp" /><a href="#">Gestionar roles →</a></div>
              {team.map(m => (
                <div key={m[2]} className="gob-member" style={{gridTemplateColumns:'34px 1fr auto auto'}}>
                  <div className="av">{m[0]}</div>
                  <div className="nm"><b>{m[1]}</b><span>{m[4]}</span></div>
                  <span className="org-rolepill" data-r={m[3]}>{m[3]==='admin'?'Coordinación':m[3]==='vet'?'Veterinaria':m[3]==='transito'?'Tránsito':'Voluntario'}</span>
                  <span className="gob-pill" data-tone={m[5]==='activo'?'ok':'warn'}>{m[5]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OrgPanel, OrgMascotas, OrgAdopciones, OrgAgenda, OrgEquipo });
