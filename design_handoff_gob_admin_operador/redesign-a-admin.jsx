// ============================================================
// DIRECCIÓN A — TIER OPERADOR · ADMIN (Plataforma)
// Panel · Equipo · Moderación · Jurisdicciones · Sistema/Outbox
// ============================================================

// ============================================================
// ADMIN · PANEL
// ============================================================
function AdminPanel() {
  return (
    <div className="gob" data-screen-label="Admin · Panel de administración">
      <GobRail active="panel" admin />
      <div className="gob-main">
        <GobTopbar crumbs={['Panel de administración']} admin>
          <button className="gob-tbtn"><i className="fa fa-search" /> Buscar usuario / org</button>
          <button className="gob-tbtn"><i className="fa fa-bell-o" /></button>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div className="gob-breach">
              <i className="fa fa-exclamation-circle lead" />
              <div className="bd"><b>Outbox breach · 2 eventos pendientes de despacho hace más de 5 min</b><span><code>audit_event.transferOwnership</code> y <code>audit_event.approveOrg</code> · revisar en Sistema → Outbox.</span></div>
              <button className="gob-tbtn gob-tbtn--danger">Ver outbox</button>
            </div>

            <div style={{marginBottom:18}}>
              <div className="gob-eyebrow">miMAR Plataforma · ADMIN · Universal</div>
              <h1 className="gob-h1">Panel de administración</h1>
              <p className="gob-lead">Gestión de cuentas institucionales: govts y admins del sistema. Las aprobaciones de cola, búsqueda de usuarios y verificación de orgs viven en el portal de Gobierno.</p>
            </div>

            <div className="gob-kpis">
              <a href="#" className="gob-kpi" data-tone="danger"><div className="l">Outbox breach</div><div className="v">2</div><div className="sub" style={{marginTop:'auto'}}>eventos pendientes · &gt;5 min</div></a>
              <a href="#" className="gob-kpi" data-tone="warn"><div className="l">Cola pendiente</div><div className="v">23</div><div className="sub" style={{marginTop:'auto'}}>solicitudes esperando un govt</div></a>
              <div className="gob-kpi"><div className="l">Govts activos</div><div className="v">34</div><div className="sub" style={{marginTop:'auto'}}>en 11 provincias · 0 inactivos</div></div>
              <div className="gob-kpi" data-tone="ok"><div className="l">Decisiones · 24h</div><div className="v">148</div><div className="delta"><i className="fa fa-arrow-up" /> aprobadas 132 · rechazadas 16</div></div>
            </div>

            <div className="gob-twocards">
              <div className="gob-acctcard"><div className="l">Govts</div><div className="row"><span className="n">34</span><span className="sub">activos · 2 desactivados</span></div><p>Listado de govts activos. Creá cuentas, asigná localidades y revocá accesos.</p><a href="#">Ir a Govts →</a></div>
              <div className="gob-acctcard"><div className="l">Admins</div><div className="row"><span className="n">4</span><span className="sub">activos · vos incluida</span></div><p>Listado de admins activos. Creá cuentas y administrá el acceso universal.</p><a href="#">Ir a Admins →</a></div>
            </div>

            <div className="gob-callout">
              <div className="ic"><i className="fa fa-building-o" /></div>
              <div className="bd"><b>Cola de solicitudes y búsqueda de usuarios</b><span>Las aprobaciones, rechazos, propuestas de rol y revocaciones viven en el panel de Gobierno.</span></div>
              <a href="#" className="gob-tbtn gob-tbtn--outline">Ir a Gobierno →</a>
            </div>

            <div className="gob-quicktools">
              {[['fa-flag-o','Moderación','6 items en cola'],['fa-map-o','Jurisdicciones','Reglas por provincia y localidad'],['fa-history','Audit log','Últimos 30 días · CSV'],['fa-flask','Feature flags','14 activos · 3 en prueba']].map(t => (
                <a key={t[1]} href="#" className="gob-qtool"><div className="ic"><i className={'fa '+t[0]} /></div><div className="bd"><b>{t[1]}</b><span>{t[2]}</span></div><i className="fa fa-angle-right" /></a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ADMIN · EQUIPO
// ============================================================
function AdminEquipo() {
  const govts = [
    ['AB','Lic. Ariel Bustos','ariel.bustos','CABA · Comuna 1-6','Govt','activo'],
    ['LP','Dra. Liliana Pérez','liliana.perez','Buenos Aires · La Plata','Govt','activo'],
    ['RM','Lic. Rodrigo Méndez','rodrigo.mendez','Santa Fe · Rosario','Govt','activo'],
    ['SC','Dra. Sofía Castro','sofia.castro','Córdoba · Capital','Govt','inactivo'],
  ];
  const admins = [
    ['CF','Dra. Camila Ferrer','camila.ferrer','Universal','Admin','vos'],
    ['JM','Ing. Javier Molina','javier.molina','Universal','Admin','activo'],
  ];
  return (
    <div className="gob" data-screen-label="Admin · Equipo">
      <GobRail active="equipo" admin />
      <div className="gob-main">
        <GobTopbar crumbs={['Plataforma','Equipo']} admin>
          <button className="gob-tbtn gob-tbtn--primary"><i className="fa fa-user-plus" /> Nueva cuenta</button>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div style={{marginBottom:16}}>
              <div className="gob-eyebrow">Plataforma · cuentas institucionales</div>
              <h1 className="gob-h1">Equipo</h1>
              <p className="gob-lead">Govts y admins del sistema. Asigná jurisdicciones, gestioná permisos y revocá accesos. <b>Cada alta o baja queda firmada.</b></p>
            </div>

            <div className="gob-card" style={{marginBottom:14}}>
              <div className="gob-card-head"><h3>Govts</h3><span className="gob-pill" data-tone="neutral" style={{marginLeft:8}}>34 activos</span><div className="sp" /><a href="#">Ver todos →</a></div>
              <div className="gob-row gob-list-head gob-member" style={{borderBottom:'1px solid var(--g-line-2)'}}><div></div><div>Nombre</div><div>Jurisdicción</div><div>Estado</div></div>
              {govts.map(g => (
                <div key={g[2]} className="gob-member">
                  <div className="av">{g[0]}</div>
                  <div className="nm"><b>{g[1]}</b><span>@{g[2]}</span></div>
                  <div className="juris">{g[3]}</div>
                  <span className="gob-pill" data-tone={g[5]==='activo'?'ok':'neutral'}>{g[5]}</span>
                </div>
              ))}
            </div>

            <div className="gob-card">
              <div className="gob-card-head"><h3>Admins</h3><span className="gob-pill" data-tone="danger" style={{marginLeft:8}}>acceso universal</span><div className="sp" /><a href="#">Ver todos →</a></div>
              {admins.map(a => (
                <div key={a[2]} className="gob-member">
                  <div className="av">{a[0]}</div>
                  <div className="nm"><b>{a[1]}</b><span>@{a[2]}</span></div>
                  <div className="juris">{a[3]}</div>
                  <span className="gob-pill" data-tone={a[5]==='vos'?'blue':'ok'}>{a[5]}</span>
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
// ADMIN · MODERACIÓN
// ============================================================
function AdminModeracion() {
  const items = [
    ['danger','Foto de perfil reportada','adopción · Refugio Belgrano R','contenido explícito','hace 2 h','rep_m01'],
    ['warn','Descripción de mascota','adopción · Patitas Felices','posible dato de contacto','hace 5 h','rep_m02'],
    ['warn','Comentario en credencial','perdida · Tomás','lenguaje ofensivo','ayer','rep_m03'],
    ['neutral','Nombre de organización','org · “Rescate XYZ”','spam / nombre engañoso','ayer','rep_m04'],
  ];
  return (
    <div className="gob" data-screen-label="Admin · Moderación">
      <GobRail active="moderacion" admin />
      <div className="gob-main">
        <GobTopbar crumbs={['Plataforma','Moderación']} admin>
          <button className="gob-tbtn"><i className="fa fa-filter" /> Filtros</button>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div style={{marginBottom:14}}>
              <div className="gob-eyebrow">Plataforma · contenido reportado</div>
              <h1 className="gob-h1">Moderación</h1>
              <p className="gob-lead">Cola de contenido reportado por la comunidad. Resolvé manteniendo o removiendo; cada decisión notifica al autor y queda firmada.</p>
            </div>
            <div className="gob-kpis" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
              <div className="gob-kpi-sm" data-tone="danger"><div className="l">Urgentes</div><div className="v">1</div><div className="h">contenido explícito</div></div>
              <div className="gob-kpi-sm" data-tone="warn"><div className="l">Pendientes</div><div className="v">6</div><div className="h">sin resolver</div></div>
              <div className="gob-kpi-sm"><div className="l">Resueltas hoy</div><div className="v">12</div><div className="h">8 mantenidas · 4 removidas</div></div>
              <div className="gob-kpi-sm" data-tone="ok"><div className="l">Tiempo medio</div><div className="v">3 h</div><div className="h">de respuesta</div></div>
            </div>
            <div className="gob-list">
              {items.map(m => (
                <div key={m[5]} className="gob-modrow">
                  <div style={{minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                      <span className="gob-sevdot" style={{background:m[0]==='danger'?'var(--g-danger)':m[0]==='warn'?'var(--g-warn)':'var(--g-mute)'}} />
                      <span className="desc" style={{fontWeight:600}}>{m[1]}</span>
                      <span className="gob-pill" data-tone={m[0]==='danger'?'danger':m[0]==='warn'?'warn':'neutral'}>{m[3]}</span>
                    </div>
                    <div className="meta"><span>{m[2]}</span><span>·</span><span>reportado {m[4]}</span><span>·</span><span style={{color:'var(--g-ink-2)'}}>{m[5]}</span></div>
                  </div>
                  <div className="gob-modactions">
                    <button className="gob-modbtn gob-modbtn--keep"><i className="fa fa-check" /> Mantener</button>
                    <button className="gob-modbtn gob-modbtn--remove"><i className="fa fa-trash" /> Remover</button>
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
// ADMIN · JURISDICCIONES (mapa de reglas)
// ============================================================
function AdminJurisdicciones() {
  const provs = [
    [24,52,'CABA','3'],[30,58,'Buenos Aires','11'],[34,40,'Santa Fe','4'],[28,38,'Córdoba','3'],
    [20,46,'Mendoza','2'],[40,22,'Salta','1'],[44,30,'Tucumán','2'],[30,78,'Río Negro','1'],
  ];
  return (
    <div className="gob" data-screen-label="Admin · Jurisdicciones">
      <GobRail active="jurisdicciones" admin />
      <div className="gob-main">
        <GobTopbar crumbs={['Sistema','Jurisdicciones']} admin>
          <button className="gob-tbtn gob-tbtn--primary"><i className="fa fa-plus" /> Asignar govt</button>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap">
            <div style={{marginBottom:16}}>
              <div className="gob-eyebrow">Sistema · cobertura territorial</div>
              <h1 className="gob-h1">Jurisdicciones</h1>
              <p className="gob-lead">Mapa de cobertura: qué provincias y localidades tienen govt asignado y cuántos. Las zonas sin cobertura escalan a nivel nacional.</p>
            </div>
            <div className="gob-mapwrap">
              <div className="gob-map" style={{height:480}}>
                <span className="gob-map-tag">República Argentina · cobertura de govts</span>
                <span className="gob-map-scope"><i className="fa fa-shield" /> SUPERADMIN</span>
                {provs.map(p => (
                  <span key={p[2]} className="gob-pin is-cluster" data-layer="perdidas" style={{left:p[0]+'%',top:p[1]+'%'}}><span className="marker"><b>{p[3]}</b></span></span>
                ))}
              </div>
              <div className="gob-layers">
                <div className="gob-layers-head">Cobertura</div>
                <div className="gob-map-stat"><div className="n">34</div><div className="t">govts en 11 provincias</div></div>
                <div className="gob-map-stat"><div className="n" data-tone="warn">13</div><div className="t">provincias sin cobertura · escalan a nacional</div></div>
                <div className="gob-map-stat" style={{borderBottom:0}}><div className="n" data-tone="danger">2</div><div className="t">localidades con govt desactivado</div></div>
                <div className="gob-layers-foot">Click en una provincia para ver sus localidades y asignar o revocar govts.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ADMIN · SISTEMA / OUTBOX (salud técnica)
// ============================================================
function AdminSistema() {
  const events = [
    ['danger','audit_event.transferOwnership','evt_9Kx2p','pendiente','7 min','3 reintentos'],
    ['danger','audit_event.approveOrg','evt_2vL8m','pendiente','6 min','2 reintentos'],
    ['ok','notify.lostPetSighting','evt_J3kYq','despachado','—','1 intento'],
    ['ok','audit_event.vaccineAdded','evt_FcLM4','despachado','—','1 intento'],
    ['ok','notify.adoptionApplication','evt_uRpQ2','despachado','—','1 intento'],
  ];
  return (
    <div className="gob" data-screen-label="Admin · Sistema / Outbox">
      <GobRail active="sistema" admin />
      <div className="gob-main">
        <GobTopbar crumbs={['Sistema','Outbox']} admin>
          <button className="gob-tbtn"><i className="fa fa-refresh" /> Reintentar todos</button>
          <button className="gob-tbtn"><i className="fa fa-download" /> Logs</button>
        </GobTopbar>
        <div className="gob-scroll">
          <div className="gob-wrap gob-wrap--mid">
            <div className="gob-breach">
              <i className="fa fa-exclamation-circle lead" />
              <div className="bd"><b>2 eventos sin despachar hace más de 5 minutos</b><span>El despachador de eventos puede estar degradado. Revisá la cola y reintentá.</span></div>
              <button className="gob-tbtn gob-tbtn--danger"><i className="fa fa-refresh" /> Reintentar</button>
            </div>
            <div style={{marginBottom:14}}>
              <div className="gob-eyebrow is-danger"><span className="dot" /> Sistema · salud del despachador</div>
              <h1 className="gob-h1">Outbox de eventos</h1>
              <p className="gob-lead">Cola transaccional de eventos de dominio (audit + notificaciones). Si un evento no se despacha, queda acá para reintento. <b>Cero pérdida garantizada.</b></p>
            </div>
            <div className="gob-kpis" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
              <div className="gob-kpi-sm" data-tone="danger"><div className="l">Sin despachar</div><div className="v">2</div><div className="h">&gt; umbral de 5 min</div></div>
              <div className="gob-kpi-sm"><div className="l">Despachados (24h)</div><div className="v">14.882</div><div className="h">99,98% en &lt;1s</div></div>
              <div className="gob-kpi-sm" data-tone="ok"><div className="l">Tasa de éxito</div><div className="v">99,98%</div><div className="h">últimos 7 días</div></div>
              <div className="gob-kpi-sm" data-tone="warn"><div className="l">Reintentos activos</div><div className="v">5</div><div className="h">con backoff exponencial</div></div>
            </div>
            <div className="gob-list">
              <div className="gob-row gob-list-head" style={{gridTemplateColumns:'90px 1fr 120px 110px 110px'}}><div>Estado</div><div>Evento</div><div>ID</div><div>Antigüedad</div><div>Intentos</div></div>
              {events.map(e => (
                <div key={e[2]} className="gob-row" style={{gridTemplateColumns:'90px 1fr 120px 110px 110px'}}>
                  <span className="gob-pill" data-tone={e[0]==='danger'?'danger':'ok'}>{e[3]}</span>
                  <span className="gob-mono" style={{fontSize:12,color:e[0]==='danger'?'var(--g-danger)':'var(--g-ink)'}}>{e[1]}</span>
                  <span className="gob-mono gob-muted" style={{fontSize:11}}>{e[2]}</span>
                  <span className="gob-mono" style={{fontSize:11,color:e[0]==='danger'?'var(--g-danger)':'var(--g-mute)'}}>{e[4]}</span>
                  <span className="gob-mono gob-muted" style={{fontSize:11}}>{e[5]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AdminPanel, AdminEquipo, AdminModeracion, AdminJurisdicciones, AdminSistema });
