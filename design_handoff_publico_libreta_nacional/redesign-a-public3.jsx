// ============================================================
// DIRECCIÓN A — PÚBLICOS TANDA 2 · Parte 2
// Adopción (ficha + postular + éxito) · Mis postulaciones · Refugio
// Mostrar Libreta (sheet Tier 2) · Transferencias (dueño→org, org→org) · Reclamar
// ============================================================

// ============================================================
// ADOPCIÓN — Ficha pública (desktop)
// ============================================================
function AdoptDetalle() {
  const meta = ['Perra','Hembra','2 años','Mediano (18 kg)','Negra'];
  const health = [
    [true,'Vacunación al día','Óctuple + antirrábica vigente'],
    [true,'Castrada','Esterilizada en feb. 2026'],
    [true,'Microchip miMAR','Registrado · trazable'],
    [true,'Desparasitada','Interna y externa al día'],
  ];
  const pers = [['Buena con niños','pos'],['Energía alta','neu'],['Le encanta correr','pos'],['Necesita compañía','warn'],['No convive con gatos','warn'],['Sociable con perros','pos']];
  return (
    <div className="pubwrap" data-screen-label="Adopción · Ficha de mascota">
      <div className="pub-guilloche" />
      <PubHeader active="adoptar" />
      <div className="pub-main" style={{paddingBottom:90}}>
        <div className="adopt">
          <div className="pub-crumbs"><a href="#">Adoptar</a> › <b>Mora</b></div>
          <div className="adopt-gallery">
            <div className="adopt-hero">
              <span className="cap">FOTO PRINCIPAL · MORA</span>
              <span className="statuschip"><i className="fa fa-circle" style={{fontSize:7}} /> En adopción</span>
              <div className="rollups">
                <span className="rollup"><i className="fa fa-check" style={{color:'var(--a-ok)'}} /> Vacunas al día</span>
                <span className="rollup"><i className="fa fa-check" style={{color:'var(--a-ok)'}} /> Castrada</span>
                <span className="rollup"><i className="fa fa-id-card" style={{color:'var(--a-azul)'}} /> Con chip</span>
              </div>
            </div>
            <div className="adopt-thumbs">
              {['Principal','En el parque','Dormida','Con voluntario'].map((c,i) => <div key={c} className={'adopt-thumb'+(i===0?' is-active':'')}><span className="cap">{c.toUpperCase()}</span></div>)}
            </div>
          </div>

          <div className="adopt-identity">
            <div className="adopt-name">Mora</div>
            <div className="adopt-breed">Mestiza</div>
            <div className="adopt-metachips">{meta.map(m => <span key={m} className="adopt-metachip">{m}</span>)}</div>
          </div>

          <div className="adopt-card is-accent">
            <div className="eyebrow">Su historia</div>
            <h3>Sobre Mora</h3>
            <p>Mora llegó al refugio en agosto de 2024, encontrada con su camada en un terreno cerca de la cancha de Defensores. Fue criada en hogar de tránsito hasta los 8 meses.</p>
            <p>Es muy compañera, le encanta correr y necesita compañía la mayor parte del día — no le viene bien estar sola muchas horas. Camina con correa con paciencia y conoce los comandos básicos.</p>
            <p>Buscamos para Mora un hogar con patio o terraza grande, sin gatos, y con experiencia previa con perros medianos.</p>
          </div>

          <div className="adopt-card">
            <div className="eyebrow">Estado médico</div>
            <h3>Salud</h3>
            <div className="adopt-health">
              {health.map(([ok,t,s]) => (
                <div key={t} className="adopt-hrow"><span className={'ic '+(ok?'ok':'no')}><i className={'fa '+(ok?'fa-check':'fa-times')} /></span><div><b>{t}</b><span>{s}</span></div></div>
              ))}
            </div>
            <div className="adopt-conds">
              <div className="eyebrow" style={{marginBottom:8}}>Condiciones permanentes</div>
              <span className="adopt-cond">Dieta hipoalergénica</span>
              <p style={{fontSize:12,fontStyle:'italic',color:'var(--a-ink-2)',margin:'8px 0 0'}}>Comida especial sin pollo. El refugio explica la transición al adoptante.</p>
            </div>
          </div>

          <div className="adopt-card">
            <div className="eyebrow">Cómo es en el día a día</div>
            <h3>Personalidad</h3>
            <div className="adopt-pers">{pers.map(([l,t]) => <span key={l} className="adopt-perschip" data-t={t}>{l}</span>)}</div>
          </div>

          <div className="adopt-card">
            <div className="eyebrow">Refugio responsable</div>
            <div className="adopt-org">
              <div className="adopt-org-logo">R</div>
              <div style={{flex:1}}>
                <div className="adopt-org-name">Refugio Belgrano R <span className="dirA-verified"><i className="fa fa-check-circle" /> Verificado</span></div>
                <div style={{fontSize:12,color:'var(--a-mute)',margin:'4px 0 6px'}}><i className="fa fa-map-marker" /> Av. Belgrano 1450, Belgrano · CABA</div>
                <a href="#" style={{fontSize:12.5,color:'var(--a-azul)',fontWeight:600,textDecoration:'none'}}>Ver perfil del refugio <i className="fa fa-angle-right" /></a>
              </div>
            </div>
          </div>

          <div style={{textAlign:'center',fontSize:11,color:'var(--a-mute)',fontFamily:'var(--a-mono)'}}>Publicada 12 may. 2026 · token p4mp4-MORA-9087</div>
        </div>
      </div>
      <div className="adopt-cta">
        <div className="adopt-cta-inner">
          <button><i className="fa fa-paper-plane" /> Postular para adoptar a Mora</button>
          <div className="sub">El refugio responde en aproximadamente 5 días.</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ADOPCIÓN — Postular (form, single page, secciones numeradas)
// ============================================================
function AdoptPostular() {
  return (
    <div className="pubwrap" data-screen-label="Adopción · Postulación">
      <div className="pub-guilloche" />
      <PubHeader active="adoptar" />
      <div className="pub-main pub-main--mid" style={{maxWidth:640}}>
        <div className="pub-crumbs"><a href="#">Adoptar</a> › <a href="#">Mora</a> › <b>Postular</b></div>
        <section style={{background:'var(--a-card)',border:'1px solid var(--a-line)',borderRadius:8,padding:'16px 18px',marginBottom:14,display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:64,height:64,borderRadius:8,background:'repeating-linear-gradient(135deg,#e7e2d6 0 7px,#f1eee5 7px 14px)',display:'grid',placeItems:'center',flexShrink:0}}><span style={{fontFamily:'var(--a-mono)',fontSize:8,color:'var(--a-mute)'}}>MORA</span></div>
          <div>
            <div className="pub-eyebrow" style={{marginBottom:4}}>Postulación de adopción</div>
            <div style={{fontFamily:'var(--a-serif)',fontWeight:600,fontSize:22,letterSpacing:'-.015em'}}>Adoptar a Mora</div>
            <div style={{fontSize:12,color:'var(--a-mute)',marginTop:2}}>Mestiza · Hembra · 2 años · Refugio Belgrano R</div>
          </div>
        </section>
        <div className="dirA-callout" style={{marginBottom:18}}>
          <div className="dirA-callout-title"><i className="fa fa-info-circle" /> Tu contacto se comparte al enviar</div>
          <div className="dirA-callout-text">Tu información de contacto se comparte con el refugio cuando envíes la postulación. Antes de eso, solo ven tu nombre.</div>
        </div>

        <div className="adopt-q">
          <div className="adopt-q-label"><span className="adopt-q-num">01</span>¿Por qué querés adoptar a Mora?</div>
          <div className="adopt-q-hint">Contale al refugio qué te llamó la atención. Mínimo 50 caracteres.</div>
          <textarea className="dirA-textarea" rows="4" defaultValue="Vivimos en una casa con patio y desde que adoptamos a Bruno hace 4 años queremos sumar una compañera. Mora nos pareció ideal: buscamos una perra activa para salir a correr." />
          <div style={{textAlign:'right',fontSize:11,color:'var(--a-mute)',marginTop:4,fontFamily:'var(--a-mono)'}}>168 / 50 mínimo</div>
        </div>

        <div className="adopt-q">
          <div className="adopt-q-label"><span className="adopt-q-num">02</span>¿Tenés experiencia con perros?</div>
          <div style={{marginTop:10}}>
            <div className="adopt-radio is-sel"><span className="dot" /> Sí, mucha — tuve perros toda la vida</div>
            <div className="adopt-radio"><span className="dot" /> Algo — tuve perros antes pero no recientemente</div>
            <div className="adopt-radio"><span className="dot" /> Es mi primera vez</div>
          </div>
        </div>

        <div className="adopt-q">
          <div className="adopt-q-label"><span className="adopt-q-num">03</span>¿Cómo es tu hogar?</div>
          <div className="adopt-homegrid" style={{marginTop:10}}>
            {[['fa-tree','Casa con patio',true],['fa-building','Departamento'],['fa-home','Casa sin patio'],['fa-ellipsis-h','Otro']].map(([ic,l,sel]) => (
              <div key={l} className={'adopt-radio'+(sel?' is-sel':'')}><span className="dot" /><i className={'fa '+ic} style={{color:'var(--a-mute)',width:14}} /> {l}</div>
            ))}
          </div>
        </div>

        <div className="adopt-q">
          <div className="adopt-q-label"><span className="adopt-q-num">04</span>¿Tenés otros animales en casa?</div>
          <div style={{display:'flex',gap:8,margin:'10px 0 12px'}}>
            <div className="adopt-radio" style={{flex:1,justifyContent:'center'}}><span className="dot" /> No</div>
            <div className="adopt-radio is-sel" style={{flex:1,justifyContent:'center'}}><span className="dot" /> Sí</div>
          </div>
          <textarea className="dirA-textarea" rows="2" defaultValue="Tenemos a Bruno (perro mestizo, 5 años, castrado). Convivió con Frida (gata) hasta el año pasado, muy bien." />
        </div>

        <div className="adopt-contact">
          <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:8}}>
            <div className="pub-eyebrow" style={{margin:0}}>Tus datos de contacto</div>
            <div style={{flex:1}} /><a href="#" style={{fontSize:11,color:'var(--a-azul)',fontWeight:600,textDecoration:'none'}}>Editar mis datos</a>
          </div>
          <div className="adopt-contact-grid">
            <div className="k">Nombre</div><div className="v" style={{fontWeight:600}}>Camila Rodríguez</div>
            <div className="k">Email</div><div className="v">camila.rodriguez@gmail.com</div>
            <div className="k">Teléfono</div><div className="v">+54 11 4555 7890</div>
            <div className="k">Localidad</div><div className="v">Villa Crespo, CABA</div>
          </div>
        </div>

        <button className="dirA-btn dirA-btn--primary dirA-btn--block" style={{padding:'14px',fontSize:15}}><i className="fa fa-paper-plane" /> Enviar postulación</button>
        <div style={{textAlign:'center',fontSize:12,color:'var(--a-mute)',marginTop:10,lineHeight:1.5}}>El refugio responde en aproximadamente 5 días. Vas a poder seguir el caso desde tu cuenta.</div>
      </div>
      <PubFooter />
    </div>
  );
}

// ============================================================
// ADOPCIÓN — Éxito (postulación enviada)
// ============================================================
function AdoptOK() {
  return (
    <div className="pubwrap" data-screen-label="Adopción · Postulación enviada" style={{background:'var(--a-stripe)'}}>
      <div className="pub-guilloche" />
      <PubHeader active="adoptar" />
      <div className="pub-main pub-main--narrow" style={{maxWidth:480,textAlign:'center',paddingTop:40}}>
        <div className="wiz-success-ic" style={{margin:'0 auto 20px'}}><i className="fa fa-paper-plane" /></div>
        <h1 className="pub-h1" style={{fontSize:30}}>Postulación enviada</h1>
        <p className="pub-lead" style={{fontSize:15,margin:'0 auto 24px'}}>El Refugio Belgrano R recibió tu postulación para adoptar a Mora. Te contactan en aproximadamente 5 días.</p>
        <div className="pub-codecard" style={{textAlign:'center',maxWidth:340,margin:'0 auto 18px'}}>
          <div className="l">Código de tu postulación</div>
          <div className="code" style={{fontSize:22}}>POST-2026-0091</div>
          <div className="hint">Seguila desde «Mis postulaciones»</div>
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
          <button className="dirA-btn dirA-btn--primary"><i className="fa fa-list" /> Ver mis postulaciones</button>
          <button className="dirA-btn"><i className="fa fa-paw" /> Seguir mirando mascotas</button>
        </div>
        <div className="pub-banner" style={{marginTop:26,textAlign:'left'}}>
          <i className="fa fa-lightbulb-o" />
          <div>Mientras tanto: un perfil completo (con foto y una buena descripción de tu hogar) acelera la respuesta del refugio.</div>
        </div>
      </div>
      <PubFooter />
    </div>
  );
}

// ============================================================
// MIS POSTULACIONES (seguimiento) — desktop
// ============================================================
function MisPostulaciones() {
  const items = [
    { name:'Mora', org:'Refugio Belgrano R', when:'Enviada hace 2 días · POST-2026-0091', st:'revision', pill:['warn','En revisión'], stepLabels:['Enviada','En revisión','Entrevista','Resolución'], stage:1 },
    { name:'Nacho', org:'Patitas Felices · Vicente López', when:'Enviada hace 6 días · POST-2026-0087', st:'aceptada', pill:['ok','Entrevista propuesta'], stepLabels:['Enviada','En revisión','Entrevista','Resolución'], stage:2 },
    { name:'Frida', org:'Refugio Belgrano R', when:'Enviada hace 3 semanas · POST-2026-0061', st:'rechazada', pill:['celeste','No seleccionada'], stepLabels:['Enviada','En revisión','Entrevista','Resolución'], stage:4 },
  ];
  return (
    <div className="pubwrap" data-screen-label="Adopción · Mis postulaciones">
      <div className="pub-guilloche" />
      <PubHeader active="adoptar" />
      <div className="pub-main pub-main--mid">
        <div className="pub-crumbs"><a href="#">Mi cuenta</a> › <b>Mis postulaciones</b></div>
        <h1 className="pub-h1" style={{fontSize:32}}>Mis postulaciones</h1>
        <p className="pub-lead" style={{fontSize:15,marginBottom:22}}>Seguí el estado de las adopciones a las que te postulaste.</p>
        <div className="pub-track">
          {items.map(p => (
            <div key={p.name} className="pub-trackcard" data-st={p.st}>
              <div className="pub-track-photo">{p.name.toUpperCase()}</div>
              <div>
                <div className="pub-track-name">{p.name}</div>
                <div className="pub-track-org">{p.org}</div>
                <div className="pub-trackprog">
                  {p.stepLabels.map((l,i) => (
                    <React.Fragment key={l}>
                      <div className={'s'+(i<p.stage?' done':i===p.stage&&p.st!=='rechazada'?' curr':i===p.stage&&p.st==='rechazada'?' done':'')}><span className="d" /></div>
                      {i<p.stepLabels.length-1 && <span className="l" />}
                    </React.Fragment>
                  ))}
                </div>
                <div className="pub-track-when">{p.when}</div>
              </div>
              <div className="pub-track-side">
                <span className="pub-pill" data-tone={p.pill[0]}>{p.pill[1]}</span><br/>
                <a href="#">Ver detalle <i className="fa fa-angle-right" /></a>
              </div>
            </div>
          ))}
        </div>
      </div>
      <PubFooter />
    </div>
  );
}

// ============================================================
// PERFIL PÚBLICO DE REFUGIO — desktop
// ============================================================
function RefugioPerfil() {
  const pets = [
    ['MORA','Mora','Mestiza','Hembra · 2 años'],
    ['PELU','Pelusa','Mestiza pelo largo','Hembra · 3 años'],
    ['ORSO','Orson','Mastín cruza','Macho · 4 años'],
    ['FRID','Frida','Siamesa','Hembra · 2 años'],
    ['KIRA','Kira','Galga','Hembra · 5 años'],
    ['SIMB','Simba','Mestizo','Macho · 1 año'],
  ];
  return (
    <div className="pubwrap" data-screen-label="Refugio · Perfil público">
      <div className="pub-guilloche" />
      <PubHeader active="adoptar" />
      <div className="pub-main">
        <div className="pub-crumbs"><a href="#">Adoptar</a> › <a href="#">Refugios</a> › <b>Refugio Belgrano R</b></div>
        <div className="refu-hero">
          <div className="refu-band" />
          <div className="refu-main">
            <div className="refu-logo">R</div>
            <div className="refu-info">
              <div className="refu-name">Refugio Belgrano R <span className="dirA-verified"><i className="fa fa-check-circle" /> Verificado por GCBA</span></div>
              <div className="refu-meta"><i className="fa fa-map-marker" /> Av. Belgrano 1450, Belgrano · CABA · Activo desde 2017</div>
            </div>
            <div className="refu-actions">
              <button className="dirA-btn"><i className="fa fa-share-alt" /> Compartir</button>
              <button className="dirA-btn dirA-btn--primary"><i className="fa fa-heart" /> Seguir refugio</button>
            </div>
          </div>
        </div>
        <div className="refu-stats">
          <div className="refu-stat"><div className="v">38</div><div className="l">En adopción ahora</div></div>
          <div className="refu-stat"><div className="v">1.204</div><div className="l">Adopciones logradas</div></div>
          <div className="refu-stat"><div className="v">9</div><div className="l">Voluntarios activos</div></div>
          <div className="refu-stat"><div className="v">~5 d</div><div className="l">Responde en</div></div>
        </div>
        <div className="adopt-card" style={{maxWidth:'none'}}>
          <div className="eyebrow">Sobre el refugio</div>
          <p style={{margin:0}}>Somos un refugio sin fines de lucro en Belgrano. Rescatamos, rehabilitamos y damos en adopción responsable. Todas nuestras mascotas salen castradas, vacunadas y con microchip miMAR.</p>
        </div>
        <div className="pub-sec-head"><span className="n">01</span><h2>Mascotas en adopción</h2><span className="meta">38 disponibles</span></div>
        <div className="pub-grid">
          {pets.map(([cap,name,breed,meta]) => (
            <a key={name} href="#" className="pub-petcard">
              <div className="pub-photo"><span className="cap">FOTO · {cap}</span></div>
              <div className="pub-petbody">
                <div className="pub-petname">{name}</div>
                <div className="pub-petbreed">{breed}</div>
                <div className="pub-petmeta">{meta}</div>
                <div className="pub-petfoot"><i className="fa fa-check" style={{color:'var(--a-ok)'}} /> Lista para adoptar <span className="go">Ver ficha <i className="fa fa-angle-right" /></span></div>
              </div>
            </a>
          ))}
        </div>
      </div>
      <PubFooter />
    </div>
  );
}

Object.assign(window, { AdoptDetalle, AdoptPostular, AdoptOK, MisPostulaciones, RefugioPerfil });
