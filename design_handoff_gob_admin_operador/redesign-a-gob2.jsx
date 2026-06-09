// ============================================================
// DIRECCIÓN A — TIER OPERADOR · Gob parte 2
// Casos índice · Maltrato cola (triage) · Expediente de maltrato
// ============================================================

const GOB_STATUS = {
  open:{l:'Abierto',t:'open'}, triaged:{l:'Triada',t:'triaged'}, escalated:{l:'Escalado',t:'escalated'},
  in_progress:{l:'Investigación',t:'progress'}, closed:{l:'Cerrado',t:'closed'},
};
const GOB_SEV = { critical:['Crítica','var(--g-sev-crit)'], high:['Alta','var(--g-sev-high)'], medium:['Media','var(--g-sev-med)'], low:['Baja','var(--g-sev-low)'] };

// ============================================================
// GOB · CASOS (índice unificado)
// ============================================================
function GobCasos() {
  const C = window.GOB_CASES;
  return (
    <div className="gob" data-screen-label="Gob · Casos regulatorios">
      <GobRail active="casos" />
      <div className="gob-main">
        <GobTopbar crumbs={['Casos']} scope="UNIVERSAL">
          <button className="gob-tbtn"><i className="fa fa-filter" /> Filtros</button>
          <button className="gob-tbtn"><i className="fa fa-download" /> Exportar</button>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div style={{marginBottom:14}}>
              <div className="gob-eyebrow">Casos · jurisdicción universal</div>
              <h1 className="gob-h1">Casos</h1>
              <p className="gob-lead">Expedientes registrados en el sistema. Maltrato, observación antirrábica, disputas de custodia y brotes. <b>Vista universal — todas las jurisdicciones.</b></p>
            </div>
            <div className="gob-tabs">
              <button className="gob-tab is-active">Todos <span className="ct">{C.length}</span></button>
              <button className="gob-tab">Observación antirrábica <span className="ct">3</span></button>
              <button className="gob-tab">Maltrato <span className="ct">3</span></button>
              <button className="gob-tab">Disputas <span className="ct">1</span></button>
              <button className="gob-tab">Brotes <span className="ct">1</span></button>
            </div>
            <div className="gob-tabs">
              <span className="pre">Estado:</span>
              <button className="gob-tab" style={{borderRadius:4}}>Abiertos <span className="ct">5</span></button>
              <button className="gob-tab" data-tone="danger" style={{borderRadius:4}}>Escalados <span className="ct">1</span></button>
              <button className="gob-tab" style={{borderRadius:4}}>Cerrados <span className="ct">1</span></button>
            </div>
            <div className="gob-list">
              {C.map(c => {
                const st = GOB_STATUS[c[3]];
                return (
                  <div key={c[0]} className="gob-row is-link" style={{gridTemplateColumns:'170px 1fr 200px 150px 90px'}}>
                    <span className="gob-codebadge" data-tone={c[1]}><i className={'fa '+c[8]} /> {c[0]}</span>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><span style={{fontSize:13.5,fontWeight:600}}>{c[2]}</span><span className="gob-pill" data-tone={st.t}>{st.l}</span></div>
                    <div style={{fontSize:12,color:'var(--g-ink-2)'}}>{c[4]}, <span className="gob-muted">{c[5]}</span></div>
                    <div className="gob-mono gob-muted" style={{fontSize:11}}>abierto {c[6]}</div>
                    {c[7] ? <span className="gob-petchip"><i className="fa fa-paw" /> {c[7]}</span> : <span className="gob-muted" style={{fontSize:11,fontStyle:'italic'}}>—</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GOB · MALTRATO (cola de triage)
// ============================================================
window.GOB_WELFARE = [
  ['rep_8Kx9p','Maltrato físico','critical','open','Vecino reporta perro mestizo grande atado a la intemperie hace 4 días, con heridas visibles en cuello.','Barracas','CABA','hoy · 11:14',null,'2 h'],
  ['rep_2vQ7n','Negligencia','high','open','Múltiples animales sin agua ni comida en patio interno. Vecinos llamaron a la policía dos veces sin respuesta.','San Telmo','CABA','hoy · 09:42',null,'4 h'],
  ['rep_J3kYq','Abandono','high','triaged','Camada de cachorros encontrada en bolsa dentro de basurero. Tres cachorros con vida.','Caballito','CABA','ayer · 18:31','Lic. Ariel Bustos','20 h'],
  ['rep_FcLM4','Maltrato físico','critical','in_progress','Caso en seguimiento. Veterinaria de Belgrano confirmó múltiples fracturas no accidentales.','Belgrano','CABA','20 may · 14:11','Dra. Camila Ferrer','6 días'],
  ['rep_uRpQ2','Negligencia','medium','open','Perra preñada en avanzado estado de desnutrición en patio sin techo.','Vicente López','Buenos Aires','20 may · 09:28',null,'6 días'],
  ['rep_g7Yn1','Peleas de perros','critical','in_progress','Denuncia anónima sobre actividad organizada en galpón. Tres direcciones probables.','Quilmes','Buenos Aires','18 may · 22:55','Lic. Ariel Bustos','8 días'],
  ['rep_iEa9H','Abandono','low','open','Gato persa abandonado en pasillo de edificio. Buen estado general, sólo necesita un hogar.','Núñez','CABA','17 may · 11:02',null,'9 días'],
];
function GobMaltrato() {
  const W = window.GOB_WELFARE;
  const unassigned = W.filter(w => !w[8]).length;
  const mine = W.filter(w => w[8]==='Dra. Camila Ferrer').length;
  const inprog = W.filter(w => w[3]==='in_progress').length;
  return (
    <div className="gob" data-screen-label="Gob · Maltrato (triage)">
      <GobRail active="casos" />
      <div className="gob-main">
        <GobTopbar crumbs={['Casos','Maltrato']} scope="UNIVERSAL">
          <button className="gob-tbtn"><i className="fa fa-download" /> Exportar MPF</button>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div style={{marginBottom:14}}>
              <div className="gob-eyebrow">Casos · Ley Nacional 14.346</div>
              <h1 className="gob-h1">Denuncias de maltrato</h1>
              <p className="gob-lead">Cola de triage bajo Ley Nacional 14.346. <b>Vista universal — todas las jurisdicciones.</b></p>
            </div>
            <div className="gob-kpis" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
              <div className="gob-kpi-sm" data-tone="warn"><div className="l">Sin asignar</div><div className="v">{unassigned}</div><div className="h">esperando un govt</div></div>
              <div className="gob-kpi-sm" data-tone="blue"><div className="l">Mías</div><div className="v">{mine}</div><div className="h">en tu nombre</div></div>
              <div className="gob-kpi-sm"><div className="l">En investigación</div><div className="v">{inprog}</div><div className="h">con asignación activa</div></div>
              <div className="gob-kpi-sm" data-tone="ok"><div className="l">Cerradas (30d)</div><div className="v">9</div><div className="h">resueltas en el período</div></div>
            </div>
            <div className="gob-tabs">
              <button className="gob-tab" data-tone="danger">Urgentes <span className="ct">3</span></button>
              <button className="gob-tab">Mías <span className="ct">{mine}</span></button>
              <button className="gob-tab is-active">Todas <span className="ct">{W.length}</span></button>
              <button className="gob-tab" data-tone="warn">Atrasadas <span className="ct">3</span></button>
            </div>
            <div className="gob-list">
              <div className="gob-list-head" style={{display:'flex',justifyContent:'space-between'}}><span>Denuncias ({W.length})</span><span className="gob-mono" style={{fontWeight:600,letterSpacing:0,textTransform:'none'}}>ordenadas por gravedad · recientes primero</span></div>
              {W.map(w => {
                const sev = GOB_SEV[w[2]]; const st = GOB_STATUS[w[3]];
                return (
                  <div key={w[0]} className="gob-row is-link" style={{gridTemplateColumns:'12px 1fr 170px 18px',alignItems:'flex-start'}}>
                    <span className="gob-sevdot" style={{background:sev[1],marginTop:5}} />
                    <div style={{minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:3}}>
                        <span style={{fontSize:13.5,fontWeight:600}}>{w[1]}</span>
                        <span className="gob-pill" style={{background:sev[1]+'18',color:sev[1],borderColor:sev[1]+'40'}}>{sev[0]}</span>
                        <span className="gob-pill" data-tone={st.t}>{st.l}</span>
                      </div>
                      <div style={{fontSize:12.5,color:'var(--g-ink-2)',lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{w[4]}</div>
                      <div className="gob-mono" style={{fontSize:11,color:'var(--g-mute)',marginTop:4,display:'flex',gap:12,flexWrap:'wrap'}}><span><i className="fa fa-map-marker" /> {w[5]}, {w[6]}</span><span>·</span><span>{w[7]}</span><span>·</span><span style={{color:'var(--g-ink-2)'}}>{w[0]}</span></div>
                    </div>
                    {w[8] ? <div style={{textAlign:'right'}}><div style={{fontSize:12,fontWeight:600}}>{w[8]}</div><div className="gob-mono gob-muted" style={{fontSize:10}}>{w[9]}</div></div> : <div style={{textAlign:'right'}}><span className="gob-pill" data-tone="open">Sin asignar</span><div className="gob-mono gob-muted" style={{fontSize:10,marginTop:4}}>{w[9]}</div></div>}
                    <i className="fa fa-angle-right gob-muted" style={{marginTop:5}} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GOB · EXPEDIENTE DE MALTRATO (detalle · 11 secciones)
// ============================================================
function GobMaltratoDetalle() {
  const Sec = ({ label, accent, children }) => (
    <>
      <div className="gob-sectionlabel">{accent && <span className="dot" style={{background:accent}} />}{label}</div>
      <div className="gob-panel">{children}</div>
    </>
  );
  return (
    <div className="gob" data-screen-label="Gob · Expediente de maltrato">
      <GobRail active="casos" />
      <div className="gob-main">
        <GobTopbar crumbs={['Casos','Maltrato','rep_8Kx9p']} scope="BARRACAS" prov="CABA">
          <a href="#" className="gob-tbtn"><i className="fa fa-angle-left" /> Volver al listado</a>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--narrow">
            <div style={{marginBottom:16}}>
              <div className="gob-eyebrow is-danger"><span className="dot" /> Crítica · sin asignar</div>
              <div style={{display:'flex',alignItems:'baseline',gap:12,flexWrap:'wrap'}}>
                <h1 className="gob-h1 gob-h1--sm">Maltrato físico</h1>
                <span className="gob-pill" data-tone="open">Abierto</span>
                <span className="gob-pill" data-tone="danger">Crítica</span>
              </div>
              <div className="gob-mono" style={{marginTop:8,fontSize:12,color:'var(--g-mute)',display:'flex',gap:14,flexWrap:'wrap'}}><span style={{color:'var(--g-ink-2)'}}>rep_8Kx9p</span><span>·</span><span>creada hoy · 11:14</span></div>
            </div>

            <div className="gob-chipcards">
              <div className="gob-chipcard"><div className="l">Edad del caso</div><div className="v">2 h</div></div>
              <div className="gob-chipcard" data-tone="danger"><div className="l">Gravedad</div><div className="v">Crítica</div></div>
              <div className="gob-chipcard" data-tone="warn"><div className="l">Estado</div><div className="v">Abierto</div></div>
              <div className="gob-chipcard"><div className="l">Asignado a</div><div className="v muted">Sin asignar</div></div>
            </div>

            <Sec label="Asignación">
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:12,color:'var(--g-ink-2)'}}>Nadie tomó este caso todavía. Tomalo o reasignalo a un govt en jurisdicción.</span>
                <div style={{flex:1}} />
                <button className="gob-dbtn" style={{background:'var(--g-ink)',color:'#fff',borderColor:'var(--g-ink)',padding:'7px 13px',fontSize:12}}><i className="fa fa-user-plus" /> Asignarme</button>
                <button className="gob-dbtn gob-dbtn--reject" style={{color:'var(--g-ink-2)',borderColor:'var(--g-line)',padding:'7px 13px',fontSize:12}}><i className="fa fa-share" /> Reasignar</button>
              </div>
            </Sec>

            <Sec label="¿Qué pasó?">
              <p style={{margin:0,fontSize:13,color:'var(--g-ink)',lineHeight:1.6}}>Vecino reporta perro mestizo grande atado a la intemperie hace 4 días, con heridas visibles en cuello.</p>
              <div className="gob-mono" style={{marginTop:10,fontSize:11,color:'var(--g-mute)'}}>ocurrió aproximadamente hoy · 11:14</div>
            </Sec>

            <Sec label="Sujeto">
              <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Animal sin identificar</div>
              <div style={{fontSize:12,color:'var(--g-ink-2)',lineHeight:1.55}}>Perro mestizo grande · color marrón con manchas blancas · sin chip aparente · heridas visibles en cuello (probable collar metálico).</div>
            </Sec>

            <Sec label="Lugar">
              <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>Av. Patricios al 1840</div>
              <div style={{fontSize:12,color:'var(--g-mute)'}}>Barracas, Ciudad Autónoma de Buenos Aires</div>
              <div className="gob-map" style={{height:180,marginTop:10}}>
                <span className="gob-map-tag">Barracas · CABA</span>
                <span className="gob-pin" data-layer="maltrato" style={{left:'50%',top:'52%'}}><span className="marker"><i className="fa fa-exclamation" /></span></span>
                <span className="gob-mono" style={{position:'absolute',bottom:7,right:7,fontSize:9,background:'rgba(255,255,255,.9)',padding:'2px 6px',borderRadius:3,color:'var(--g-ink-2)'}}>-34.6437, -58.3835</span>
              </div>
            </Sec>

            <Sec label="Evidencia">
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {[['perro_barracas_1.jpg','1.4 MB'],['perro_barracas_2.jpg','2.1 MB'],['declaracion_vecino.pdf','108 KB']].map(([n,s]) => (
                  <div key={n} className="gob-file"><i className={'fa '+(n.endsWith('.pdf')?'fa-file-pdf-o':'fa-file-image-o')} /><span className="nm">{n}</span><span className="sz">{s}</span><a href="#">Abrir →</a></div>
                ))}
              </div>
            </Sec>

            <Sec label="Reportante">
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:'#36454F',color:'#fff',display:'grid',placeItems:'center',fontWeight:700,fontSize:13}}>JR</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600}}>Juan Ramírez</div><div className="gob-mono" style={{fontSize:11,color:'var(--g-mute)'}}>juan.r***@example.com · +54 9 11 4***-7723</div></div>
                <span className="gob-pill" data-tone="ok">Identificado</span>
              </div>
            </Sec>

            <Sec label="Acciones de triage">
              <div className="gob-infobox"><i className="fa fa-info-circle" /> Cada decisión queda firmada con tu cuenta y registrada en el audit log. Agregá notas cuando sirvan al expediente.</div>
              <div className="gob-triage">
                <button className="gob-tribtn" data-t="blue"><i className="fa fa-check" /> Marcar triada</button>
                <button className="gob-tribtn" data-t="violet"><i className="fa fa-search" /> Iniciar investigación</button>
                <button className="gob-tribtn" data-t="danger"><i className="fa fa-arrow-up" /> Escalar a provincial</button>
                <button className="gob-tribtn" data-t="amber"><i className="fa fa-building-o" /> Derivar a org</button>
                <button className="gob-tribtn" data-t="green"><i className="fa fa-archive" /> Cerrar caso</button>
                <button className="gob-tribtn" data-t="muted">Inválida</button>
                <button className="gob-tribtn" data-t="muted">Duplicada</button>
              </div>
            </Sec>

            <Sec label="Export fiscal">
              <div className="gob-mpf">
                <div className="ic"><i className="fa fa-gavel" /></div>
                <div className="bd"><b>Export para Ministerio Público Fiscal</b><span>Genera un dossier PDF con el caso completo, evidencia y normativa aplicable.</span></div>
                <button className="gob-dbtn" style={{background:'var(--g-danger)',color:'#fff',borderColor:'var(--g-danger)',padding:'8px 13px',fontSize:12}}><i className="fa fa-download" /> Generar export MPF</button>
              </div>
            </Sec>

            <Sec label="Línea de tiempo">
              <div className="gob-tl">
                {[['hoy · 11:14','Sistema','Denuncia recibida por canal público',false],['hoy · 11:14','Sistema','Asignación de prioridad: crítica (heurística)',false],['hoy · 11:16','Sistema','Notificación a govts en jurisdicción CABA',false],['hoy · 13:02','Vos','Apertura del expediente (vista de detalle)',true]].map((t,i) => (
                  <div key={i} className={'gob-tl-item'+(t[3]?' is-now':'')}><span className="bullet" /><div className="gob-tl-body"><div className="gob-tl-when">{t[0]}</div><div className="gob-tl-what"><b>{t[1]}</b> · {t[2]}</div></div></div>
                ))}
              </div>
            </Sec>

            <Sec label="Normativa aplicable">
              <ul className="gob-normativa">
                {[['Ley 14.346','Malos tratos y actos de crueldad a los animales'],['Ley 27.330','Prohibición de carreras de perros'],['Código Civil · Art. 240','Límites al ejercicio de derechos sobre bienes'],['Resolución SENASA 862/2009','Bienestar animal en establecimientos']].map(([c,d]) => (
                  <li key={c}><span className="code">{c}</span><span className="gob-muted">·</span><span>{d}</span></li>
                ))}
              </ul>
            </Sec>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { GobCasos, GobMaltrato, GobMaltratoDetalle });
