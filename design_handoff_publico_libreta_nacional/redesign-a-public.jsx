// ============================================================
// DIRECCIÓN A — Portales PÚBLICOS · componentes
// Portada · Adoptar · Perdidas · Credencial pública · Denuncia (wizard) · Caso público
// Estética "Libreta Nacional". Clases .pub* de redesign-a-public.css
// ============================================================

// ---------- Datos ----------
const PUB_ADOPT = [
  { t:'MORA', name:'Mora', breed:'Mestiza', meta:'Hembra · 2 años · Mediano', story:'Muy compañera, le encanta correr en el parque.', org:'Refugio Belgrano R · CABA', chip:true, cas:true },
  { t:'PELU', name:'Pelusa', breed:'Mestiza pelo largo', meta:'Hembra · 3 años · Pequeño', story:'Mansa, dormilona, le encanta el sol del balcón.', org:'Refugio Belgrano R · CABA', chip:false, cas:true },
  { t:'ORSO', name:'Orson', breed:'Mastín cruza', meta:'Macho · 4 años · Grande', story:'Gigantón tranquilo, perfecto para familia con espacio.', org:'Refugio Belgrano R · CABA', chip:true, cas:true },
  { t:'FRID', name:'Frida', breed:'Siamesa', meta:'Hembra · 2 años · Pequeño', story:'Curiosa, miau-hablona. Ideal para departamento.', org:'Refugio Belgrano R · CABA', chip:false, cas:true },
  { t:'KIRA', name:'Kira', breed:'Galga', meta:'Hembra · 5 años · Mediano', story:'Atleta del barrio. Necesita correr todos los días.', org:'Refugio Belgrano R · CABA', chip:true, cas:true },
  { t:'NACH', name:'Nacho', breed:'Caniche cruza', meta:'Macho · 7 años · Pequeño', story:'Abuelo simpático, ideal para hogares tranquilos.', org:'Patitas Felices · Vicente López', chip:true, cas:true },
];
const PUB_LOST = [
  { t:'PAMP', name:'Pampa', breed:'Mestiza', meta:'Hembra · 4 años · Mediano · Negra', sex:'f', u:'recent', short:'ayer', where:'Plaza Castelli', city:'CABA · Belgrano', when:'Visto ayer', note:'Tiene collar rojo. Es muy mansa, suele acercarse.', chip:true, cas:true },
  { t:'MUFA', name:'Mufasa', breed:'Persa naranja', meta:'Macho · 5 años · Mediano', sex:'m', u:'critical', short:'hace 18h', where:'Bosques de Palermo', city:'CABA · Palermo', when:'Visto hace 18 horas', note:'No tiene experiencia en la calle. Necesita medicación.', chip:true, cas:true },
  { t:'CHIA', name:'Chía', breed:'Siamesa', meta:'Hembra · 2 años · Pequeño', sex:'f', u:'critical', short:'hace 12h', where:'Av. del Libertador y Olleros', city:'CABA · Núñez', when:'Visto hace 12 horas', note:'Le falta una uña, lleva collar celeste.', chip:false, cas:true },
  { t:'OSO', name:'Oso', breed:'Labrador chocolate', meta:'Macho · 6 años · Grande', sex:'m', u:'medium', short:'hace 8d', where:'Estación Florida', city:'GBA Norte · Vicente López', when:'Hace 8 días', note:'Responde a su nombre. Toma medicación cardíaca.', chip:true, cas:true },
  { t:'RING', name:'Ringo', breed:'Caniche cruza', meta:'Macho · 9 años · Pequeño', sex:'m', u:'low', short:'hace 1 mes', where:'Av. Corrientes y Scalabrini', city:'CABA · Villa Crespo', when:'Hace más de un mes', note:'Es ciego del ojo derecho. Pierde audición.', chip:true, cas:true },
  { t:'TURK', name:'Turco', breed:'Mestizo galgo', meta:'Macho · 2 años · Mediano', sex:'m', u:'medium', short:'hace 2 sem', where:'Plaza Conesa', city:'GBA Sur · Quilmes', when:'Hace 2 semanas', note:'Muy tímido. No tiene collar.', chip:false, cas:false },
];

// ---------- Shell ----------
function PubHeader({ active }) {
  const nav = [['inicio','Inicio'],['adoptar','Adoptar'],['perdidas','Perdidas'],['denunciar','Denunciar'],['vets','Veterinarios']];
  return (
    <header className="pub-header">
      <div className="pub-brand">
        <div className="pub-crest">m</div>
        <div className="pub-wm"><b>miMAR</b><span>Mi Mascota Argentina</span></div>
      </div>
      <nav className="pub-nav">{nav.map(([id,l]) => <a key={id} href="#" className={id===active?'is-active':''}>{l}</a>)}</nav>
      <div className="pub-header-sp" />
      <a href="#" className="pub-hbtn pub-hbtn--ghost"><i className="fa fa-search" /> Buscar</a>
      <a href="#" className="pub-hbtn">Ingresar</a>
      <a href="#" className="pub-hbtn pub-hbtn--primary">Registrarme</a>
    </header>
  );
}
function PubFooter() {
  return (
    <footer className="pub-footer">
      <div className="pub-footer-row">
        <div className="pub-footer-brand">miMAR<span>Registro Nacional de Mascotas</span></div>
        <a href="#">Adoptar</a><a href="#">Mascotas perdidas</a><a href="#">Denunciar maltrato</a>
        <a href="#">Refugios verificados</a><a href="#">Veterinarias</a>
        <div className="sp" />
        <a href="#">Ingresar</a><a href="#">Ayuda</a>
      </div>
      <div className="pub-footer-legal">Ley 14.346 (maltrato animal) · Ley 25.326 (protección de datos) · Una iniciativa del Registro Nacional de Mascotas — República Argentina</div>
    </footer>
  );
}
function PubFilter({ label, value }) {
  return (<div className="pub-filter"><label>{label}</label><div className="sel"><span>{value}</span><i className="fa fa-angle-down" /></div></div>);
}
function PubPhoto({ name, cls }) {
  return (<div className={'pub-photo '+(cls||'')}><span className="cap">FOTO · {name}</span></div>);
}

// ============================================================
// PORTADA
// ============================================================
function PubPortada() {
  return (
    <div className="pubwrap" data-screen-label="Público · Portada">
      <div className="pub-guilloche" />
      <PubHeader active="inicio" />
      <div className="pub-main">
        <div className="pub-hero">
          <div>
            <div className="pub-eyebrow"><i className="fa fa-shield" /> Registro Nacional de Mascotas</div>
            <h1 className="pub-h1">La libreta sanitaria de tu mascota, <span className="em">oficial y en un solo lugar.</span></h1>
            <p className="pub-lead">Registrá a tu mascota, llevá su libreta de vacunas, y ayudá a la comunidad: adoptá, reportá una mascota perdida o denunciá maltrato.</p>
            <div className="pub-hero-search">
              <i className="fa fa-qrcode" />
              <input placeholder="¿Encontraste una mascota? Ingresá el código de su credencial" />
              <button>Buscar</button>
            </div>
            <div className="pub-hero-note">Ej: mimar.gob.ar/p/PAMPA-X9K2 — está en la chapita del collar.</div>
          </div>
          <div className="pub-doccard">
            <div className="pub-doccard-band" />
            <div className="pub-doccard-body">
              <div style={{display:'flex',gap:14,alignItems:'center'}}>
                <div className="pub-photo" style={{width:84,height:84,aspectRatio:'auto',borderRadius:6,flexShrink:0}}><span className="cap">FOTO</span></div>
                <div>
                  <div style={{fontFamily:'var(--a-serif)',fontWeight:600,fontSize:22,letterSpacing:'-.01em'}}>Pampa</div>
                  <div style={{fontSize:12.5,color:'var(--a-mute)'}}>Mestiza · 4 años · CABA</div>
                  <span className="pub-pill" data-tone="ok" style={{marginTop:6}}><i className="fa fa-check" /> Libreta al día</span>
                </div>
              </div>
              <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--a-line-2)',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px 14px',fontFamily:'var(--a-mono)',fontSize:11}}>
                <div><div style={{color:'var(--a-mute)'}}>MICROCHIP</div>941 0000 2468 1357</div>
                <div><div style={{color:'var(--a-mute)'}}>LIBRETA</div>LIB-AR-2022-088</div>
                <div><div style={{color:'var(--a-mute)'}}>VACUNAS</div>6 / 6 vigentes</div>
                <div><div style={{color:'var(--a-mute)'}}>ESTADO</div>Activa</div>
              </div>
            </div>
          </div>
        </div>

        <div className="pub-sec-head"><span className="n">01</span><h2>Servicios para la comunidad</h2><span className="meta">acceso público · sin registro</span></div>
        <div className="pub-services">
          <a href="#" className="pub-service">
            <div className="pub-service-ico"><i className="fa fa-home" /></div>
            <h3>Adoptar</h3>
            <p>Mascotas publicadas por refugios verificados en todo el país. Encontrá tu próximo compañero.</p>
            <span className="pub-service-cta">Ver en adopción <i className="fa fa-angle-right" /></span>
          </a>
          <a href="#" className="pub-service" data-tone="seal">
            <div className="pub-service-ico"><i className="fa fa-map-marker" /></div>
            <h3>Mascotas perdidas</h3>
            <p>Animales marcados como perdidos por sus dueños. Si viste alguno, avisá desde su credencial.</p>
            <span className="pub-service-cta">Ver perdidas <i className="fa fa-angle-right" /></span>
          </a>
          <a href="#" className="pub-service" data-tone="warn">
            <div className="pub-service-ico"><i className="fa fa-balance-scale" /></div>
            <h3>Denunciar maltrato</h3>
            <p>Reportá una situación de maltrato o abandono. Anónimo si querés, bajo la Ley 14.346.</p>
            <span className="pub-service-cta">Hacer una denuncia <i className="fa fa-angle-right" /></span>
          </a>
        </div>

        <div className="pub-sec-head"><span className="n">02</span><h2>miMAR en números</h2></div>
        <div className="pub-statband">
          <div className="pub-stat"><div className="v">214.880</div><div className="l">Mascotas registradas</div></div>
          <div className="pub-stat"><div className="v">1.342</div><div className="l">Refugios verificados</div></div>
          <div className="pub-stat"><div className="v">3.907</div><div className="l">Reencuentros este año</div></div>
          <div className="pub-stat"><div className="v">8.115</div><div className="l">Denuncias gestionadas</div></div>
        </div>
      </div>
      <PubFooter />
    </div>
  );
}

// ============================================================
// ADOPTAR
// ============================================================
function PubAdoptar() {
  return (
    <div className="pubwrap" data-screen-label="Público · Adoptar">
      <div className="pub-guilloche" />
      <PubHeader active="adoptar" />
      <div className="pub-main">
        <div className="pub-crumbs"><a href="#">Inicio</a> › <b>Adoptar</b></div>
        <section style={{marginBottom:24,maxWidth:720}}>
          <h1 className="pub-h1">Adoptar en <span className="em">miMAR</span></h1>
          <p className="pub-lead">Mascotas publicadas por refugios verificados en Argentina. Si ves alguna que te resuene, postulate y el refugio te contacta.</p>
        </section>
        <div className="pub-filters">
          <PubFilter label="Especie" value="Todas" /><PubFilter label="Provincia" value="CABA" />
          <PubFilter label="Localidad" value="Todas" /><PubFilter label="Edad" value="Cualquiera" />
          <PubFilter label="Tamaño" value="Cualquiera" /><PubFilter label="Energía" value="Cualquiera" />
          <div className="sp" /><button className="pub-search-btn"><i className="fa fa-search" /> Filtrar</button>
        </div>
        <div className="pub-quickfilters">
          <span className="lbl">Compatible con</span>
          {['Niños','Gatos','Otros perros','Departamento','Personas con alergia'].map(l => <label key={l} className="pub-qchip"><input type="checkbox" />{l}</label>)}
        </div>
        <div className="pub-resultline"><b>{PUB_ADOPT.length} mascotas</b> publicadas · mostrando las más recientes <div className="sp" />Ordenar por: <select><option>Más recientes</option><option>Más cerca</option></select></div>
        <div className="pub-grid">
          {PUB_ADOPT.map(p => (
            <a key={p.t} href="#" className="pub-petcard">
              <PubPhoto name={p.name} />
              <div className="pub-photo-chips" style={{position:'static'}} />
              <div className="pub-petbody">
                <div className="pub-petname">{p.name}</div>
                <div className="pub-petbreed">{p.breed}</div>
                <div className="pub-petmeta">{p.meta}</div>
                <div className="pub-petstory">{p.story}</div>
                <div className="pub-petfoot"><i className="fa fa-home" /> {p.org} <span className="go">Ver ficha <i className="fa fa-angle-right" /></span></div>
              </div>
            </a>
          ))}
        </div>
        <div className="pub-cta">
          <div className="pub-cta-ico"><i className="fa fa-shield" /></div>
          <div className="pub-cta-body"><h3>Refugios verificados</h3><p>Cada organización pasa por verificación de la autoridad sanitaria de su jurisdicción antes de poder publicar.</p></div>
        </div>
      </div>
      <PubFooter />
    </div>
  );
}

// ============================================================
// PERDIDAS
// ============================================================
function PubPerdidas() {
  return (
    <div className="pubwrap" data-screen-label="Público · Perdidas">
      <div className="pub-guilloche" />
      <PubHeader active="perdidas" />
      <div className="pub-urgband"><i className="fa fa-exclamation-triangle" /><b>2 mascotas perdidas en las últimas 24 horas</b><span className="dim">·</span><span className="dim">Si encontraste alguna, avisá desde su credencial — el dueño recibe la notificación al instante.</span></div>
      <div className="pub-main">
        <div className="pub-crumbs"><a href="#">Inicio</a> › <b>Perdidas</b></div>
        <section style={{marginBottom:22,maxWidth:740}}>
          <h1 className="pub-h1">Mascotas <span className="em-seal">perdidas</span> cerca tuyo</h1>
          <p className="pub-lead">Animales marcados como perdidos por sus dueños. Si reconocés alguno o lo viste cerca, abrí su credencial y dejá tu contacto.</p>
        </section>
        <div className="pub-kpis">
          <div className="pub-kpi" data-tone="seal"><div className="l">Activas</div><div className="v">6</div></div>
          <div className="pub-kpi" data-tone="seal"><div className="l">Críticas (24h)</div><div className="v">2</div></div>
          <div className="pub-kpi" data-tone="seal"><div className="l">Últimas 24h</div><div className="v">2</div></div>
          <div className="pub-kpi" data-tone="warn"><div className="l">Últimos 7 días</div><div className="v">3</div></div>
        </div>
        <div className="pub-filters">
          <PubFilter label="Especie" value="Todas" /><PubFilter label="Provincia" value="CABA" />
          <PubFilter label="Localidad" value="Todas" /><PubFilter label="Cuándo se perdió" value="Cualquier momento" />
          <PubFilter label="Tamaño" value="Cualquiera" /><div className="sp" /><button className="pub-search-btn" data-tone="seal"><i className="fa fa-search" /> Buscar</button>
        </div>
        <div className="pub-quickfilters">
          <span className="lbl">Filtros rápidos</span>
          {['Visto hoy','Esta semana','Con microchip','Castrado/a','Crítica','A 5 km de mí'].map(l => <label key={l} className="pub-qchip"><input type="checkbox" />{l}</label>)}
        </div>
        <div className="pub-resultline"><b>{PUB_LOST.length} mascotas perdidas</b> en tu zona · ordenadas por más recientes <div className="sp" />Ordenar por: <select><option>Más recientes</option><option>Más cerca</option></select></div>
        <div className="pub-grid">
          {PUB_LOST.map(p => (
            <a key={p.t} href="#" className="pub-petcard pub-petcard--lost">
              <div style={{position:'relative'}}>
                <PubPhoto name={p.name} />
                <div className="pub-pennant"><i className="fa fa-exclamation-triangle" /> {p.sex==='f'?'Perdida':'Perdido'}</div>
                <div className="pub-timechip" data-u={p.u}>{p.short}</div>
              </div>
              <div className="pub-petbody">
                <div className="pub-petname">{p.name}</div>
                <div className="pub-petbreed">{p.breed}</div>
                <div className="pub-petmeta">{p.meta}</div>
                <div className="pub-lastseen">
                  <div className="l"><i className="fa fa-map-marker" /> Visto por última vez</div>
                  <div className="where">{p.where}</div>
                  <div className="when">{p.city} · {p.when}</div>
                </div>
                <div className="pub-petstory is-quote">“{p.note}”</div>
                <div className="pub-petfoot pub-petfoot--lost">
                  {p.chip && <span><i className="fa fa-microchip" style={{color:'var(--a-azul)'}} /> chip</span>}
                  {p.cas && <span><i className="fa fa-check" style={{color:'var(--a-ok)'}} /> castrado/a</span>}
                  <span className="go">Ver credencial <i className="fa fa-angle-right" /></span>
                </div>
              </div>
            </a>
          ))}
        </div>
        <div className="pub-cta" data-tone="seal">
          <div className="pub-cta-ico"><i className="fa fa-paw" /></div>
          <div className="pub-cta-body"><h3>¿Perdiste a tu mascota?</h3><p>Marcala como perdida desde su libreta. Aparece en este listado al instante y su credencial pasa a modo emergencia.</p></div>
          <a href="#" className="pub-hbtn" style={{background:'var(--a-seal)',color:'#fff',borderColor:'var(--a-seal)'}}>Reportar pérdida <i className="fa fa-angle-right" /></a>
        </div>
      </div>
      <PubFooter />
    </div>
  );
}

// ============================================================
// CREDENCIAL PÚBLICA (escaneo de QR)
// ============================================================
function PubCredencial() {
  return (
    <div className="pubwrap" data-screen-label="Público · Credencial (escaneo QR)" style={{background:'var(--a-stripe)'}}>
      <div className="pub-guilloche" />
      <PubHeader active="perdidas" />
      <div className="pub-main pub-main--narrow" style={{paddingTop:28}}>
        <div className="pub-cred">
          <div className="pub-cred-emergency">
            <i className="fa fa-exclamation-triangle" />
            <div className="t"><b>Esta mascota está perdida</b><span>Si la encontraste, ayudá a que vuelva a casa.</span></div>
          </div>
          <div className="pub-cred-card">
            <div className="pub-cred-photo"><span className="cap">FOTO · TOMÁS</span></div>
            <div className="pub-cred-namebar">
              <div className="pub-cred-name">Tomás <span className="pub-cred-flag">PERDIDO</span></div>
              <div className="pub-cred-breed">Caniche · Macho · 2 años · Beige · 7,4 kg</div>
            </div>
            <div className="pub-cred-section">
              <div className="lbl">Señas particulares</div>
              <div className="pub-cred-marks">
                <div className="pub-cred-mark"><i className="fa fa-paw" /><span>Collar rojo con cascabel. Mancha blanca en el pecho.</span></div>
                <div className="pub-cred-mark"><i className="fa fa-heart" /><span>Es muy manso, responde a su nombre. Se asusta con los autos.</span></div>
                <div className="pub-cred-mark"><i className="fa fa-microchip" /><span>Microchip 941 0000 2468 1357 · verificado</span></div>
              </div>
            </div>
            <div className="pub-cred-section">
              <div className="lbl">Visto por última vez</div>
              <div style={{fontSize:13.5,fontWeight:600,marginBottom:8}}>Parque Las Heras, lado norte · CABA · hoy 09:14</div>
              <div className="pub-cred-map">
                <span className="dirA-map-tag" style={{position:'absolute',top:8,right:8,fontFamily:'var(--a-mono)',fontSize:10,background:'rgba(255,255,255,.88)',padding:'2px 7px',borderRadius:3,color:'var(--a-ink-2)'}}>Belgrano, CABA</span>
                <span style={{position:'absolute',left:'50%',top:'46%',transform:'translate(-50%,-100%)',fontSize:26,filter:'drop-shadow(0 2px 4px rgba(0,0,0,.3))'}}>📍</span>
              </div>
            </div>
            <div className="pub-cred-actions">
              <button className="pub-cred-call"><i className="fa fa-phone" /> Llamar a Martín</button>
              <button className="pub-cred-report"><i className="fa fa-map-marker" /> La vi — avisar ubicación</button>
              <div style={{textAlign:'center',fontSize:11.5,color:'var(--a-mute)'}}>Tus datos no se comparten con el dueño salvo que vos quieras.</div>
            </div>
            <div className="pub-cred-foot">CREDENCIAL PÚBLICA · mimar.gob.ar/p/tomas-x9k2 · EXP. CAS-2026-0148<br/>Registro Nacional de Mascotas · República Argentina</div>
          </div>
        </div>
      </div>
      <PubFooter />
    </div>
  );
}

// ============================================================
// DENUNCIA — wizard (3 pasos) + éxito
// ============================================================
function PubDenuncia() {
  const kinds = [
    ['🚪','Abandono','Lo dejaron solo, atado en la calle, etc.',true],
    ['🍃','Negligencia','Sin comida, agua, refugio o atención médica.',false],
    ['🩹','Maltrato físico','Golpes, heridas visibles, miedo extremo.',false],
    ['⛓️','Encadenamiento','Atado permanentemente, sin libertad.',false],
    ['🏚️','Acumulación','Muchos animales en condiciones precarias.',false],
  ];
  return (
    <div className="pubwrap" data-screen-label="Público · Denuncia (wizard)" style={{background:'var(--a-stripe)'}}>
      <div className="pub-guilloche" />
      <PubHeader active="denunciar" />
      <div className="pub-main" style={{display:'flex',gap:20,flexWrap:'wrap',justifyContent:'center',alignItems:'flex-start',maxWidth:1180}}>

        {/* Paso 1 */}
        <div className="pub-wizard">
          <div className="pub-wiz-top"><button className="pub-wiz-back" style={{visibility:'hidden'}}>←</button><div><div className="pub-wiz-step">Paso 1 de 5</div><div className="pub-wiz-label">Qué pasó</div></div></div>
          <div className="pub-wiz-prog"><span style={{width:'20%'}} /></div>
          <div className="pub-wiz-body">
            <h1 className="pub-wiz-h1">¿Qué pasó?</h1>
            <p className="pub-wiz-sub">Elegí lo que más se parece a lo que viste. Después podés contar el detalle.</p>
            {kinds.map(([e,l,d,sel]) => (
              <div key={l} className={'pub-kindrow'+(sel?' is-sel':'')}><span className="em">{e}</span><span className="tx"><b>{l}</b><span>{d}</span></span><span className="radio" /></div>
            ))}
          </div>
        </div>

        {/* Paso 2 */}
        <div className="pub-wizard">
          <div className="pub-wiz-top"><button className="pub-wiz-back">←</button><div><div className="pub-wiz-step">Paso 2 de 5</div><div className="pub-wiz-label">Gravedad</div></div></div>
          <div className="pub-wiz-prog"><span style={{width:'40%'}} /></div>
          <div className="pub-wiz-body">
            <h1 className="pub-wiz-h1">¿Qué tan grave es?</h1>
            <p className="pub-wiz-sub">Es tu mejor estimación. El equipo prioriza y verifica.</p>
            <label className="pub-sev" data-tone="red"><div className="em">🚨</div><div className="t">Grave / urgente</div><div className="s">Riesgo de vida ahora mismo. Heridas visibles, animal sin reaccionar.</div></label>
            <label className="pub-sev is-sel" data-tone="amber"><div className="em">⚠️</div><div className="t">Moderado</div><div className="s">Sufrimiento sostenido pero no inminente.</div></label>
            <label className="pub-sev" data-tone="neutral"><div className="em">🔍</div><div className="t">Sospecha</div><div className="s">Algo no cuadra y querés que vayan a chequear.</div></label>
            <button className="pub-wiz-cta">Continuar →</button>
          </div>
        </div>

        {/* Paso 5 (cómo enviar) */}
        <div className="pub-wizard">
          <div className="pub-wiz-top"><button className="pub-wiz-back">←</button><div><div className="pub-wiz-step">Paso 5 de 5</div><div className="pub-wiz-label">Cerrar</div></div></div>
          <div className="pub-wiz-prog"><span style={{width:'100%'}} /></div>
          <div className="pub-wiz-body">
            <h1 className="pub-wiz-h1">¿Cómo querés enviarla?</h1>
            <div className="pub-kindrow" style={{marginTop:14}}><span className="em">🕵️</span><span className="tx"><b>Enviar anónima</b><span>Sin datos de contacto. El código DEN-XXXX es tu seguimiento.</span></span><span className="radio" /></div>
            <div className="pub-kindrow is-sel" style={{marginTop:8,flexDirection:'column',alignItems:'stretch',gap:10}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}><span className="em">📞</span><span className="tx"><b>Sumar mi contacto (más útil)</b><span>Email o teléfono. Sin DNI. El equipo puede contactarte.</span></span><span className="radio" /></div>
              <div style={{display:'flex',flexDirection:'column',gap:8,paddingTop:10,borderTop:'1px solid var(--a-line-2)'}}>
                <div className="dirA-field"><input className="dirA-input" defaultValue="vecino_san_telmo@correo.ar" /></div>
                <div className="dirA-field"><input className="dirA-input dirA-mono-in" defaultValue="+54 9 11 4456 7723" /></div>
              </div>
            </div>
            <button className="pub-wiz-cta">Enviar denuncia →</button>
            <button className="pub-wiz-skip">Al enviar confirmás que lo descripto es lo que viste.</button>
          </div>
        </div>

        {/* Éxito */}
        <div className="pub-wizard" style={{alignSelf:'stretch'}}>
          <div className="pub-wiz-prog" style={{background:'var(--a-azul)'}}><span style={{width:'100%'}} /></div>
          <div className="pub-wiz-body">
            <div className="pub-success">
              <div className="pub-success-ic"><i className="fa fa-check" /></div>
              <h1>Denuncia registrada</h1>
              <p>Tu denuncia fue recibida. Gracias por animarte a denunciar.</p>
              <div className="pub-codecard">
                <div className="l">Tu código de seguimiento</div>
                <div className="code">DEN-7Q8M-X9K2</div>
                <div className="hint">Tocá para copiar</div>
              </div>
              <div className="pub-warnbox">Si enviaste anónima, este código es la <b>única forma</b> de volver a esta denuncia.</div>
              <button className="pub-wiz-cta" style={{marginTop:0}}>Ver mi denuncia →</button>
            </div>
          </div>
        </div>
      </div>
      <PubFooter />
    </div>
  );
}

// ============================================================
// CASO PÚBLICO (expediente)
// ============================================================
function PubCaso() {
  const tline = [
    ['21 may 2026 · 16:00','Caso recibido','Origen: denuncia ciudadana anónima','done'],
    ['22 may 2026 · 09:15','Asignado a equipo de fiscalización','Categoría: maltrato físico · prioridad crítica','done'],
    ['23 may 2026 · 11:40','Inspector designado','Matrícula M-CABA-0987','done'],
    ['24 may 2026 · 14:00','Visita domiciliaria en curso','Actuando bajo Res. MS-CABA 412/2023','current'],
    ['—','Resolución administrativa','Pendiente · plazo legal: 30 días','pending'],
  ];
  return (
    <div className="pubwrap" data-screen-label="Público · Caso (expediente)">
      <div className="pub-guilloche" />
      <PubHeader active="denunciar" />
      <div className="pub-main pub-main--narrow">
        <div className="pub-crumbs"><a href="#">Inicio</a> › <b>Caso público</b></div>
        <div className="pub-eyebrow">Expediente público</div>
        <div className="pub-case-codes">
          <h1 className="pub-h1" style={{fontSize:32,margin:0}}>Maltrato animal</h1>
          <span className="pub-case-code">CAS-2026-04812</span>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:4}}>
          <span className="pub-pill" data-tone="warn"><i className="fa fa-clock-o" /> En investigación</span>
          <span className="pub-pill" data-tone="seal"><i className="fa fa-exclamation-triangle" /> Severidad crítica</span>
          <span className="pub-pill" data-tone="azul">Jurisdicción: CABA · Belgrano</span>
        </div>

        <div className="pub-banner">
          <i className="fa fa-info-circle" />
          <div><b>Este caso es público</b> por decisión de la autoridad jurisdiccional bajo la Resolución MS 2588/2022. Los datos personales del denunciante, del responsable y del domicilio exacto <b style={{color:'var(--a-ink)'}}>no se publican</b>; sólo el progreso del expediente.</div>
        </div>

        <div className="pub-panel">
          <h2>Resumen público</h2>
          <dl className="pub-dl">
            <dt>Tipo</dt><dd>Maltrato animal · Ley 14.346</dd>
            <dt>Recibido</dt><dd>21 may 2026</dd>
            <dt>Jurisdicción</dt><dd>CABA · Comuna 13 (Belgrano)</dd>
            <dt>Autoridad</dt><dd>Subsec. de Salud Animal CABA</dd>
            <dt>Estado</dt><dd>Inspección domiciliaria en curso</dd>
          </dl>
        </div>

        <div className="pub-panel">
          <h2>Línea de tiempo</h2>
          <ol className="pub-tline">
            {tline.map(([when,label,sub,st],i) => (
              <li key={i}>
                <span className="pub-tdot" data-st={st} />
                <div className={'pub-titem'+(st==='pending'?' is-pending':'')}><b>{label}</b><span>{sub}</span></div>
                <div className="pub-twhen">{when}</div>
              </li>
            ))}
          </ol>
        </div>

        <div className="pub-protected">
          <div className="pub-protected-head"><i className="fa fa-lock" /><h3>Información protegida</h3></div>
          <p>La identidad de las partes, el domicilio exacto, los archivos de evidencia y las notas internas <b style={{color:'var(--a-ink)'}}>no son públicos</b>. Esa información sólo es accesible para el denunciante autenticado, la autoridad sanitaria interviniente y el responsable cuando es notificado formalmente.</p>
        </div>

        <div className="pub-legal">
          Marco legal: <b>Ley 14.346</b> (maltrato animal) · <b>Res. MS 2588/2022</b> (publicidad de actuaciones) · <b>Ley 25.326</b> (protección de datos).<br/>
          Token público <b>CAS-2026-04812</b> · última actualización 24 may 2026 · 14:00 hs.
        </div>
      </div>
      <PubFooter />
    </div>
  );
}

Object.assign(window, { PubPortada, PubAdoptar, PubPerdidas, PubCredencial, PubDenuncia, PubCaso, PubHeader, PubFooter, PubFilter, PubPhoto });
