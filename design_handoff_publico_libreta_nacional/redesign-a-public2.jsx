// ============================================================
// DIRECCIÓN A — PÚBLICOS TANDA 2 · Parte 1
// Credencial por tiers (0 / 0+ / 2) · Denuncia wizard (5 pasos) + éxito + buscar + detalle
// Estética "Libreta Nacional". Mobile = phone frame.
// ============================================================

// ---------- Phone frame ----------
function Phone({ url, children, bg }) {
  return (
    <div className="phonestage">
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-status">
          <span className="time">9:41</span>
          <span className="icons"><i className="fa fa-signal" /><i className="fa fa-wifi" /><i className="fa fa-battery-three-quarters" /></span>
        </div>
        {url && <div className="phone-urlbar"><i className="fa fa-lock lock" /><span className="u">{url}</span><i className="fa fa-ellipsis-v" /></div>}
        <div className="phone-scroll" style={bg ? {background:bg} : null}>{children}</div>
        <div className="phone-home" />
      </div>
    </div>
  );
}

function CredOfficial({ tier }) {
  return (
    <div className="cred-official">
      <span className="crest">m</span>
      <div><b>miMAR</b><span>Credencial pública</span></div>
      <span className="tier">{tier}</span>
    </div>
  );
}

// ============================================================
// CREDENCIAL — TIER 0 (identidad básica)
// ============================================================
function CredTier0() {
  return (
    <div className="pubwrap" data-screen-label="Credencial · Tier 0 (básica)">
      <Phone url="mimar.gob.ar/p/pampa-x9k2">
        <div className="cred">
          <div className="cred-card">
            <div className="cred-band" />
            <CredOfficial tier="TIER 0 · IDENTIDAD" />
            <div className="cred-photo"><span className="cap">FOTO · PAMPA</span></div>
            <div className="cred-namebar">
              <div className="cred-name">Pampa <span className="cred-statusdot" /></div>
              <div className="cred-breed">Mestiza · Hembra · 4 años · Negra con pecho blanco</div>
            </div>
            <div className="cred-sec">
              <div className="lbl">Identidad registrada <span className="pad">verificada</span></div>
              <div className="cred-idgrid">
                <div><div className="k">Especie</div><div className="v">Canina</div></div>
                <div><div className="k">Tamaño</div><div className="v">Mediano · 18 kg</div></div>
                <div><div className="k">Microchip</div><div className="v mono">941 0000 2468 1357</div></div>
                <div><div className="k">Libreta</div><div className="v mono">LIB-AR-2022-088</div></div>
              </div>
            </div>
            <div className="cred-sec">
              <div className="lbl">Estado</div>
              <div style={{display:'flex',alignItems:'center',gap:9,fontSize:13,color:'var(--a-ink-2)'}}>
                <span className="pub-pill" data-tone="ok"><i className="fa fa-check" /> En casa · con su familia</span>
              </div>
            </div>
            <div className="cred-actions">
              <button className="cred-btn cred-btn--report"><i className="fa fa-bell" /> Avisar al dueño que la viste</button>
              <div style={{textAlign:'center',fontSize:11.5,color:'var(--a-mute)'}}>El dueño recibe el aviso sin que se compartan tus datos.</div>
            </div>
            <div className="cred-foot">CREDENCIAL PÚBLICA · mimar.gob.ar/p/pampa-x9k2<br/>Registro Nacional de Mascotas · República Argentina</div>
          </div>
        </div>
      </Phone>
    </div>
  );
}

// ============================================================
// CREDENCIAL — TIER 0+ (con alerta médica)
// ============================================================
function CredTier0Plus() {
  return (
    <div className="pubwrap" data-screen-label="Credencial · Tier 0+ (alerta médica)">
      <Phone url="mimar.gob.ar/p/boris-7h3k">
        <div className="cred">
          <div className="cred-card">
            <div className="cred-band" />
            <CredOfficial tier="TIER 0+ · ALERTA" />
            <div className="cred-photo"><span className="cap">FOTO · BORIS</span></div>
            <div className="cred-namebar">
              <div className="cred-name">Boris <span className="cred-statusdot" /></div>
              <div className="cred-breed">Europeo común · Macho · 7 años · Atigrado gris</div>
            </div>
            <div className="cred-alert is-crit">
              <i className="fa fa-heartbeat" />
              <div className="t"><b>Alerta médica</b><span>Diabético insulinodependiente. Si aparece desorientado o convulsiona, contactar al dueño y a un veterinario de urgencia.</span></div>
            </div>
            <div className="cred-sec">
              <div className="lbl">Condiciones permanentes</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                <span className="adopt-cond">Diabetes mellitus</span>
                <span className="adopt-cond">Cardiopatía leve</span>
              </div>
            </div>
            <div className="cred-sec">
              <div className="lbl">Identidad registrada <span className="pad">verificada</span></div>
              <div className="cred-idgrid">
                <div><div className="k">Especie</div><div className="v">Felina</div></div>
                <div><div className="k">Tamaño</div><div className="v">Mediano · 5,2 kg</div></div>
                <div><div className="k">Microchip</div><div className="v mono">941 0000 7781 2290</div></div>
                <div><div className="k">Libreta</div><div className="v mono">LIB-AR-2019-204</div></div>
              </div>
            </div>
            <div className="cred-actions">
              <button className="cred-btn cred-btn--report"><i className="fa fa-bell" /> Avisar al dueño que lo viste</button>
              <button className="cred-btn cred-btn--ghost"><i className="fa fa-stethoscope" /> Soy veterinario · ver libreta médica</button>
            </div>
            <div className="cred-foot">CREDENCIAL PÚBLICA · mimar.gob.ar/p/boris-7h3k<br/>La alerta médica es siempre visible por seguridad del animal</div>
          </div>
        </div>
      </Phone>
    </div>
  );
}

// ============================================================
// CREDENCIAL — TIER 2 (libreta médica visible · vet)
// ============================================================
function CredTier2() {
  return (
    <div className="pubwrap" data-screen-label="Credencial · Tier 2 (libreta médica)">
      <Phone url="mimar.gob.ar/p/pampa-x9k2">
        <div className="cred">
          <div className="cred-card">
            <div className="cred-band cred-band--ok" />
            <CredOfficial tier="TIER 2 · MÉDICO" />
            <div className="cred-photo"><span className="cap">FOTO · PAMPA</span></div>
            <div className="cred-namebar">
              <div className="cred-name">Pampa <span className="cred-statusdot" /></div>
              <div className="cred-breed">Mestiza · Hembra · 4 años · 18 kg</div>
            </div>
            <div className="cred-enabled"><i className="fa fa-unlock-alt" /> El dueño habilitó la libreta médica hasta el 09/06/2026 · 20:14</div>
            <div className="cred-sec">
              <div className="lbl">Vacunas vigentes</div>
              <div className="cred-med"><span className="cred-med-ic"><i className="fa fa-check" /></span><div className="cred-med-body"><div className="cred-med-name">Antirrábica</div><div className="cred-med-sub">12/03/2026 · vence 03/2027</div></div><span className="cred-med-stamp">Vigente</span></div>
              <div className="cred-med"><span className="cred-med-ic"><i className="fa fa-check" /></span><div className="cred-med-body"><div className="cred-med-name">Quíntuple (DHPPI)</div><div className="cred-med-sub">12/03/2026 · vence 03/2027</div></div><span className="cred-med-stamp">Vigente</span></div>
              <div className="cred-med"><span className="cred-med-ic is-due"><i className="fa fa-clock-o" /></span><div className="cred-med-body"><div className="cred-med-name">Antipulgas / garrapatas</div><div className="cred-med-sub">Bravecto · vence 02/06/2026</div></div><span className="cred-med-stamp is-due">Por vencer</span></div>
            </div>
            <div className="cred-sec">
              <div className="lbl">Estado clínico</div>
              <div className="cred-med"><span className="cred-med-ic is-info"><i className="fa fa-scissors" /></span><div className="cred-med-body"><div className="cred-med-name">Esterilizada</div><div className="cred-med-sub">Castrada en feb. 2026</div></div></div>
              <div className="cred-med"><span className="cred-med-ic is-info"><i className="fa fa-cutlery" /></span><div className="cred-med-body"><div className="cred-med-name">Dieta hipoalergénica</div><div className="cred-med-sub">Condición permanente · sin pollo</div></div></div>
            </div>
            <div className="cred-actions">
              <button className="cred-btn cred-btn--call"><i className="fa fa-plus-circle" /> Soy vet · asentar un evento</button>
              <div style={{textAlign:'center',fontSize:11.5,color:'var(--a-mute)'}}>Lo que asentás queda en la libreta. El dueño recibe el aviso.</div>
            </div>
            <div className="cred-foot">TIER 2 HABILITADO POR EL DUEÑO · no incluye nombre, dirección ni contacto<br/>Registro Nacional de Mascotas · República Argentina</div>
          </div>
        </div>
      </Phone>
    </div>
  );
}

// ============================================================
// DENUNCIA — WIZARD 5 PASOS
// ============================================================
function WizSteps({ step }) {
  const steps = [1,2,3,4,5];
  const labels = { 1:'Qué pasó', 2:'Gravedad', 3:'Dónde y cuándo', 4:'Sobre quién', 5:'Cerrar' };
  return (
    <div className="wiz-top">
      <button className="wiz-back" style={step===1?{visibility:'hidden'}:null}><i className="fa fa-angle-left" /></button>
      <div className="wiz-steps">
        {steps.map((s,i) => (
          <div key={s} className={'wiz-stepdot'+(s<step?' is-done':s===step?' is-current':'')}>
            <span className="n">{s<step ? <i className="fa fa-check" /> : s}</span>
            {i<steps.length-1 && <span className="bar" />}
          </div>
        ))}
      </div>
      <div className="wiz-stepcount">Paso <b>{step}</b> de 5 · {labels[step]}</div>
    </div>
  );
}

function DenWizard1() {
  const kinds = [
    ['🚪','Abandono','Lo dejaron solo, atado en la calle, etc.',true],
    ['🍃','Negligencia','Sin comida, agua, refugio o atención médica.'],
    ['🩹','Maltrato físico','Golpes, heridas visibles, miedo extremo.'],
    ['⛓️','Encadenamiento','Atado permanentemente, sin libertad.'],
    ['🏚️','Acumulación','Muchos animales en condiciones precarias.'],
    ['❓','Otra cosa','Lo que viste no encaja en lo de arriba.'],
  ];
  return (
    <div className="pubwrap" data-screen-label="Denuncia · Paso 1/5">
      <Phone>
        <div className="wiz">
          <WizSteps step={1} />
          <div className="wiz-body">
            <h1 className="wiz-h1">¿Qué pasó?</h1>
            <p className="wiz-sub">Elegí lo que más se parece a lo que viste. Después contás el detalle.</p>
            {kinds.map(([e,l,d,sel]) => (
              <div key={l} className={'wiz-kind'+(sel?' is-sel':'')}><span className="em">{e}</span><span className="tx"><b>{l}</b><span>{d}</span></span><span className="radio" /></div>
            ))}
            <button className="wiz-cta">Continuar →</button>
          </div>
        </div>
      </Phone>
    </div>
  );
}
function DenWizard2() {
  return (
    <div className="pubwrap" data-screen-label="Denuncia · Paso 2/5">
      <Phone>
        <div className="wiz">
          <WizSteps step={2} />
          <div className="wiz-body">
            <h1 className="wiz-h1">¿Qué tan grave es?</h1>
            <p className="wiz-sub">Es tu mejor estimación. El equipo prioriza y verifica.</p>
            <label className="wiz-sev" data-tone="red"><div className="em">🚨</div><div className="t">Grave / urgente</div><div className="s">Riesgo de vida ahora mismo. Heridas visibles, animal sin reaccionar.</div></label>
            <label className="wiz-sev is-sel" data-tone="amber"><div className="em">⚠️</div><div className="t">Moderado</div><div className="s">Sufrimiento sostenido pero no inminente.</div></label>
            <label className="wiz-sev" data-tone="neutral"><div className="em">🔍</div><div className="t">Sospecha</div><div className="s">Algo no cuadra y querés que vayan a chequear.</div></label>
            <button className="wiz-cta">Continuar →</button>
          </div>
        </div>
      </Phone>
    </div>
  );
}
function DenWizard3() {
  return (
    <div className="pubwrap" data-screen-label="Denuncia · Paso 3/5">
      <Phone>
        <div className="wiz">
          <WizSteps step={3} />
          <div className="wiz-body">
            <h1 className="wiz-h1">¿Dónde y cuándo?</h1>
            <label className="wiz-flabel">Contanos lo que viste <span className="req">*</span></label>
            <textarea className="wiz-textarea" rows="4" defaultValue="Había un perro atado a un poste hace 3 días, sin agua ni comida. Está visible desde la vereda y los vecinos ya le dejaron agua un par de veces pero nadie se hace cargo." />
            <div className="wiz-charcount">194 / 2000</div>
            <label className="wiz-flabel">¿Cuándo pasó? <span className="req">*</span></label>
            <div className="wiz-when"><span className="dot" /><div><b>Ahora mismo</b><span>Lo estoy viendo.</span></div></div>
            <div className="wiz-when is-sel"><span className="dot" /><div><b>Hoy o ayer</b><span>Pasó en las últimas 48 h.</span></div></div>
            <div className="wiz-when"><span className="dot" /><div><b>Hace varios días</b><span>Sigue ocurriendo o lo vi hace tiempo.</span></div></div>
            <label className="wiz-flabel">¿Dónde? <span className="req">*</span></label>
            <div className="wiz-input" style={{display:'flex',alignItems:'center',gap:8}}><i className="fa fa-map-marker" style={{color:'var(--a-seal)'}} /> Av. Suárez 1200, Barracas, CABA</div>
            <div className="wiz-map"><span className="coords">-34.6431, -58.3850</span><span style={{position:'absolute',top:'46%',left:'50%',transform:'translate(-50%,-100%)',fontSize:28}}>📍</span></div>
            <button className="wiz-cta">Continuar →</button>
          </div>
        </div>
      </Phone>
    </div>
  );
}
function DenWizard4() {
  return (
    <div className="pubwrap" data-screen-label="Denuncia · Paso 4/5">
      <Phone>
        <div className="wiz">
          <WizSteps step={4} />
          <div className="wiz-body">
            <h1 className="wiz-h1">¿Sobre quién?</h1>
            <p className="wiz-sub">Es opcional, pero ayuda a la investigación. Si no sabés, podés saltearlo.</p>
            <div className="wiz-kind is-sel" style={{flexDirection:'column',alignItems:'stretch',gap:0}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}><span className="em">🐾</span><span className="tx"><b>Una mascota</b><span>Registrada o no en miMAR.</span></span><span className="radio" /></div>
              <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--a-line-2)'}}>
                <label className="wiz-flabel" style={{marginTop:0}}>Token público <span style={{color:'var(--a-faint)',fontWeight:400}}>(opcional)</span></label>
                <div className="wiz-input" style={{fontFamily:'var(--a-mono)',color:'var(--a-faint)'}}>DIM-XXXX-XXXX</div>
                <label className="wiz-flabel">Descripción del animal</label>
                <div className="wiz-input">Perro mediano, marrón, collar rojo. Atado al poste de luz frente al 1200.</div>
              </div>
            </div>
            <div className="wiz-kind"><span className="em">🐕</span><span className="tx"><b>Animal sin dueño / no lo sé</b></span><span className="radio" /></div>
            <div className="wiz-kind" style={{borderStyle:'dashed',color:'var(--a-mute)'}}><span className="em">🏢</span><span className="tx"><b style={{color:'var(--a-mute)'}}>Edificio / persona / lugar específico</b></span></div>
            <button className="wiz-cta">Continuar →</button>
            <button className="wiz-skip">Saltear este paso</button>
          </div>
        </div>
      </Phone>
    </div>
  );
}
function DenWizard5() {
  return (
    <div className="pubwrap" data-screen-label="Denuncia · Paso 5/5">
      <Phone>
        <div className="wiz">
          <WizSteps step={5} />
          <div className="wiz-body">
            <h1 className="wiz-h1">¿Cómo querés enviarla?</h1>
            <div className="wiz-kind"><span className="em">🕵️</span><span className="tx"><b>Enviar anónima</b><span>Sin datos de contacto. El código DEN-XXXX es tu única forma de seguimiento.</span></span><span className="radio" /></div>
            <div className="wiz-kind is-sel" style={{flexDirection:'column',alignItems:'stretch',gap:0}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}><span className="em">📞</span><span className="tx"><b>Sumar mi contacto (más útil)</b><span>Email o teléfono. Sin DNI. El equipo puede contactarte.</span></span><span className="radio" /></div>
              <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--a-line-2)'}}>
                <label className="wiz-flabel" style={{marginTop:0}}>Email <span style={{color:'var(--a-faint)',fontWeight:400}}>(opcional)</span></label>
                <div className="wiz-input">vecino_barracas@correo.ar</div>
                <label className="wiz-flabel">Teléfono <span style={{color:'var(--a-faint)',fontWeight:400}}>(opcional)</span></label>
                <div className="wiz-input" style={{fontFamily:'var(--a-mono)'}}>+54 9 11 4456 7723</div>
              </div>
            </div>
            <button className="wiz-cta">Enviar denuncia →</button>
            <p className="wiz-note">Al enviar confirmás que lo que describiste es lo que viste. No se requiere certeza — solo buena fe.</p>
          </div>
        </div>
      </Phone>
    </div>
  );
}
function DenWizardOK() {
  return (
    <div className="pubwrap" data-screen-label="Denuncia · Éxito">
      <Phone>
        <div className="wiz">
          <div style={{height:3,background:'var(--a-azul)'}} />
          <div className="wiz-success">
            <div className="wiz-success-ic"><i className="fa fa-check" /></div>
            <h1>Denuncia registrada</h1>
            <p>Tu denuncia fue recibida. Gracias por animarte a denunciar.</p>
            <div className="pub-codecard"><div className="l">Tu código de seguimiento</div><div className="code">DEN-7Q8M-X9K2</div><div className="hint">Tocá para copiar</div></div>
            <div className="pub-warnbox">Si enviaste anónima, este código es la <b>única forma</b> de volver a esta denuncia.</div>
            <button className="wiz-cta" style={{marginTop:0}}>Ver mi denuncia →</button>
            <button className="cred-btn cred-btn--ghost" style={{width:'100%',marginTop:8}}>Volver al inicio</button>
          </div>
        </div>
      </Phone>
    </div>
  );
}

// ============================================================
// DENUNCIA — Buscar por código (desktop narrow)
// ============================================================
function DenBuscar() {
  return (
    <div className="pubwrap" data-screen-label="Denuncia · Buscar por código">
      <div className="pub-guilloche" />
      <PubHeader active="denunciar" />
      <div className="pub-main pub-main--narrow" style={{maxWidth:520}}>
        <div className="pub-crumbs"><a href="#">Inicio</a> › <a href="#">Denunciar</a> › <b>Buscar mi denuncia</b></div>
        <h1 className="pub-h1" style={{fontSize:32}}>Buscar mi denuncia</h1>
        <p className="pub-lead" style={{fontSize:15,marginBottom:24}}>Si denunciaste de forma anónima, volvé a tu denuncia con el código que recibiste al enviarla.</p>
        <div style={{background:'var(--a-card)',border:'1px solid var(--a-line)',borderRadius:6,padding:22}}>
          <label className="dirA-flabel">Código de seguimiento</label>
          <div className="pub-claim-field"><input defaultValue="DEN-7Q8M-X9K2" style={{flex:1}} /><button className="pub-search-btn"><i className="fa fa-search" /> Buscar</button></div>
          <div className="dirA-fhint" style={{marginTop:8}}>Formato: DEN-XXXX-XXXX · distingue mayúsculas. Pegalo tal cual te lo enviamos.</div>
        </div>
      </div>
      <PubFooter />
    </div>
  );
}

// ============================================================
// DENUNCIA — Detalle público (DEN-)
// ============================================================
function DenDetalle() {
  const tline = [
    ['21 may · 16:00','Denuncia recibida','Categoría: abandono · severidad moderada','done'],
    ['22 may · 09:30','En triage','Equipo de bienestar animal · CABA','done'],
    ['23 may · 11:00','Asignada a inspección','Agente designado · M-CABA-0987','current'],
    ['—','Inspección en territorio','Pendiente · plazo legal 30 días','pending'],
    ['—','Resolución','Pendiente','pending'],
  ];
  return (
    <div className="pubwrap" data-screen-label="Denuncia · Detalle público (DEN-)">
      <div className="pub-guilloche" />
      <PubHeader active="denunciar" />
      <div className="pub-main pub-main--narrow">
        <div className="pub-crumbs"><a href="#">Buscar otra denuncia</a></div>
        <div className="pub-banner" style={{background:'#eef6f0',borderColor:'#c8e2d2',borderLeftColor:'var(--a-ok)',marginTop:0}}>
          <i className="fa fa-check-circle" style={{color:'var(--a-ok)'}} />
          <div>Tu denuncia fue registrada. Gracias por animarte a denunciar. Guardá tu código para seguirla.</div>
        </div>
        <div className="pub-eyebrow">Seguimiento de denuncia</div>
        <div className="pub-case-codes">
          <h1 className="pub-h1" style={{fontSize:30,margin:0}}>Abandono</h1>
          <span className="pub-case-code">DEN-7Q8M-X9K2</span>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6}}>
          <span className="pub-pill" data-tone="azul"><i className="fa fa-clock-o" /> En inspección</span>
          <span className="pub-pill" data-tone="warn">Severidad moderada</span>
          <span className="pub-pill" data-tone="azul">CABA · Barracas</span>
        </div>
        <div className="pub-panel" style={{marginTop:18}}>
          <h2>Resumen</h2>
          <dl className="pub-dl">
            <dt>Qué pasó</dt><dd>Perro atado a un poste hace 3 días, sin agua ni comida.</dd>
            <dt>Dónde</dt><dd>Av. Suárez 1200, Barracas · CABA</dd>
            <dt>Recibida</dt><dd>21 may 2026 · 16:00</dd>
            <dt>Enviada por</dt><dd>Con contacto (privado)</dd>
          </dl>
        </div>
        <div className="pub-panel">
          <h2>Estado del trámite</h2>
          <ol className="pub-tline">
            {tline.map(([when,label,sub,st],i) => (
              <li key={i}><span className="pub-tdot" data-st={st} /><div className={'pub-titem'+(st==='pending'?' is-pending':'')}><b>{label}</b><span>{sub}</span></div><div className="pub-twhen">{when}</div></li>
            ))}
          </ol>
        </div>
        <div className="pub-protected">
          <div className="pub-protected-head"><i className="fa fa-lock" /><h3>Privacidad protegida</h3></div>
          <p>Tu identidad, tu contacto y el domicilio exacto <b style={{color:'var(--a-ink)'}}>no son públicos</b>. Solo vos —con este código— y el equipo interviniente ven el detalle completo.</p>
        </div>
        <div className="pub-legal">Ley 14.346 (maltrato animal) · Ley 25.326 (protección de datos)<br/>Código DEN-7Q8M-X9K2 · última actualización 23 may 2026 · 11:00 hs.</div>
      </div>
      <PubFooter />
    </div>
  );
}

Object.assign(window, { Phone, CredTier0, CredTier0Plus, CredTier2, DenWizard1, DenWizard2, DenWizard3, DenWizard4, DenWizard5, DenWizardOK, DenBuscar, DenDetalle });
