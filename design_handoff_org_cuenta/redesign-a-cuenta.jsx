// ============================================================
// DIRECCIÓN A — Owner · "Mi cuenta" (clúster de cuenta)
// Estética cálida. Reusa AMast/.dirA* + clases .acct*.
// Ajustes · Tránsitos · Solicitudes recibidas · Membresías
// ============================================================

function AcctShell({ active, crumb, children }) {
  const nav = [
    ['ajustes','fa-user-o','Ajustes',null],
    ['transitos','fa-home','Tránsitos',2],
    ['solicitudes','fa-envelope-o','Solicitudes',2],
    ['membresias','fa-id-badge','Membresías',null],
    ['postulaciones','fa-paw','Mis postulaciones',3],
    ['notificaciones','fa-bell-o','Notificaciones',null],
  ];
  return (
    <div className="dirA" data-screen-label={'Cuenta · '+crumb}>
      <div className="dirA-guilloche" />
      <AMast active="cuenta" />
      <div className="dirA-subbar"><span className="dirA-crumbs">Mi cuenta › <b>{crumb}</b></span><span className="dirA-doccode">TITULAR · Martín Quiroga · DNI 30.114.882</span></div>
      <div className="dirA-body">
        <div className="dirA-doc" style={{maxWidth:1040}}>
          <div className="acct-layout">
            <aside className="acct-side">
              <div className="acct-side-title">Mi cuenta</div>
              {nav.map(([id,ic,l,ct]) => (
                <a key={id} href="#" className={'acct-navitem'+(id===active?' is-active':'')}><i className={'fa '+ic} /><span>{l}</span>{ct && <span className="ct">{ct}</span>}</a>
              ))}
            </aside>
            <div>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CUENTA · AJUSTES
// ============================================================
function AcctAjustes() {
  return (
    <AcctShell active="ajustes" crumb="Ajustes">
      <div className="acct-prof">
        <div className="av">MQ</div>
        <div className="info">
          <div className="nm">Martín Quiroga</div>
          <div className="mt">Titular desde marzo 2022 · San Isidro, Buenos Aires</div>
          <div className="badges"><span className="dirA-tag"><i className="fa fa-paw" /> 4 mascotas</span><span className="dirA-tag dirA-tag--gris"><i className="fa fa-check" /> Identidad verificada</span></div>
        </div>
        <button className="acct-btn"><i className="fa fa-camera" /> Cambiar foto</button>
      </div>

      <div className="acct-card">
        <div className="acct-card-head"><h3>Datos personales</h3><div className="sp" /><a href="#">Editar</a></div>
        <div className="acct-setrow"><div className="k">Nombre</div><div className="v">Martín Quiroga</div><a className="edit">Editar</a></div>
        <div className="acct-setrow"><div className="k">Documento</div><div className="v" style={{fontFamily:'var(--a-mono)'}}>30.114.882</div><span className="dirA-tag dirA-tag--gris" style={{fontSize:10}}>verificado</span></div>
        <div className="acct-setrow"><div className="k">Email</div><div className="v">martin.quiroga@gmail.com <small>Usado para ingresar y recibir avisos</small></div><a className="edit">Editar</a></div>
        <div className="acct-setrow"><div className="k">Teléfono</div><div className="v">+54 9 11 5544 7723</div><a className="edit">Editar</a></div>
        <div className="acct-setrow"><div className="k">Domicilio</div><div className="v">Av. del Libertador 1450, San Isidro</div><a className="edit">Editar</a></div>
      </div>

      <div className="acct-card">
        <div className="acct-card-head"><h3>Notificaciones</h3></div>
        <div className="acct-pref"><div className="bd"><b>Vencimientos sanitarios</b><span>Vacunas, antiparasitarios y medicación por vencer.</span></div><span className="acct-tgl is-on" /></div>
        <div className="acct-pref"><div className="bd"><b>Avistamientos de mascota perdida</b><span>Cuando alguien reporta o escanea la credencial.</span></div><span className="acct-tgl is-on" /></div>
        <div className="acct-pref"><div className="bd"><b>Novedades de adopción</b><span>Respuestas de refugios a tus postulaciones.</span></div><span className="acct-tgl is-on" /></div>
        <div className="acct-pref"><div className="bd"><b>Boletín de miMAR</b><span>Campañas, jornadas de castración y novedades.</span></div><span className="acct-tgl" /></div>
      </div>

      <div className="acct-card">
        <div className="acct-card-head"><h3>Seguridad</h3></div>
        <div className="acct-setrow"><div className="k">Contraseña</div><div className="v">Actualizada hace 3 meses</div><a className="edit">Cambiar</a></div>
        <div className="acct-setrow"><div className="k">Verificación en 2 pasos</div><div className="v">Activada por SMS</div><a className="edit">Gestionar</a></div>
      </div>
      <button className="acct-btn acct-btn--danger"><i className="fa fa-sign-out" /> Cerrar sesión en todos los dispositivos</button>
    </AcctShell>
  );
}

// ============================================================
// CUENTA · TRÁNSITOS
// ============================================================
function AcctTransitos() {
  return (
    <AcctShell active="transitos" crumb="Tránsitos">
      <div style={{marginBottom:18}}>
        <h1 style={{fontFamily:'var(--a-serif)',fontWeight:600,fontSize:26,letterSpacing:'-.01em',margin:'0 0 4px'}}>Hogar de tránsito</h1>
        <p style={{fontSize:14,color:'var(--a-mute)',margin:0,lineHeight:1.5}}>Cuidás mascotas temporalmente hasta que encuentren familia. Coordinás con el refugio responsable.</p>
      </div>

      <div className="acct-card">
        <div className="acct-card-head"><h3>En tránsito ahora</h3><span className="dirA-label" style={{marginLeft:'auto'}}>2 activos</span></div>
        <div className="acct-foster"><div className="ph">CHICO</div><div className="bd"><div className="nm">Chico</div><div className="sub">Cachorro mestizo · ~4 meses · Refugio Belgrano R</div></div><div className="since">desde 18/05<br/>22 días</div></div>
        <div className="acct-foster"><div className="ph">LUNA</div><div className="bd"><div className="nm">Luna</div><div className="sub">Gata siamesa · ~1 año · Patitas Felices</div></div><div className="since">desde 02/06<br/>7 días</div></div>
      </div>

      <div className="acct-card">
        <div className="acct-card-head"><h3>Tu disponibilidad</h3><div className="sp" /><a href="#">Editar</a></div>
        <div className="acct-setrow"><div className="k">Estado</div><div className="v"><span className="dirA-flag dirA-flag--ok">DISPONIBLE</span></div><a className="edit">Pausar</a></div>
        <div className="acct-setrow"><div className="k">Capacidad</div><div className="v">Hasta 2 mascotas chicas <small>Casa con patio · sin otras mascotas</small></div><a className="edit">Editar</a></div>
        <div className="acct-setrow"><div className="k">Preferencias</div><div className="v">Cachorros y gatos · no perros grandes</div><a className="edit">Editar</a></div>
      </div>

      <div className="acct-card">
        <div className="acct-card-head"><h3>Historial</h3></div>
        <div className="acct-foster"><div className="ph">TOBY</div><div className="bd"><div className="nm">Toby</div><div className="sub">Mestizo · adoptado el 28/05 · estuvo 41 días</div></div><span className="dirA-flag dirA-flag--ok">ADOPTADO</span></div>
        <div className="acct-foster"><div className="ph">MIA</div><div className="bd"><div className="nm">Mía</div><div className="sub">Gata · adoptada el 12/04 · estuvo 28 días</div></div><span className="dirA-flag dirA-flag--ok">ADOPTADO</span></div>
      </div>
    </AcctShell>
  );
}

// ============================================================
// CUENTA · SOLICITUDES RECIBIDAS
// ============================================================
function AcctSolicitudes() {
  const items = [
    ['RS','#5e7a3a','Refugio Sur Patagónico','Veterinaria de planta','Vimos tu perfil en miMAR. Estamos abriendo planta veterinaria en Bariloche y nos encantaría sumarte.','hace 3 días','11 días'],
    ['PN','#c46a2b','Patitas del Norte','Voluntaria de tránsito','¿Te animás a recibir un perrito por 2-3 semanas mientras le buscamos hogar?','hace 6 días','8 días'],
  ];
  return (
    <AcctShell active="solicitudes" crumb="Solicitudes">
      <div style={{marginBottom:18}}>
        <h1 style={{fontFamily:'var(--a-serif)',fontWeight:600,fontSize:26,letterSpacing:'-.01em',margin:'0 0 4px'}}>Solicitudes que recibiste</h1>
        <p style={{fontSize:14,color:'var(--a-mute)',margin:0,lineHeight:1.5}}>Invitaciones de organizaciones para sumarte como miembro.</p>
      </div>
      {items.map(s => (
        <div key={s[2]} className="acct-listcard">
          <div className="logo" style={{background:s[1]}}>{s[0]}</div>
          <div className="bd">
            <div className="nm">{s[2]}</div>
            <div className="sub">Te proponen sumarte como <b style={{color:'var(--a-azul)'}}>{s[3]}</b>.</div>
            <div className="quote"><i className="fa fa-quote-left" style={{fontSize:9,opacity:.5,marginRight:5}} />{s[4]}</div>
            <div className="meta"><span><i className="fa fa-clock-o" /> Recibida {s[5]}</span><span className="dirA-flag dirA-flag--sick" style={{fontSize:9}}><i className="fa fa-hourglass-half" /> Expira en {s[6]}</span></div>
          </div>
          <div className="side"><button className="acct-btn acct-btn--primary"><i className="fa fa-check" /> Aprobar</button><button className="acct-btn acct-btn--danger">Rechazar</button></div>
        </div>
      ))}
    </AcctShell>
  );
}

// ============================================================
// CUENTA · MEMBRESÍAS
// ============================================================
function AcctMembresias() {
  const mems = [
    ['R','var(--a-azul)','Refugio Belgrano R','Hogar de tránsito','CABA · verificada','activa','desde 03/2024'],
    ['PF','#c46a2b','Patitas Felices','Voluntario · eventos','Vicente López','activa','desde 11/2023'],
  ];
  return (
    <AcctShell active="membresias" crumb="Membresías">
      <div style={{marginBottom:18}}>
        <h1 style={{fontFamily:'var(--a-serif)',fontWeight:600,fontSize:26,letterSpacing:'-.01em',margin:'0 0 4px'}}>Mis membresías</h1>
        <p style={{fontSize:14,color:'var(--a-mute)',margin:0,lineHeight:1.5}}>Organizaciones de las que formás parte y el rol que tenés en cada una.</p>
      </div>
      {mems.map(m => (
        <div key={m[2]} className="acct-listcard">
          <div className="logo" style={{background:m[1]}}>{m[0]}</div>
          <div className="bd">
            <div className="nm">{m[2]} <span className="dirA-tag dirA-tag--gris" style={{fontSize:10,marginLeft:6}}><i className="fa fa-check-circle" /> {m[4]}</span></div>
            <div className="sub">Tu rol: <b style={{color:'var(--a-ink)'}}>{m[3]}</b></div>
            <div className="meta"><span><i className="fa fa-id-badge" /> Miembro {m[6]}</span><span className="dirA-flag dirA-flag--ok" style={{fontSize:9}}>{m[5]}</span></div>
          </div>
          <div className="side"><button className="acct-btn"><i className="fa fa-external-link" /> Ir al panel</button><button className="acct-btn acct-btn--danger">Salir</button></div>
        </div>
      ))}
      <div className="dirA-card" style={{borderStyle:'dashed',background:'var(--a-stripe)',marginTop:6}}>
        <div className="dirA-card-body" style={{display:'flex',gap:12,alignItems:'center'}}>
          <i className="fa fa-info-circle" style={{color:'var(--a-azul)',fontSize:18}} />
          <div style={{fontSize:12.5,color:'var(--a-ink-2)',lineHeight:1.5}}>¿Tenés un refugio o clínica? Registrá tu organización para publicar mascotas en adopción y gestionar tu equipo. <a href="#" style={{color:'var(--a-azul)',fontWeight:600,textDecoration:'none'}}>Crear organización →</a></div>
        </div>
      </div>
    </AcctShell>
  );
}

Object.assign(window, { AcctAjustes, AcctTransitos, AcctSolicitudes, AcctMembresias });
