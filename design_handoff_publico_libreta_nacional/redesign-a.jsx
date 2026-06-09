// ============================================================
// DIRECCIÓN A — "Libreta Nacional" · pantallas
// Inicio · Mis Mascotas · Perfil · Libreta/Historial (+ mobile)
// Markup HTML semántico con clases .dirA* de redesign-a.css
// ============================================================

// ---- Datos de muestra compartidos ----
window.MIMAR = window.MIMAR || {
  owner: { name: 'Martín', full: 'Martín Quiroga', initials: 'MQ', email: 'martin.q@correo.ar', loc: 'San Isidro · Buenos Aires' },
  pets: [
    { id:'pampa', name:'Pampa', breed:'Mestiza · 4 años · Hembra', species:'Canina', st:'ok',
      next:{ ico:'fa-syringe fa-medkit', txt:'Antirrábica al día · próx. may 2027', tone:'' } },
    { id:'boris', name:'Boris', breed:'Europeo común · 7 años · Macho', species:'Felina', st:'sick',
      next:{ ico:'fa-eyedropper', txt:'Apoquel — día 4 de 14', tone:'warn' }, flag:'EN TRATAMIENTO' },
    { id:'tomas', name:'Tomás', breed:'Caniche · 2 años · Macho', species:'Canina', st:'lost',
      next:{ ico:'fa-map-marker', txt:'3 avistamientos · LOST activo', tone:'err' }, flag:'PERDIDO' },
    { id:'luna', name:'Luna', breed:'Labradora · 3 años · Hembra', species:'Canina', st:'pregnant',
      next:{ ico:'fa-heartbeat', txt:'Gestación · semana 6 de 9', tone:'' }, flag:'PREÑADA' },
  ],
};

function AMast({ active }) {
  const items = [['inicio','Inicio'],['mascotas','Mis Mascotas'],['libretas','Libretas'],['turnos','Turnos'],['cuenta','Cuenta']];
  return (
    <header className="dirA-masthead">
      <div className="dirA-crest">m</div>
      <div className="dirA-wordmark"><b>miMAR</b><span>Registro Nacional · Mi Mascota Argentina</span></div>
      <nav className="dirA-mast-nav">
        {items.map(([id,l]) => <a key={id} href="#" className={id===active?'is-active':''}>{l}</a>)}
      </nav>
      <div className="dirA-mast-right">
        <div className="dirA-mast-bell"><i className="fa fa-bell-o" /><b>3</b></div>
        <div className="dirA-mast-user"><div className="dirA-mast-avatar">MQ</div><span>Martín Q.</span></div>
      </div>
    </header>
  );
}

function APhoto({ st, name, lg }) {
  return (
    <div className={'dirA-photo' + (lg ? ' dirA-photo--lg' : '')} data-st={st}>
      <span className="cap">{name}</span>
    </div>
  );
}

// ---------- INICIO ----------
function AInicio() {
  const P = window.MIMAR;
  return (
    <div className="dirA" data-screen-label="A · Inicio">
      <div className="dirA-guilloche" />
      <AMast active="inicio" />
      <div className="dirA-subbar">
        <span className="dirA-crumbs">Inicio</span>
        <span className="dirA-doccode">TITULAR · DNI 30.114.882 · 4 asientos activos</span>
      </div>
      <div className="dirA-body">
        <div className="dirA-doc">

          <div className="dirA-greet">
            <div>
              <h1>Buen día, {P.owner.name}.</h1>
              <p>Tenés <b>2 vencimientos próximos</b> y un caso abierto que requiere atención.</p>
            </div>
            <div className="dirA-datestamp">
              <div>SÁB · 07 JUN 2026</div>
              <div><b>{P.owner.loc}</b></div>
            </div>
          </div>

          {/* Asentar en libreta */}
          <div className="dirA-capture">
            <div className="dirA-capture-head">
              <div className="ico"><i className="fa fa-pencil-square-o" /></div>
              <div>
                <h3>Asentar un hecho en la libreta</h3>
                <span>Escribí en lenguaje natural — abrimos el formulario que corresponda.</span>
              </div>
            </div>
            <div className="dirA-capture-field">
              <i className="fa fa-feed" />
              <input placeholder="Ej.: «Pampa pesó 27,4 kg hoy» o «Boris vomitó dos veces»" defaultValue="" />
              <button className="dirA-btn-asentar"><i className="fa fa-arrow-right" /> Asentar</button>
            </div>
            <div className="dirA-capture-pets">
              <span className="lbl">Asunto</span>
              {P.pets.map((p,i) => (
                <button key={p.id} className={'dirA-petpill' + (i===0?' is-active':'')}>
                  <span className="dirA-petdot" data-st={p.st} /> {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="dirA-grid2">
            {/* IZQUIERDA — registro de mascotas */}
            <div>
              <div className="dirA-sec">
                <span className="n">01</span><h2>Mis mascotas</h2>
                <span className="meta">{P.pets.length} inscriptas · <a href="#">ver todas →</a></span>
              </div>
              <div className="dirA-registry">
                {P.pets.map(p => (
                  <a key={p.id} className="dirA-reg-row" data-st={p.st} href="#">
                    <APhoto st={p.st} name={p.name.slice(0,4).toUpperCase()} />
                    <div>
                      <div className="dirA-reg-name">
                        {p.name}
                        {p.flag && <span className={'dirA-flag dirA-flag--'+(p.st==='lost'?'lost':p.st==='sick'?'sick':'preg')}>{p.flag}</span>}
                      </div>
                      <div className="dirA-reg-breed">{p.breed}</div>
                      <div className="dirA-reg-next" style={p.next.tone==='err'?{color:'var(--a-err)'}:p.next.tone==='warn'?{color:'var(--a-warn)'}:{}}>
                        <i className={'fa '+p.next.ico} /> {p.next.txt}
                      </div>
                    </div>
                    <span className="dirA-reg-go">{p.species} <i className="fa fa-angle-right" /></span>
                  </a>
                ))}
              </div>
            </div>

            {/* DERECHA — vencimientos + turnos + casos */}
            <div style={{display:'flex',flexDirection:'column',gap:20}}>
              <div className="dirA-card">
                <div className="dirA-card-head"><h3>Vencimientos</h3><span className="dirA-label">2 próximos</span></div>
                <div className="dirA-card-body">
                  <div className="dirA-due">
                    <span className="dirA-due-mark" />
                    <div className="dirA-due-body"><div className="dirA-due-title">Antipulgas · Pampa</div><div className="dirA-due-meta">Bravecto — programable desde Libreta</div></div>
                    <span className="dirA-due-when">en 8 días</span>
                  </div>
                  <div className="dirA-due">
                    <span className="dirA-due-mark is-over" />
                    <div className="dirA-due-body"><div className="dirA-due-title">Refuerzo quíntuple · Luna</div><div className="dirA-due-meta">Vencida — coordinar con veterinaria</div></div>
                    <span className="dirA-due-when" style={{color:'var(--a-err)'}}>−5 días</span>
                  </div>
                </div>
              </div>

              <div className="dirA-card">
                <div className="dirA-card-head"><h3>Próximos turnos</h3><span className="dirA-label">agenda</span></div>
                <div className="dirA-card-body">
                  <div className="dirA-appt">
                    <div className="dirA-datechip"><div className="mo">JUN</div><div className="d">14</div></div>
                    <div className="dirA-appt-body"><div className="dirA-appt-title">Antirrábica · Pampa</div><div className="dirA-appt-meta">Vet. Belgrano · 09:00</div></div>
                  </div>
                  <div className="dirA-appt">
                    <div className="dirA-datechip"><div className="mo">JUL</div><div className="d">02</div></div>
                    <div className="dirA-appt-body"><div className="dirA-appt-title">Control · Boris</div><div className="dirA-appt-meta">Vet. Belgrano · 10:30</div></div>
                  </div>
                </div>
              </div>

              <div className="dirA-card">
                <div className="dirA-card-head"><h3>Casos abiertos</h3><span className="dirA-label">2</span></div>
                <div className="dirA-card-body">
                  <div className="dirA-case">
                    <div className="dirA-case-ico is-danger"><i className="fa fa-compass" /></div>
                    <div className="dirA-case-body"><div className="dirA-case-title">Tomás está perdido</div><div className="dirA-case-sub">CAS-2026-0148 · 3 avistamientos</div></div>
                    <span className="dirA-case-when">hace 4h</span>
                  </div>
                  <div className="dirA-case">
                    <div className="dirA-case-ico is-info"><i className="fa fa-envelope-o" /></div>
                    <div className="dirA-case-body"><div className="dirA-case-title">Postulación · adopción</div><div className="dirA-case-sub">POST-2026-0091 · esperando entrevista</div></div>
                    <span className="dirA-case-when">hace 2d</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="dirA-foot">
            <span>Documento sincronizado · última actualización hace 4 min</span>
            <span>miMAR · Registro Nacional de Mascotas</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- MIS MASCOTAS ----------
function AMascotas() {
  const P = window.MIMAR;
  return (
    <div className="dirA" data-screen-label="A · Mis Mascotas">
      <div className="dirA-guilloche" />
      <AMast active="mascotas" />
      <div className="dirA-subbar">
        <span className="dirA-crumbs">Inicio › <b>Mis Mascotas</b></span>
        <span className="dirA-doccode">4 inscriptas · 1 perdida · 1 en tratamiento</span>
      </div>
      <div className="dirA-body">
        <div className="dirA-doc">
          <div className="dirA-greet" style={{marginBottom:18}}>
            <div><h1>Mis mascotas</h1><p>Cada una con su libreta sanitaria nacional.</p></div>
            <div className="dirA-datestamp" style={{borderLeft:'none',paddingLeft:0}}>
              <button className="dirA-btn dirA-btn--primary"><i className="fa fa-plus" /> Inscribir mascota</button>
            </div>
          </div>

          <div className="dirA-registry" style={{marginBottom:24}}>
            {P.pets.map(p => (
              <a key={p.id} className="dirA-reg-row" data-st={p.st} href="#" style={{gridTemplateColumns:'72px 1fr auto', padding:'18px 20px'}}>
                <APhoto st={p.st} name={p.name.slice(0,4).toUpperCase()} />
                <div>
                  <div className="dirA-reg-name" style={{fontSize:20}}>
                    {p.name}
                    {p.flag
                      ? <span className={'dirA-flag dirA-flag--'+(p.st==='lost'?'lost':p.st==='sick'?'sick':'preg')}>{p.flag}</span>
                      : <span className="dirA-flag dirA-flag--ok">AL DÍA</span>}
                  </div>
                  <div className="dirA-reg-breed">{p.breed} · {p.species}</div>
                  <div className="dirA-reg-next" style={p.next.tone==='err'?{color:'var(--a-err)'}:p.next.tone==='warn'?{color:'var(--a-warn)'}:{}}>
                    <i className={'fa '+p.next.ico} /> {p.next.txt}
                  </div>
                </div>
                <span className="dirA-reg-go">Abrir libreta <i className="fa fa-angle-right" /></span>
              </a>
            ))}
          </div>

          <div className="dirA-sec"><span className="n">†</span><h2>In memoriam</h2><span className="meta">1 recordada</span></div>
          <a className="dirA-reg-row" href="#" style={{border:'1px solid var(--a-line)',borderRadius:4,background:'#faf8f4',gridTemplateColumns:'64px 1fr auto'}}>
            <div className="dirA-photo" style={{filter:'grayscale(1) sepia(.2)'}}><span className="cap">FIDEL</span></div>
            <div><div className="dirA-reg-name" style={{color:'#5d5240'}}>Fidel</div><div className="dirA-reg-breed">Ovejero · 2009–2024 · vivió 15 años</div></div>
            <span className="dirA-reg-go">Ver memorial <i className="fa fa-angle-right" /></span>
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------- PERFIL ----------
function APerfil() {
  return (
    <div className="dirA" data-screen-label="A · Perfil de mascota">
      <div className="dirA-guilloche" />
      <AMast active="mascotas" />
      <div className="dirA-subbar">
        <span className="dirA-crumbs">Inicio › Mis Mascotas › <b>Pampa</b></span>
        <span className="dirA-doccode">LIB-AR-2022-088-PAMPA · chip 941000024681357</span>
      </div>
      <div className="dirA-body">
        <div className="dirA-doc">
          <div className="dirA-prof-hero">
            <div className="dirA-prof-band" />
            <div className="dirA-prof-main">
              <APhoto st="ok" name="FOTO · PAMPA" lg />
              <div className="dirA-prof-info">
                <h1 className="dirA-prof-name">Pampa <span className="dirA-flag dirA-flag--ok">AL DÍA</span></h1>
                <div className="dirA-prof-breed">Mestiza · Hembra · 4 años · Canina</div>
                <div className="dirA-prof-tags">
                  <span className="dirA-tag"><i className="fa fa-microchip" /> Microchip verificado</span>
                  <span className="dirA-tag"><i className="fa fa-venus" /> Esterilizada</span>
                  <span className="dirA-tag dirA-tag--gris"><i className="fa fa-home" /> San Isidro</span>
                </div>
              </div>
              <div className="dirA-prof-actions">
                <button className="dirA-btn"><i className="fa fa-share-alt" /> Compartir</button>
                <button className="dirA-btn dirA-btn--lost"><span style={{width:6,height:6,borderRadius:9,background:'#fff',display:'inline-block'}} /> Marcar perdida</button>
              </div>
            </div>
          </div>

          <div className="dirA-vitals">
            <div className="dirA-vital"><div className="dirA-label">Peso actual</div><div className="v">27,4 <small>kg</small></div><div className="vm">+0,3 vs. mar</div></div>
            <div className="dirA-vital"><div className="dirA-label">Última visita</div><div className="v">14 may</div><div className="vm">Vet. Belgrano</div></div>
            <div className="dirA-vital"><div className="dirA-label">Vacunas</div><div className="v">6 <small>/ 6 al día</small></div><div className="vm">cobertura completa</div></div>
            <div className="dirA-vital"><div className="dirA-label">Edad</div><div className="v">4 <small>años 2 m</small></div><div className="vm">nac. abr 2022</div></div>
          </div>

          <div className="dirA-tabs">
            <div className="dirA-tab is-active">Resumen</div>
            <div className="dirA-tab">Libreta <span className="ct">6</span></div>
            <div className="dirA-tab">Historial <span className="ct">18</span></div>
            <div className="dirA-tab">Documentos <span className="ct">3</span></div>
          </div>

          <div className="dirA-grid2">
            <div>
              <div className="dirA-sec"><span className="n">01</span><h2>Estado de salud</h2></div>
              <div className="dirA-card" style={{marginBottom:20}}>
                <div className="dirA-card-body">
                  <div className="dirA-due"><span className="dirA-due-mark is-soft" /><div className="dirA-due-body"><div className="dirA-due-title">Antirrábica vigente</div><div className="dirA-due-meta">Aplicada 14 may 2026 · vence may 2027</div></div><span className="dirA-due-when" style={{color:'var(--a-ok)'}}>vigente</span></div>
                  <div className="dirA-due"><span className="dirA-due-mark" /><div className="dirA-due-body"><div className="dirA-due-title">Antipulgas Bravecto</div><div className="dirA-due-meta">Próxima dosis recomendada</div></div><span className="dirA-due-when">en 8 días</span></div>
                </div>
              </div>
              <div className="dirA-sec"><span className="n">02</span><h2>Anotación reciente</h2></div>
              <div className="dirA-note">«Pampa anda con mucha energía esta semana, comió todo. Acordarse de cortarle las uñas el finde.» — Martín, hace 2 días</div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div className="dirA-card">
                <div className="dirA-card-head"><h3>Identificación</h3></div>
                <div className="dirA-card-body" style={{fontFamily:'var(--a-mono)',fontSize:12,lineHeight:2}}>
                  <div style={{color:'var(--a-mute)'}}>MICROCHIP</div><div style={{marginBottom:8}}>941 0000 2468 1357</div>
                  <div style={{color:'var(--a-mute)'}}>LIBRETA</div><div style={{marginBottom:8}}>LIB-AR-2022-088</div>
                  <div style={{color:'var(--a-mute)'}}>TITULAR</div><div>Martín Quiroga</div>
                </div>
              </div>
              <div className="dirA-card" style={{display:'flex',alignItems:'center',gap:14,padding:16}}>
                <div className="dirA-seal">Registro<br/>Nacional<br/>·miMAR·</div>
                <div style={{fontSize:12,color:'var(--a-mute)'}}><b style={{color:'var(--a-ink)',display:'block',fontSize:13,fontFamily:'var(--a-serif)'}}>Inscripción válida</b>Verificada por Vet. Belgrano</div>
              </div>
            </div>
          </div>
          <div className="dirA-foot"><span>Vista del titular · datos sensibles visibles</span><span>LIB-AR-2022-088-PAMPA</span></div>
        </div>
      </div>
    </div>
  );
}

// ---------- LIBRETA / HISTORIAL ----------
function ALibreta() {
  const vax = [
    { n:'Antirrábica', s:'Dosis anual · lote 4471-B', d:'14 may 2026', st:'ok', stl:'Vigente', vet:'Vet. Belgrano', vd:'Dra. Soler MN 4421', next:'vence may 2027' },
    { n:'Quíntuple (DHPPi+L)', s:'Refuerzo anual', d:'14 may 2026', st:'ok', stl:'Vigente', vet:'Vet. Belgrano', vd:'Dra. Soler MN 4421', next:'vence may 2027' },
    { n:'Antipulgas Bravecto', s:'Antiparasitario externo', d:'02 mar 2026', st:'due', stl:'Por vencer', vet:'Aplicación domiciliaria', vd:'titular', next:'próx. en 8 días' },
    { n:'Desparasitación', s:'Interna · Drontal', d:'02 mar 2026', st:'ok', stl:'Vigente', vet:'Vet. Belgrano', vd:'Dra. Soler MN 4421', next:'cada 3 meses' },
  ];
  return (
    <div className="dirA" data-screen-label="A · Libreta / Historial">
      <div className="dirA-guilloche" />
      <AMast active="mascotas" />
      <div className="dirA-subbar">
        <span className="dirA-crumbs">Inicio › Mis Mascotas › Pampa › <b>Libreta</b></span>
        <span className="dirA-doccode">6 asientos sanitarios · 18 eventos en historial</span>
      </div>
      <div className="dirA-body">
        <div className="dirA-doc">
          <div className="dirA-tabs">
            <div className="dirA-tab">Resumen</div>
            <div className="dirA-tab is-active">Libreta <span className="ct">6</span></div>
            <div className="dirA-tab">Historial <span className="ct">18</span></div>
            <div className="dirA-tab">Documentos <span className="ct">3</span></div>
          </div>

          <div className="dirA-sec"><span className="n">01</span><h2>Registro de vacunación</h2><span className="meta">Asientos certificados por veterinaria matriculada</span></div>
          <table className="dirA-ledger" style={{marginBottom:30}}>
            <thead><tr><th style={{width:'34%'}}>Vacuna / dosis</th><th>Fecha</th><th>Estado</th><th>Profesional certificante</th></tr></thead>
            <tbody>
              {vax.map((v,i) => (
                <tr key={i}>
                  <td><div className="vname">{v.n}</div><div className="vsub">{v.s}</div></td>
                  <td><div className="vdate">{v.d}</div><div className="vsub">{v.next}</div></td>
                  <td><span className={'vstamp vstamp--'+v.st}>{v.st==='ok'&&<i className="fa fa-check" />}{v.st==='due'&&<i className="fa fa-clock-o" />} {v.stl}</span></td>
                  <td><div className="vvet">{v.vet}<small>{v.vd}</small></div></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="dirA-sec"><span className="n">02</span><h2>Historial clínico</h2><span className="meta">orden cronológico · más reciente primero</span></div>
          <div className="dirA-tl">
            <div className="dirA-tl-item">
              <div className="dirA-tl-when"><b>14 MAY</b>2026</div>
              <div className="dirA-tl-dot is-verde"><i className="fa fa-syringe fa-medkit" /></div>
              <div className="dirA-tl-body"><div className="dirA-tl-title">Vacunación anual completa</div><div className="dirA-tl-text">Antirrábica + Quíntuple aplicadas en consulta de control. Peso registrado 27,4 kg.</div><div className="dirA-tl-foot"><span className="vt"><i className="fa fa-stethoscope" /> Vet. Belgrano</span><span>Dra. Soler · MN 4421</span></div></div>
            </div>
            <div className="dirA-tl-item">
              <div className="dirA-tl-when"><b>02 MAR</b>2026</div>
              <div className="dirA-tl-dot"><i className="fa fa-balance-scale" /></div>
              <div className="dirA-tl-body"><div className="dirA-tl-title">Control de peso + desparasitación</div><div className="dirA-tl-text">27,1 kg. Aplicada desparasitación interna (Drontal) y antipulgas Bravecto.</div><div className="dirA-tl-foot"><span className="vt"><i className="fa fa-stethoscope" /> Vet. Belgrano</span></div></div>
            </div>
            <div className="dirA-tl-item">
              <div className="dirA-tl-when"><b>18 ENE</b>2026</div>
              <div className="dirA-tl-dot is-warn"><i className="fa fa-thermometer-half" /></div>
              <div className="dirA-tl-body"><div className="dirA-tl-title">Síntoma — cojera leve pata trasera</div><div className="dirA-tl-text">Anotado por el titular. Resuelto solo en 3 días, sin consulta.</div><div className="dirA-tl-foot"><span>Anotado por Martín</span></div></div>
            </div>
            <div className="dirA-tl-item">
              <div className="dirA-tl-when"><b>04 ABR</b>2022</div>
              <div className="dirA-tl-dot"><i className="fa fa-star" /></div>
              <div className="dirA-tl-body"><div className="dirA-tl-title">Inscripción en el registro</div><div className="dirA-tl-text">Alta de libreta sanitaria nacional. Microchip implantado y verificado.</div><div className="dirA-tl-foot"><span className="vt"><i className="fa fa-id-card-o" /> LIB-AR-2022-088</span></div></div>
            </div>
          </div>
          <div className="dirA-foot"><span>Asientos firmados digitalmente · inmutables</span><span>Exportar libreta (PDF oficial)</span></div>
        </div>
      </div>
    </div>
  );
}

// ---------- INICIO MÓVIL ----------
function AInicioMobile() {
  const P = window.MIMAR;
  return (
    <div className="dirA is-mobile" data-screen-label="A · Inicio (móvil)">
      <div className="dirA-guilloche" />
      <AMast active="inicio" />
      <div className="dirA-body">
        <div className="dirA-greet"><div><h1>Buen día, Martín.</h1><p>2 vencimientos próximos.</p></div></div>
        <div className="dirA-capture" style={{marginBottom:22}}>
          <div className="dirA-capture-head"><div className="ico"><i className="fa fa-pencil-square-o" /></div><div><h3 style={{fontSize:15}}>Asentar un hecho</h3></div></div>
          <div className="dirA-capture-field"><i className="fa fa-feed" /><input placeholder="¿Qué pasó hoy?" /><button className="dirA-btn-asentar"><i className="fa fa-arrow-right" /></button></div>
        </div>
        <div className="dirA-sec"><span className="n">01</span><h2>Mis mascotas</h2></div>
        <div className="dirA-registry">
          {P.pets.map(p => (
            <a key={p.id} className="dirA-reg-row" data-st={p.st} href="#" style={{gridTemplateColumns:'52px 1fr'}}>
              <APhoto st={p.st} name={p.name.slice(0,4).toUpperCase()} />
              <div><div className="dirA-reg-name" style={{fontSize:16}}>{p.name}{p.flag && <span className={'dirA-flag dirA-flag--'+(p.st==='lost'?'lost':p.st==='sick'?'sick':'preg')}>{p.flag}</span>}</div><div className="dirA-reg-breed">{p.breed}</div></div>
            </a>
          ))}
        </div>
      </div>
      <nav className="dirA-tabbar">
        <a href="#" className="is-active"><i className="fa fa-home" />Inicio</a>
        <a href="#"><i className="fa fa-paw" />Mascotas</a>
        <a href="#"><i className="fa fa-calendar-o" />Turnos</a>
        <a href="#"><i className="fa fa-bell-o" />Avisos</a>
        <a href="#"><i className="fa fa-user-o" />Yo</a>
      </nav>
    </div>
  );
}

Object.assign(window, { AInicio, AMascotas, APerfil, ALibreta, AInicioMobile });
