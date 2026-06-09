// ============================================================
// DIRECCIÓN A — PÚBLICOS TANDA 2 · Parte 3
// Mostrar Libreta (sheet Tier 2) · Transferencias (dueño→org 3 pasos, org→org) · Reclamar
// Sheets reusan .dirA-sheet* (redesign-a-forms.css) + .dirA-stepper (public2.css)
// ============================================================

function TSheetHead({ icon, tone, title, sub, route }) {
  return (
    <>
      <div className="dirA-sheet-route">{route}</div>
      <div className="dirA-sheet-head" data-tone={tone}>
        <div className="dirA-sheet-hicon" data-tone={tone}><i className={'fa '+icon} /></div>
        <div className="dirA-sheet-htext"><h2>{title}</h2><div className="sub">{sub}</div></div>
        <button className="dirA-sheet-close"><i className="fa fa-times" /></button>
      </div>
    </>
  );
}
function Stepper({ steps, active }) {
  return (
    <div className="dirA-stepper">
      {steps.map((s,i) => (
        <React.Fragment key={s}>
          <div className={'dirA-stepper-step'+(i+1===active?' is-active':i+1<active?' is-done':'')}>
            <span className="num">{i+1<active ? <i className="fa fa-check" /> : i+1}</span> {s}
          </div>
          {i<steps.length-1 && <span className="dirA-stepper-line" />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ============================================================
// MOSTRAR LIBRETA — el dueño habilita Tier 2 (single step, sin stepper)
// ============================================================
function SheetMostrarLibreta() {
  const incl = [['Vacunas vigentes',true],['Antiparasitario reciente',true],['Esterilización',true],['Condiciones permanentes',true],['Medicación activa',true],['Vet de cabecera',false]];
  return (
    <div className="dirA-sheetwrap">
      <div className="dirA-sheet">
        <TSheetHead route="?accion=mostrar-libreta" icon="fa-eye" tone="" title="Mostrar libreta" sub="Habilitá temporalmente el Tier 2 de la credencial pública." />
        <div className="dirA-sheet-body">
          <ASheetPet />
          <div className="dirA-callout">
            <div className="dirA-callout-title"><i className="fa fa-info-circle" /> ¿Qué cambia al escanear el QR?</div>
            <div className="dirA-callout-text">Hoy se ve solo <b>identidad básica (Tier 0)</b>. Con esta acción, durante el lapso elegido también se muestra la <b>información médicamente relevante</b>: vacunas, antiparasitario, esterilización, condiciones y medicación. Nunca tu contacto ni la historia completa.</div>
          </div>
          <div className="dirA-field">
            <label className="dirA-flabel">Duración de la habilitación</label>
            <div className="dirA-optrow is-sel"><span className="radio" /><div className="body"><b>24 horas (recomendado)</b><span>Para una visita al vet o un viaje corto.</span></div></div>
            <div className="dirA-optrow"><span className="radio" /><div className="body"><b>7 días</b><span>Tránsito, cuidador temporal, escapadas de fin de semana.</span></div></div>
            <div className="dirA-optrow"><span className="radio" /><div className="body"><b>30 días</b><span>Internación, viaje largo, mudanza.</span></div></div>
            <div className="dirA-optrow"><span className="radio" /><div className="body"><b>Siempre visible</b><span>Útil para mascotas con condiciones crónicas. Revertible cuando quieras.</span></div></div>
          </div>
          <div className="dirA-field">
            <label className="dirA-flabel">Qué incluir en Tier 2</label>
            <div className="dirA-chips">
              {incl.map(([l,on]) => <span key={l} className={'dirA-tagchip'+(on?' is-on':'')}>{on && <i className="fa fa-check" style={{marginRight:5}} />}{l}</span>)}
            </div>
            <div className="dirA-fhint" style={{marginTop:8}}><i className="fa fa-lock" /> Nunca se expone: tu nombre completo, dirección, DNI ni notas privadas.</div>
          </div>
          <div style={{padding:'10px 12px',borderRadius:4,border:'1px dashed var(--a-line-strong)',background:'var(--a-stripe)',fontSize:12,color:'var(--a-mute)',display:'flex',alignItems:'center',gap:8}}>
            <i className="fa fa-link" /><span>El QR sigue apuntando a</span><span style={{fontFamily:'var(--a-mono)',color:'var(--a-ink)'}}>/p/pampa-x9k2</span><span style={{marginLeft:'auto',color:'var(--a-azul)',fontWeight:600}}>Vista previa →</span>
          </div>
        </div>
        <div className="dirA-sheet-foot">
          <button className="dirA-btn">Cancelar</button><div className="spacer" />
          <button className="dirA-btn dirA-btn--primary"><i className="fa fa-eye" /> Habilitar Tier 2</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TRANSFERIR (dueño → org) — PASO 1 · Tipo
// ============================================================
function SheetTransfer1() {
  return (
    <div className="dirA-sheetwrap">
      <div className="dirA-sheet dirA-sheet--wide">
        <TSheetHead route="?accion=transferir" icon="fa-exchange" tone="violeta" title="Transferir mascota" sub="Paso 1 de 3 · Tipo de transferencia" />
        <Stepper steps={['Tipo','Destinatario','Confirmar']} active={1} />
        <div className="dirA-sheet-body">
          <ASheetPet />
          <div className="dirA-callout">
            <div className="dirA-callout-title"><i className="fa fa-info-circle" /> Se transfiere la libreta completa</div>
            <div className="dirA-callout-text">La libreta entera (eventos, vacunas, microchip) queda asociada al destinatario cuando acepte. Tienen <b>14 días</b> para hacerlo.</div>
          </div>
          <div className="dirA-field">
            <label className="dirA-flabel">Tipo de transferencia <span className="req">*</span></label>
            <div className="dirA-optrow"><span className="radio" /><div className="body"><b>A otra persona</b><span>La mascota pasa a otra cuenta personal en miMAR.</span></div></div>
            <div className="dirA-optrow is-sel"><span className="radio" /><div className="body"><b>A una organización</b><span>Refugio, clínica veterinaria o red de rescate.</span></div></div>
            <div className="dirA-optrow"><span className="radio" /><div className="body"><b>Devolver a un refugio donde estuvo</b><span>Refugio Belgrano R · 12 mar. 2022 — 18 may. 2022</span></div></div>
          </div>
        </div>
        <div className="dirA-sheet-foot">
          <button className="dirA-btn">Cancelar</button><div className="spacer" />
          <button className="dirA-btn dirA-btn--primary">Continuar →</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TRANSFERIR (dueño → org) — PASO 2 · Destinatario
// ============================================================
function SheetTransfer2() {
  return (
    <div className="dirA-sheetwrap">
      <div className="dirA-sheet dirA-sheet--wide">
        <TSheetHead route="?accion=transferir&paso=2" icon="fa-exchange" tone="violeta" title="Transferir mascota" sub="Paso 2 de 3 · Destinatario" />
        <Stepper steps={['Tipo','Destinatario','Confirmar']} active={2} />
        <div className="dirA-sheet-body">
          <div className="dirA-field">
            <label className="dirA-flabel">Buscar organización <span className="req">*</span></label>
            <div className="dirA-suffix-wrap"><input placeholder="Nombre o token de la organización…" defaultValue="refugio-belgrano-r" style={{fontFamily:'var(--a-mono)'}} /><div className="dirA-suffix"><i className="fa fa-search" /></div></div>
          </div>
          <div className="dirA-field">
            <label className="dirA-flabel">Destinatario</label>
            <div className="dirA-party">
              <div className="dirA-party-logo">R</div>
              <div className="dirA-party-body">
                <div className="dirA-party-name">Refugio Belgrano R <span className="dirA-verified"><i className="fa fa-check-circle" /> Verificado</span></div>
                <div className="dirA-party-meta">refugio-belgrano-r · Belgrano, CABA · 38 en adopción</div>
              </div>
              <i className="fa fa-check-circle" style={{color:'var(--a-ok)',fontSize:18}} />
            </div>
          </div>
          <div className="dirA-field">
            <label className="dirA-flabel">Motivo de la transferencia <span style={{color:'var(--a-faint)',fontWeight:400}}>opcional</span></label>
            <textarea className="dirA-textarea" rows="3" defaultValue="Me mudo al exterior y no puedo llevarla. El refugio ya la conoce y se compromete a buscarle un buen hogar." />
          </div>
          <div className="dirA-callout" data-tone="warn">
            <div className="dirA-callout-title"><i className="fa fa-clock-o" /> Aceptación en 14 días</div>
            <div className="dirA-callout-text">El refugio recibe la solicitud y tiene 14 días para aceptarla. Mientras tanto seguís siendo el titular.</div>
          </div>
        </div>
        <div className="dirA-sheet-foot">
          <button className="dirA-btn">← Volver</button><div className="spacer" />
          <button className="dirA-btn dirA-btn--primary">Continuar →</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TRANSFERIR (dueño → org) — PASO 3 · Confirmar
// ============================================================
function SheetTransfer3() {
  return (
    <div className="dirA-sheetwrap">
      <div className="dirA-sheet dirA-sheet--wide">
        <TSheetHead route="?accion=transferir&paso=3" icon="fa-exchange" tone="violeta" title="Transferir mascota" sub="Paso 3 de 3 · Confirmar" />
        <Stepper steps={['Tipo','Destinatario','Confirmar']} active={3} />
        <div className="dirA-sheet-body">
          <div className="dirA-review">
            <div className="dirA-review-row"><div className="k">Mascota</div><div className="v">Pampa <small>Mestiza · Hembra · 4 años · chip 941…1357</small></div></div>
            <div className="dirA-review-row"><div className="k">Tipo</div><div className="v">A una organización</div></div>
            <div className="dirA-review-row"><div className="k">Destinatario</div><div className="v">Refugio Belgrano R <small>refugio-belgrano-r · verificado</small></div></div>
            <div className="dirA-review-row"><div className="k">Motivo</div><div className="v" style={{fontWeight:400}}>Me mudo al exterior y no puedo llevarla. El refugio ya la conoce.</div></div>
            <div className="dirA-review-row"><div className="k">Se transfiere</div><div className="v" style={{fontWeight:400}}>Libreta completa · 18 vacunas · historial clínico · microchip</div></div>
          </div>
          <div className="dirA-callout" data-tone="warn">
            <div className="dirA-callout-title"><i className="fa fa-exclamation-triangle" /> Ventana de aceptación de 14 días</div>
            <div className="dirA-callout-text">Al confirmar, le enviamos la solicitud al refugio. <b>Seguís siendo titular hasta que la acepten.</b> Podés cancelar la transferencia mientras esté pendiente.</div>
          </div>
          <label className="dirA-tgrow"><span className="dirA-tgl is-on" /><div className="dirA-tgl-body"><div className="dirA-tgl-label">Entiendo que pierdo la titularidad de Pampa cuando el refugio acepte.</div></div></label>
        </div>
        <div className="dirA-sheet-foot">
          <button className="dirA-btn">← Volver</button><div className="spacer" />
          <button className="dirA-btn dirA-btn--seal"><i className="fa fa-exchange" /> Confirmar transferencia</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TRANSFERENCIA ENTRE ORGS (admin) — bandeja + solicitud entrante
// ============================================================
function OrgTransferInbox() {
  const out = [
    ['Pampa','Refugio Belgrano R','→','Patitas Felices','Pendiente · 11 días','warn'],
    ['Roco','Refugio Belgrano R','→','Clínica Vet. del Parque','Aceptada · 2 may','ok'],
  ];
  const inb = [
    ['Simba','Patitas del Norte','Sumar a tu refugio','hace 1 día','12 días'],
    ['Nina','Red Rescate Sur','Tránsito → adopción','hace 3 días','9 días'],
  ];
  return (
    <div className="pubwrap" data-screen-label="Org · Transferencias entre organizaciones">
      <div className="pub-guilloche" />
      <PubHeader active="adoptar" />
      <div className="pub-main pub-main--mid">
        <div className="pub-crumbs"><a href="#">Refugio Belgrano R</a> › <b>Transferencias</b></div>
        <h1 className="pub-h1" style={{fontSize:30}}>Transferencias entre organizaciones</h1>
        <p className="pub-lead" style={{fontSize:15,marginBottom:22}}>Mové mascotas entre refugios, clínicas y redes de rescate. La libreta viaja con el animal.</p>

        <div className="pub-sec-head"><span className="n">01</span><h2>Solicitudes entrantes</h2><span className="meta">2 esperan tu respuesta</span></div>
        <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:28}}>
          {inb.map(([pet,from,role,when,exp]) => (
            <div key={pet} className="dirA-party" style={{background:'var(--a-card)',borderColor:'var(--a-line)'}}>
              <div className="dirA-party-logo" style={{background:'var(--a-celeste-050)',color:'var(--a-azul)',fontSize:20}}><i className="fa fa-paw" /></div>
              <div className="dirA-party-body">
                <div className="dirA-party-name">{pet} <span className="pub-pill" data-tone="warn" style={{marginLeft:4}}><i className="fa fa-hourglass-half" /> Expira en {exp}</span></div>
                <div className="dirA-party-meta">Desde <b style={{color:'var(--a-ink-2)'}}>{from}</b> · {role} · recibida {when}</div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <button className="dirA-btn dirA-btn--primary dirA-btn--sm"><i className="fa fa-check" /> Aceptar</button>
                <button className="dirA-btn dirA-btn--sm">Rechazar</button>
              </div>
            </div>
          ))}
        </div>

        <div className="pub-sec-head"><span className="n">02</span><h2>Transferencias salientes</h2><span className="meta"><a href="#" style={{color:'var(--a-azul)',textDecoration:'none'}}>+ Nueva transferencia</a></span></div>
        <div className="dirA-registry" style={{background:'var(--a-card)'}}>
          {out.map(([pet,from,arr,to,status,tone]) => (
            <div key={pet} className="dirA-reg-row" style={{gridTemplateColumns:'1fr auto',cursor:'default'}}>
              <div>
                <div className="dirA-reg-name" style={{fontSize:15}}>{pet}</div>
                <div className="dirA-reg-breed" style={{display:'flex',alignItems:'center',gap:8,marginTop:3}}><b style={{color:'var(--a-ink-2)',fontWeight:500}}>{from}</b> <i className="fa fa-long-arrow-right" style={{color:'var(--a-mute)'}} /> <b style={{color:'var(--a-azul)',fontWeight:600}}>{to}</b></div>
              </div>
              <span className="pub-pill" data-tone={tone}>{status}</span>
            </div>
          ))}
        </div>
      </div>
      <PubFooter />
    </div>
  );
}

// ============================================================
// RECLAMAR MASCOTA — desktop (buscar + 3 resultados)
// ============================================================
function PubReclamar() {
  return (
    <div className="pubwrap" data-screen-label="Reclamar mascota">
      <div className="pub-guilloche" />
      <PubHeader active="perdidas" />
      <div className="pub-main pub-main--mid">
        <div className="pub-crumbs"><a href="#">Mis mascotas</a> › <b>Reclamar</b></div>
        <h1 className="pub-h1" style={{fontSize:32}}>Reclamar una mascota</h1>
        <p className="pub-lead" style={{fontSize:15,marginBottom:22}}>Si tenés una mascota cuyo chip o tatuaje ya está registrado en miMAR, podés reclamarla acá.</p>

        <div className="pub-claim-search">
          <div className="dirA-flabel" style={{marginBottom:10}}>Buscar por</div>
          <div className="pub-seg">
            <button className="is-active"><i className="fa fa-microchip" /> Microchip</button>
            <button><i className="fa fa-paint-brush" /> Tatuaje</button>
          </div>
          <div className="pub-claim-field"><input defaultValue="982 000 360 117 458" /><button className="pub-search-btn"><i className="fa fa-search" /> Buscar</button></div>
        </div>

        <div className="pub-reslabel">Resultado · libre para reclamar</div>
        <div className="pub-claim-res">
          <div className="pub-claim-photo"><i className="fa fa-paw" /></div>
          <div>
            <div className="pub-claim-name">Roco</div>
            <div className="pub-claim-meta">Canino · mestizo · macho · ~5 años · marrón con manchas blancas</div>
            <div className="pub-claim-chip">Chip: <b>982 000 360 117 458</b></div>
          </div>
        </div>
        <button className="dirA-btn dirA-btn--primary dirA-btn--block" style={{marginTop:10,padding:'12px'}}><i className="fa fa-check-circle" /> Reclamarla</button>

        <div className="pub-reslabel">Resultado · ya tiene dueño registrado</div>
        <div className="pub-claim-res">
          <div className="pub-claim-photo"><i className="fa fa-paw" /></div>
          <div>
            <div className="pub-claim-name">Pampa</div>
            <div className="pub-claim-meta">Canino · border collie · hembra · 4 años · negra con blanco</div>
            <div className="pub-claim-chip">Chip: <b>982 000 360 117 209</b></div>
          </div>
        </div>
        <div className="pub-claim-note is-warn"><i className="fa fa-exclamation-triangle" /><div><b>Esta mascota ya tiene dueño.</b> Si creés que es un error o que sos el dueño legítimo, podés iniciar una disputa. Un agente del gobierno la revisa.</div></div>
        <button className="dirA-btn dirA-btn--block" style={{marginTop:8,padding:'11px',borderColor:'var(--a-azul)',color:'var(--a-azul)'}}><i className="fa fa-balance-scale" /> Iniciar disputa</button>

        <div className="pub-reslabel">Resultado · existente y marcada como perdida</div>
        <div className="pub-claim-res" data-st="lost">
          <div className="pub-claim-photo"><i className="fa fa-paw" /></div>
          <div>
            <div className="pub-claim-name">Tomás <span className="pub-cred-flag">PERDIDA</span></div>
            <div className="pub-claim-meta">Canino · caniche mediano · macho · 3 años · blanco crema</div>
            <div className="pub-claim-chip">Chip: <b>982 000 360 117 003</b></div>
          </div>
        </div>
        <div className="pub-claim-note is-lost"><i className="fa fa-map-pin" /><div><b>Tomás está marcado como PERDIDA desde el 16 de mayo.</b> Si lo encontraste, podés iniciar la devolución al dueño. La privacidad de ambos queda protegida — el reencuentro lo coordina miMAR.</div></div>
        <button className="dirA-btn dirA-btn--seal dirA-btn--block" style={{marginTop:8,padding:'12px'}}><i className="fa fa-paper-plane" /> Iniciar devolución</button>

        <div className="pub-reslabel">Resultado · sin registro previo</div>
        <div style={{background:'var(--a-card)',border:'1px solid var(--a-line)',borderRadius:6,padding:'30px 24px',textAlign:'center'}}>
          <div style={{width:54,height:54,borderRadius:'50%',background:'var(--a-stripe)',color:'var(--a-mute)',display:'inline-grid',placeItems:'center',fontSize:21,marginBottom:12,border:'2px dashed var(--a-line-strong)'}}><i className="fa fa-search-minus" /></div>
          <div style={{fontFamily:'var(--a-serif)',fontWeight:600,fontSize:16}}>No encontramos este chip en miMAR</div>
          <p style={{margin:'6px auto 16px',fontSize:13,color:'var(--a-mute)',maxWidth:400,lineHeight:1.5}}>Si sos su dueño, registrala como mascota nueva. Si te la encontraste en la calle, registrala con el chip para que pueda volver a casa.</p>
          <button className="dirA-btn dirA-btn--primary"><i className="fa fa-plus" /> Registrar como mascota nueva</button>
        </div>
      </div>
      <PubFooter />
    </div>
  );
}

Object.assign(window, { SheetMostrarLibreta, SheetTransfer1, SheetTransfer2, SheetTransfer3, OrgTransferInbox, PubReclamar });
