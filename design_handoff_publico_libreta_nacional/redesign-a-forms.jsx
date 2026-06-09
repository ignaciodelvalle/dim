// ============================================================
// DIRECCIÓN A — Forms complejos + Estados de perfil (Perdido / Fallecido)
// Estética "Libreta Nacional". Usa clases .dirA* de redesign-a*.css
// ============================================================

// ---------- helpers ----------
function AField({ label, req, opt, hint, children }) {
  return (
    <div className="dirA-field">
      <label className="dirA-flabel">{label}{req && <span className="req">*</span>}{opt && <span className="opt">{opt}</span>}</label>
      {children}
      {hint && <div className="dirA-fhint">{hint}</div>}
    </div>
  );
}
function ASheetPet({ name='Pampa', meta='Mestiza · Hembra · 4 años', st='ok' }) {
  return (
    <div className="dirA-sheetpet">
      <APhoto st={st} name={name.slice(0,4).toUpperCase()} />
      <div><div className="nm">{name}</div><div className="mt">{meta}</div></div>
      <span className="chg">CAMBIAR</span>
    </div>
  );
}
function AToggle({ label, sub, on, tone }) {
  return (
    <div className="dirA-tgrow">
      <span className={'dirA-tgl'+(on?' is-on':'')} data-tone={tone} />
      <div className="dirA-tgl-body"><div className="dirA-tgl-label">{label}</div><div className="dirA-tgl-sub">{sub}</div></div>
    </div>
  );
}

// ============================================================
// FORM 1 — REGISTRAR VACUNA
// ============================================================
function ASheetVacuna() {
  return (
    <div className="dirA-sheetwrap">
      <div className="dirA-sheet">
        <div className="dirA-sheet-route">?asiento=vacuna</div>
        <div className="dirA-sheet-head" data-tone="verde">
          <div className="dirA-sheet-hicon" data-tone="verde"><i className="fa fa-medkit" /></div>
          <div className="dirA-sheet-htext"><h2>Registrar vacuna</h2><div className="sub">Queda asentado y certificado en la libreta sanitaria.</div></div>
          <button className="dirA-sheet-close"><i className="fa fa-times" /></button>
        </div>
        <div className="dirA-sheet-body">
          <ASheetPet />
          <AField label="Vacuna" req>
            <input className="dirA-input" defaultValue="Antirrábica" placeholder="Empezá a escribir…" />
          </AField>
          <div className="dirA-row">
            <AField label="Fecha de aplicación" req><input className="dirA-input dirA-mono-in" defaultValue="22/05/2026" /></AField>
            <AField label="Próxima dosis" opt="opcional" hint="Sugerencia automática según el catálogo nacional.">
              <input className="dirA-input dirA-mono-in" defaultValue="22/05/2027" />
            </AField>
          </div>
          <div className="dirA-row">
            <AField label="Marca / laboratorio"><input className="dirA-input" placeholder="Ej: Nobivac" /></AField>
            <AField label="Lote"><input className="dirA-input dirA-mono-in" placeholder="A4421-N" /></AField>
          </div>
          <AField label="Aplicada por (vet / clínica)">
            <input className="dirA-input" defaultValue="Dra. Lucía Romero · Vet. Belgrano" />
          </AField>
          <div className="dirA-callout">
            <div className="dirA-callout-title"><i className="fa fa-certificate" /> Asiento certificable</div>
            <div className="dirA-callout-text">Si lo registra una veterinaria matriculada, el asiento queda firmado y sirve como comprobante oficial.</div>
          </div>
          <AField label="Notas"><textarea className="dirA-textarea" rows="2" placeholder="Observaciones, reacciones, contexto…" /></AField>
          <AField label="Adjuntos">
            <div className="dirA-filedrop"><i className="fa fa-paperclip" /> Foto del certificado o etiqueta · imagen o PDF · hasta 5 MB</div>
          </AField>
        </div>
        <div className="dirA-sheet-foot">
          <button className="dirA-btn">Cancelar</button>
          <div className="spacer" />
          <button className="dirA-btn dirA-btn--verde"><i className="fa fa-check" /> Registrar vacuna</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FORM 2 — REGISTRAR MEDICACIÓN (largo, 10+ campos)
// ============================================================
function ASheetMedicacion() {
  return (
    <div className="dirA-sheetwrap">
      <div className="dirA-sheet dirA-sheet--wide">
        <div className="dirA-sheet-route">?asiento=medicacion-inicio</div>
        <div className="dirA-sheet-head" data-tone="violeta">
          <div className="dirA-sheet-hicon" data-tone="violeta"><i className="fa fa-eyedropper" /></div>
          <div className="dirA-sheet-htext"><h2>Registrar inicio de medicación</h2><div className="sub">Generamos los recordatorios de cada dosis automáticamente.</div></div>
          <button className="dirA-sheet-close"><i className="fa fa-times" /></button>
        </div>
        <div className="dirA-sheet-body">
          <ASheetPet meta="Mestiza · Hembra · 4 años · 27,4 kg" />
          <AField label="Medicamento" req hint="Categoría: anti-inflamatorio inmunosupresor · Marca: Apoquel">
            <input className="dirA-input" defaultValue="Apoquel 16 mg" />
          </AField>
          <div className="dirA-row">
            <AField label="Dosis" req hint="Sugerencia según el peso de Pampa. Ajustá según indicación veterinaria.">
              <input className="dirA-input" defaultValue="1 comprimido" />
            </AField>
            <AField label="Frecuencia" req>
              <select className="dirA-select" defaultValue="q24h">
                <option value="q24h">Cada 24 horas</option>
                <option value="q12h">Cada 12 horas</option>
                <option value="q8h">Cada 8 horas</option>
                <option value="weekly">Semanal</option>
                <option value="custom">Personalizada…</option>
              </select>
            </AField>
          </div>
          <AField label="Primera dosis" req hint="Desde este momento empiezan los recordatorios de dosis.">
            <input className="dirA-input dirA-mono-in" defaultValue="22/05/2026 · 08:00" />
          </AField>
          <div className="dirA-row">
            <AField label="Duración del tratamiento" opt="días · opcional" hint="Sin duración: generamos recordatorios por 14 días.">
              <input className="dirA-input dirA-mono-in" placeholder="Ej. 7" />
            </AField>
            <AField label="Prescripto por"><input className="dirA-input" defaultValue="Dra. Lucía Romero" /></AField>
          </div>
          <div className="dirA-callout" data-tone="warn">
            <div className="dirA-callout-title"><i className="fa fa-bell" /> 14 recordatorios programados</div>
            <div className="dirA-callout-text">Vas a recibir un aviso cada día a las 08:00 hasta que marques el fin del tratamiento.</div>
          </div>
          <AField label="Notas"><textarea className="dirA-textarea" rows="2" placeholder="Indicaciones especiales, contexto clínico…" /></AField>
          <AField label="Adjuntos"><div className="dirA-filedrop"><i className="fa fa-paperclip" /> Receta o foto del envase · imagen o PDF</div></AField>
        </div>
        <div className="dirA-sheet-foot">
          <button className="dirA-btn">Cancelar</button>
          <div className="spacer" />
          <button className="dirA-btn dirA-btn--primary"><i className="fa fa-check" /> Registrar inicio</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FORM 3 — MARCAR COMO PERDIDA (el más complejo)
// ============================================================
function ASheetPerdida() {
  return (
    <div className="dirA-sheetwrap">
      <div className="dirA-sheet dirA-sheet--wide">
        <div className="dirA-sheet-route">?accion=marcar-perdida</div>
        <div className="dirA-sheet-head" data-tone="seal">
          <div className="dirA-sheet-hicon" data-tone="seal"><i className="fa fa-exclamation-triangle" /></div>
          <div className="dirA-sheet-htext"><h2>Marcar como perdida</h2><div className="sub">Su credencial pública pasa al modo emergencia.</div></div>
          <button className="dirA-sheet-close"><i className="fa fa-times" /></button>
        </div>
        <div className="dirA-sheet-body">
          <ASheetPet />

          <AField label="Última ubicación conocida" req>
            <div style={{display:'flex',alignItems:'center',gap:8,border:'1px solid var(--a-line-strong)',borderRadius:4,padding:'8px 11px',background:'var(--a-card)',marginBottom:8}}>
              <i className="fa fa-map-marker" style={{color:'var(--a-seal)'}} />
              <span style={{flex:1,fontSize:13}}>Av. Cabildo y Sucre, Belgrano</span>
              <span style={{fontFamily:'var(--a-mono)',fontSize:10,color:'var(--a-azul)',cursor:'pointer'}}>MOVER PIN</span>
            </div>
            <div className="dirA-lost-map" style={{height:140}}>
              <span className="dirA-map-tag">mapa · Belgrano, CABA</span>
              <span className="dirA-pin dirA-pin--last" style={{left:'50%',top:'52%'}}><span><i className="fa fa-exclamation" /></span></span>
              <div style={{position:'absolute',bottom:8,right:8,fontFamily:'var(--a-mono)',fontSize:9,background:'rgba(255,255,255,.85)',padding:'2px 6px',borderRadius:3,color:'var(--a-ink-2)'}}>-34.5614, -58.4571</div>
            </div>
          </AField>

          <AField label="Detalles"><textarea className="dirA-textarea" rows="2" placeholder="Cualquier detalle que ayude (collar, comportamiento, hora aproximada)" /></AField>

          {/* Enriched card */}
          <div className="dirA-subcard">
            <div className="dirA-callout" style={{margin:0}}>
              <div className="dirA-callout-title"><i className="fa fa-info-circle" /> Pampa no tiene chip ni tatuaje — sumá la mayor cantidad de detalles</div>
              <div className="dirA-callout-text">Esto va a aparecer en su credencial pública para que alguien pueda reconocerla.</div>
            </div>
            <div className="dirA-group">
              <div className="dirA-grouplbl">Identidad</div>
              <AField label="Color y pelaje"><input className="dirA-input" defaultValue="Negra con pecho blanco · pelo corto" /></AField>
              <AField label="Marcas distintivas"><textarea className="dirA-textarea" rows="2" defaultValue="Mancha blanca en la pata trasera izquierda. Una oreja caída." /></AField>
            </div>
            <div className="dirA-group">
              <div className="dirA-grouplbl">Al momento de perderse</div>
              <AField label="Accesorios que llevaba"><input className="dirA-input" placeholder="Ej: collar rojo con placa" /></AField>
              <AField label="Comportamiento y temperamento"><textarea className="dirA-textarea" rows="2" placeholder="Ej: se asusta de los autos, responde a su nombre" /></AField>
            </div>
            <div className="dirA-group">
              <div className="dirA-grouplbl">Microchip · opcional</div>
              <AField label="Número de microchip"><input className="dirA-input dirA-mono-in" placeholder="Ej: 982000411234567" /></AField>
            </div>
          </div>

          {/* Disclosure */}
          <div className="dirA-subcard">
            <div>
              <div style={{fontFamily:'var(--a-serif)',fontWeight:600,fontSize:14}}>¿Qué mostrar en la credencial pública?</div>
              <div style={{fontSize:11,color:'var(--a-mute)',marginTop:2}}>Solo aplica al modo perdida. Vuelve a la privacidad normal cuando la marques como encontrada.</div>
            </div>
            <AToggle on tone="warn" label="Mostrar mi primer nombre" sub="Aparece como «Avisar a Martín», no el apellido." />
            <AToggle on tone="warn" label="Mostrar mi teléfono" sub="La credencial mostrará un botón directo para llamarte." />
            <AToggle tone="warn" label="Mostrar mi email" sub="Por si prefieren escribir antes de llamar." />
            <AToggle on tone="warn" label="Mostrar la última ubicación conocida" sub="Aparece el barrio. La calle exacta queda privada." />
            <AToggle on tone="warn" label="Permitir que me avisen desde la credencial" sub="Alguien puede avisarte sin necesitar tu contacto." />
          </div>
        </div>
        <div className="dirA-sheet-foot">
          <button className="dirA-btn">Cancelar</button>
          <div className="spacer" />
          <button className="dirA-btn dirA-btn--warn"><i className="fa fa-bullhorn" /> Marcar como perdida</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FORM 4 — EDITAR MASCOTA (acordeones)
// ============================================================
function AAcc({ num, title, open, done, children }) {
  return (
    <details className="dirA-acc" open={open}>
      <summary className="dirA-acc-sum">
        <span className="num">{num}</span> {title}
        {done ? <span className="done"><i className="fa fa-check" /> completo</span> : <i className="fa fa-angle-right chev" />}
      </summary>
      <div className="dirA-acc-body">{children}</div>
    </details>
  );
}
function ASheetEditar() {
  return (
    <div className="dirA-sheetwrap">
      <div className="dirA-sheet dirA-sheet--wide">
        <div className="dirA-sheet-route">?accion=editar-mascota</div>
        <div className="dirA-sheet-head">
          <div className="dirA-sheet-hicon"><i className="fa fa-pencil" /></div>
          <div className="dirA-sheet-htext"><h2>Editar Pampa</h2><div className="sub">Cada cambio se asienta como un evento en el historial.</div></div>
          <button className="dirA-sheet-close"><i className="fa fa-times" /></button>
        </div>
        <div className="dirA-sheet-body">
          <div style={{display:'flex',gap:14,alignItems:'center'}}>
            <div className="dirA-photoup">CAMBIAR<br/>FOTO</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:'var(--a-serif)',fontWeight:600,fontSize:16}}>Foto de perfil</div>
              <div className="dirA-fhint" style={{marginTop:2}}>JPG / PNG / WebP · máx. 5 MB</div>
              <button className="dirA-btn dirA-btn--sm" style={{marginTop:8}}><i className="fa fa-camera" /> Cambiar foto</button>
            </div>
          </div>

          <AAcc num="01" title="Lo básico" open>
            <AField label="Nombre" req><input className="dirA-input" defaultValue="Pampa" /></AField>
            <div className="dirA-row">
              <AField label="Especie"><select className="dirA-select"><option>Perro</option><option>Gato</option><option>Otra…</option></select></AField>
              <AField label="Sexo"><select className="dirA-select"><option>Hembra</option><option>Macho</option><option>No sé</option></select></AField>
            </div>
            <div className="dirA-row">
              <AField label="Edad" opt="años"><input className="dirA-input dirA-mono-in" defaultValue="4" /></AField>
              <AField label="Edad" opt="meses"><input className="dirA-input dirA-mono-in" defaultValue="3" /></AField>
            </div>
            <AField label="¿Cómo llegó?"><select className="dirA-select" defaultValue="shelter"><option value="born_at_home">Nació en mi casa</option><option value="shelter">Adopté en refugio</option><option value="found_stray">La encontré en la calle</option></select></AField>
          </AAcc>

          <AAcc num="02" title="Identificación y raza" open>
            <AField label="Raza"><input className="dirA-input" defaultValue="Mestizo" /></AField>
            <div className="dirA-subcard" style={{background:'var(--a-stripe)'}}>
              <div className="dirA-subhead">Microchip</div>
              <div className="dirA-row">
                <AField label="Número (15 dígitos)"><input className="dirA-input dirA-mono-in" defaultValue="985 112 003 458 921" /></AField>
                <AField label="País"><input className="dirA-input dirA-mono-in" defaultValue="AR" /></AField>
              </div>
              <AField label="Fecha de implantación"><input className="dirA-input dirA-mono-in" defaultValue="15/04/2022" /></AField>
            </div>
          </AAcc>

          <AAcc num="03" title="Salud y vida diaria" done>
            <div className="dirA-row">
              <AField label="Peso estimado"><div className="dirA-suffix-wrap"><input defaultValue="27,4" /><div className="dirA-suffix">kg</div></div></AField>
              <AField label="Esterilizada"><select className="dirA-select"><option>Sí</option><option>No</option></select></AField>
            </div>
            <AField label="Alergias conocidas">
              <div className="dirA-chips">
                {['Pollo','Granos','Picaduras','Polen','Lácteos'].map((f,i) => <span key={f} className={'dirA-tagchip'+(i===0?' is-on':'')} data-tone="rojo">{f}</span>)}
              </div>
            </AField>
          </AAcc>

          <AAcc num="04" title="Condiciones permanentes" done>
            <div className="dirA-grouplbl" style={{marginBottom:8}}>Marcá las que correspondan</div>
            <div className="dirA-chips">
              {['Diabetes','Epilepsia','Sordera','Ceguera','Cardiopatía','Artritis','Dermatitis atópica','Hipotiroidismo'].map((c,i) => <span key={c} className={'dirA-tagchip'+(i===6?' is-on':'')} data-tone="warn">{c}</span>)}
            </div>
          </AAcc>

          <AAcc num="05" title="Credencial pública" done>
            <AToggle on label="Mostrar aviso de emergencia médica" sub="Aparece si Pampa tiene condiciones permanentes." />
            <AToggle label="Mostrar condiciones permanentes" sub="Útil si un vet de emergencia escanea el QR." />
          </AAcc>
        </div>
        <div className="dirA-sheet-foot">
          <button className="dirA-btn">Descartar</button>
          <div className="spacer" />
          <button className="dirA-btn dirA-btn--primary"><i className="fa fa-check" /> Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ESTADO PERFIL — PERDIDO (cockpit)
// ============================================================
function APerfilPerdido() {
  const scans = [
    { ic:'report', name:'María L.', new:true, meta:'«La vi cruzar Av. Cabildo cerca de la plaza · adjuntó 1 foto»', when:'hace 14m' },
    { ic:'report', name:'Anónimo', new:true, meta:'«Vista en Parque Las Heras, lado norte · iba sola, asustada»', when:'1h 48m' },
    { ic:'scan', name:'Escaneo de credencial', meta:'Av. Cabildo 2400 · iPhone Safari', when:'2h' },
    { ic:'scan', name:'Escaneo de credencial', meta:'Plaza Belgrano · Android Chrome', when:'2h 12m' },
    { ic:'report', name:'Doña Rosa', meta:'«Una perra parecida andaba ayer cerca de Heras»', when:'3h 20m' },
  ];
  return (
    <div className="dirA" data-screen-label="A · Perfil — Estado PERDIDO">
      <div className="dirA-guilloche" />
      <AMast active="mascotas" />
      <div className="dirA-subbar">
        <span className="dirA-crumbs">Mis Mascotas › Tomás › <b style={{color:'var(--a-seal)'}}>MODO EMERGENCIA</b></span>
        <span className="dirA-doccode">CAS-2026-0148 · credencial pública /p/tomas-x9k2</span>
      </div>
      <div className="dirA-body">
        <div className="dirA-doc" style={{maxWidth:840}}>
          {/* Banner */}
          <div className="dirA-lost-banner" style={{marginBottom:20}}>
            <span className="dirA-lost-stamp">EXPEDIENTE ABIERTO</span>
            <div className="dirA-lost-banner-ic"><i className="fa fa-exclamation" /></div>
            <div className="dirA-lost-banner-body">
              <div className="dirA-lost-banner-title">Tomás está perdido</div>
              <div className="dirA-lost-banner-meta">Credencial pública en modo emergencia · 312 vistas · 17 vecinos del barrio alertados</div>
            </div>
            <button className="dirA-lost-banner-cta"><i className="fa fa-check" /> Marcar encontrada</button>
          </div>

          <div className="dirA-grid2" style={{gridTemplateColumns:'1fr 300px'}}>
            <div style={{display:'flex',flexDirection:'column',gap:20}}>
              {/* Map */}
              <div className="dirA-card">
                <div className="dirA-card-head"><h3 style={{whiteSpace:'nowrap'}}>Última vez visto</h3><span className="dirA-label"><a href="#" style={{color:'var(--a-azul)',textDecoration:'none'}}>actualizar</a></span></div>
                <div className="dirA-lost-map">
                  <span className="dirA-map-tag">mapa · Belgrano, CABA</span>
                  <span className="dirA-pin dirA-pin--home" style={{left:'22%',top:'72%'}}><span><i className="fa fa-home" /></span></span>
                  <span className="dirA-pin dirA-pin--last" style={{left:'50%',top:'40%'}}><span><i className="fa fa-exclamation" /></span></span>
                  <span className="dirA-pin dirA-pin--sight" style={{left:'66%',top:'46%'}}><span><b>2</b></span></span>
                  <span className="dirA-pin dirA-pin--sight" style={{left:'58%',top:'70%'}}><span><b>3</b></span></span>
                </div>
                <div className="dirA-card-body" style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>Parque Las Heras, lado norte</div><div className="dirA-fhint">Hoy 09:14 · GPS confirmado · escapó de la correa</div></div>
                  <button className="dirA-share-btn"><i className="fa fa-search-plus" /> Ampliar</button>
                </div>
              </div>

              {/* Scan feed */}
              <div className="dirA-card">
                <div className="dirA-card-head"><h3>Avistamientos y escaneos</h3><span className="dirA-label" style={{color:'var(--a-seal)'}}>312 · 3 nuevos</span></div>
                <div className="dirA-card-body" style={{paddingTop:4,paddingBottom:4}}>
                  {scans.map((s,i) => (
                    <a key={i} href="#" className={'dirA-scan'+(s.new?' is-unread':'')}>
                      <div className={'dirA-scan-ic dirA-scan-ic--'+s.ic}><i className={'fa '+(s.ic==='report'?'fa-map-marker':'fa-qrcode')} /></div>
                      <div className="dirA-scan-body"><div className="dirA-scan-name">{s.name}{s.new && <span className="new">NUEVO</span>}</div><div className="dirA-scan-meta">{s.meta}</div></div>
                      <span className="dirA-scan-when">{s.when}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column */}
            <div style={{display:'flex',flexDirection:'column',gap:20}}>
              <div className="dirA-card">
                <div className="dirA-card-head"><h3>Compartir credencial</h3></div>
                <div className="dirA-card-body" style={{textAlign:'center'}}>
                  <div className="dirA-qr" style={{margin:'0 auto 12px'}} />
                  <div className="dirA-lost-url">mimar.gob.ar/p/tomas-x9k2</div>
                  <div className="dirA-lost-share-actions" style={{justifyContent:'center',marginTop:4}}>
                    <button className="dirA-share-btn dirA-share-btn--wa"><i className="fa fa-whatsapp" /> WhatsApp</button>
                    <button className="dirA-share-btn"><i className="fa fa-copy" /> Copiar</button>
                    <button className="dirA-share-btn"><i className="fa fa-print" /> Afiche</button>
                    <button className="dirA-share-btn"><i className="fa fa-download" /> QR</button>
                  </div>
                </div>
              </div>
              <div className="dirA-card">
                <div className="dirA-card-head"><h3>Datos visibles</h3></div>
                <div className="dirA-card-body" style={{display:'flex',flexDirection:'column',gap:8}}>
                  <AToggle on tone="warn" label="Primer nombre" sub="«Llamar a Martín»" />
                  <AToggle on tone="warn" label="Teléfono" sub="+54 9 11 ●●●● 7723" />
                  <AToggle tone="warn" label="Email" sub="solo si el tel. falla" />
                  <AToggle on tone="warn" label="Última ubicación" sub="pin de última vez visto" />
                </div>
              </div>
            </div>
          </div>

          <div style={{textAlign:'center',padding:'18px 0 4px'}}>
            <a href="#" style={{color:'var(--a-azul)',fontSize:13,fontWeight:600,textDecoration:'none'}}>Ver perfil normal de Tomás</a>
            <div className="dirA-fhint" style={{textAlign:'center',marginTop:4}}>Cuando lo marques como encontrado volvés acá automáticamente.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ESTADO PERFIL — FALLECIDO (in memoriam)
// ============================================================
function APerfilFallecido() {
  const events = [
    ['2022 · abr','Microchip implantado','985112004567890 · Vet. Belgrano','id-card','azul','microchip'],
    ['2022 · abr','Vacuna · Quíntuple','Dra. Romero · Vet. Belgrano','medkit','azul','vacuna'],
    ['2022 · jul','Peso','6,4 kg','balance-scale','celeste','peso'],
    ['2023 · feb','Esterilización','Vet. Belgrano · sin complicaciones','scissors','rosa','esterilizacion'],
    ['2023 · sep','Vacuna · Antirrábica','Dra. Romero · Vet. Belgrano','medkit','azul','vacuna'],
    ['2024 · ago','Diagnóstico clínico','Dermatitis atópica · Dra. Romero','file-text-o','celeste','clinico'],
    ['2024 · ago','Medicación · inicio','Apoquel 5,4 mg · 1× día','eyedropper','violeta','medicacion-inicio'],
    ['2025 · jun','Nota','«Empezó a renguear de la pata trasera derecha.»','sticky-note-o','amarillo','nota'],
    ['2025 · jul','Visita al veterinario','Radiografía de cadera · sin fractura','stethoscope','verde','vet'],
    ['2026 · ene','Medicación · fin','Apoquel · suspendido','eyedropper','violeta','medicacion-fin'],
    ['2026 · mar 14','Fallecimiento','Causa: natural · en casa','leaf','gris','fallecimiento'],
  ];
  return (
    <div className="dirA dirA-mem" data-screen-label="A · Perfil — Estado FALLECIDO">
      <div className="dirA-guilloche" style={{filter:'grayscale(.4)',opacity:.6}} />
      <AMast active="mascotas" />
      <div className="dirA-subbar">
        <span className="dirA-crumbs">Mis Mascotas › <b>Pampa</b> <span className="dirA-mem-chip" style={{marginLeft:8}}><i className="fa fa-leaf" /> En memoria</span></span>
        <span className="dirA-doccode">libreta cerrada · solo lectura</span>
      </div>
      <div className="dirA-body">
        <div className="dirA-mem-body">
          {/* Hero */}
          <div className="dirA-mem-hero">
            <div className="dirA-mem-photo"><span className="cap">FOTO · PAMPA</span></div>
            <h1 className="dirA-mem-name">Pampa</h1>
            <div className="dirA-mem-dates">En memoria <span className="sep">·</span> 2022 – 2026</div>
            <div className="dirA-mem-links">
              <a href="#">Editar mascota</a><span className="sep">·</span>
              <a href="#">Ver credencial pública</a><span className="sep">·</span>
              <a href="#">+ Agregar nota</a>
            </div>
          </div>

          {/* Read-only libreta */}
          <div className="dirA-mem-section">
            <div className="dirA-mem-eyebrow">Libreta sanitaria</div>
            <h2 className="dirA-mem-h2">Historial</h2>
            <div className="dirA-mem-note">Solo lectura. Los eventos registrados en vida se conservan.</div>
            <div className="dirA-mem-tl">
              {events.map(([when,title,sub,icon,color,kind],i) => (
                <div key={i} className="dirA-mem-ev" data-event-kind={kind}>
                  <div className="dirA-mem-when">{when}</div>
                  <div className={'dirA-mem-bullet dirA-mem-bullet--'+color}><i className={'fa fa-'+icon} /></div>
                  <div className="dirA-mem-evbody"><div className="dirA-mem-evtitle">{title}</div><div className="dirA-mem-evsub">{sub}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div style={{height:48}} />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ASheetVacuna, ASheetMedicacion, ASheetPerdida, ASheetEditar, APerfilPerdido, APerfilFallecido, ASheetPet, AField, AToggle, AAcc });
