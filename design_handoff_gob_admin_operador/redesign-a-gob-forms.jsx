// ============================================================
// DIRECCIÓN A — TIER OPERADOR · Acceso institucional + Formularios
// Login sobrio (gob/admin/org) · Acta de infracción · Declarar brote · Nueva cuenta
// ============================================================

function GobSheetHead({ route, icon, tone, title, sub }) {
  return (
    <>
      <div className="gob-sheet-route">{route}</div>
      <div className="gob-sheet-head" data-tone={tone}>
        <div className="gob-sheet-hicon" data-tone={tone}><i className={'fa '+icon} /></div>
        <div className="gob-sheet-htext"><h2>{title}</h2><div className="sub">{sub}</div></div>
        <button className="gob-sheet-close"><i className="fa fa-times" /></button>
      </div>
    </>
  );
}
function GobFSec({ n, title, opt, children }) {
  return (
    <div className="gob-fsec">
      <div className="gob-fsec-head"><span className="n">{n}</span><h3>{title}</h3>{opt && <span className="opt">{opt}</span>}</div>
      {children}
    </div>
  );
}
function GobField({ label, req, opt, hint, children }) {
  return (
    <div className="gob-field">
      <label className="gob-flabel">{label}{req && <span className="req">*</span>}{opt && <span className="opt">{opt}</span>}</label>
      {children}
      {hint && <div className="gob-fhint">{hint}</div>}
    </div>
  );
}

// ============================================================
// ACCESO INSTITUCIONAL (login sobrio)
// ============================================================
function GobLogin() {
  return (
    <div className="gob-login" data-screen-label="Acceso institucional (gob/admin/org)">
      <div className="gob-login-aside">
        <div className="gob-login-brand">
          <div className="gob-login-crest">m</div>
          <div><b>miMAR</b><span>Registro Nacional de Mascotas</span></div>
        </div>
        <div className="lead">
          <h1>Acceso institucional</h1>
          <p>Portal para organismos de gobierno, organizaciones verificadas y administración de la plataforma. El acceso es nominal y todas las acciones quedan auditadas.</p>
          <div className="gob-login-actors">
            <div className="gob-login-actor"><i className="fa fa-bank" /><div><b>Gobierno</b><span>Autoridades sanitarias y de fiscalización por jurisdicción</span></div></div>
            <div className="gob-login-actor"><i className="fa fa-building-o" /><div><b>Organización</b><span>Refugios, clínicas veterinarias y redes de rescate</span></div></div>
            <div className="gob-login-actor"><i className="fa fa-shield" /><div><b>Plataforma</b><span>Administración nacional del sistema</span></div></div>
          </div>
        </div>
        <div className="gob-login-foot">ACCESO RESTRINGIDO · LEY 25.326 (PROTECCIÓN DE DATOS)<br/>República Argentina · uso exclusivo de personal autorizado</div>
      </div>

      <div className="gob-login-main">
        <div className="gob-login-form">
          <div className="gob-login-eyebrow"><i className="fa fa-lock lock" /> Conexión segura</div>
          <h2>Ingresá a tu cuenta</h2>
          <p className="desc">Usá las credenciales institucionales que te asignaron. El sistema reconoce tu rol y jurisdicción automáticamente.</p>

          <div className="gob-login-field">
            <label>Correo institucional</label>
            <div className="gob-login-inputwrap"><i className="fa fa-envelope-o" /><input className="gob-login-input with-icon" defaultValue="camila.ferrer@mimar.gob.ar" /></div>
          </div>
          <div className="gob-login-field">
            <label>Contraseña</label>
            <div className="gob-login-inputwrap"><i className="fa fa-key" /><input className="gob-login-input with-icon" type="password" defaultValue="••••••••••••" /></div>
          </div>

          <div className="gob-login-row">
            <span className="gob-login-check"><span className="box on"><i className="fa fa-check" /></span> Mantener sesión</span>
            <a href="#">¿Olvidaste tu contraseña?</a>
          </div>

          <button className="gob-login-submit"><i className="fa fa-sign-in" /> Ingresar</button>

          <div className="gob-login-divider">O BIEN</div>
          <button className="gob-login-sso"><i className="fa fa-id-badge" /> Ingresar con identidad federada (AFIP / MiArgentina)</button>

          <div className="gob-login-help"><i className="fa fa-paw" style={{marginRight:6,color:'var(--g-mute)'}} /> ¿Sos dueño de una mascota? Este acceso es solo institucional. Ingresá desde <a href="#">mimar.gob.ar</a>.</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FORM · ACTA DE INFRACCIÓN (Gobierno)
// ============================================================
function GobActaInfraccion() {
  return (
    <div className="gob-sheetwrap">
      <div className="gob-sheet">
        <GobSheetHead route="?accion=acta-infraccion" icon="fa-gavel" tone="danger" title="Acta de infracción" sub="Documento sancionatorio · Ley Nacional 14.346" />
        <div className="gob-sheet-body">
          <div className="gob-fcallout" data-tone="danger">
            <div className="t"><i className="fa fa-balance-scale" /> Acto administrativo con efectos legales</div>
            <div className="x">Queda firmada con tu cuenta y matrícula. El infractor la recibe formalmente y tiene 10 días hábiles para descargo.</div>
          </div>

          <GobFSec n="01" title="Infractor">
            <div className="gob-fopt is-sel"><span className="radio" /><div className="bd"><b>Organización</b><span>Refugio, clínica o red registrada en miMAR.</span></div></div>
            <div className="gob-fopt"><span className="radio" /><div className="bd"><b>Persona física</b><span>Titular identificado por DNI.</span></div></div>
            <GobField label="Organización imputada" req>
              <input className="gob-input" defaultValue="Mascotas Rescate Sur · org-mrs-avellaneda" />
            </GobField>
            <div className="gob-frow">
              <GobField label="CUIT" req><input className="gob-input mono" defaultValue="30-71012345-4" /></GobField>
              <GobField label="Jurisdicción"><input className="gob-input" defaultValue="Avellaneda, Buenos Aires" /></GobField>
            </div>
          </GobFSec>

          <GobFSec n="02" title="Hecho imputado">
            <GobField label="Tipo de infracción" req>
              <select className="gob-select" defaultValue="cond"><option value="cond">Condiciones de alojamiento inadecuadas</option><option>Falta de atención veterinaria</option><option>Hacinamiento</option><option>Incumplimiento sanitario</option><option>Maltrato / crueldad</option></select>
            </GobField>
            <GobField label="Normativa violada" req>
              <div className="gob-fchips">
                {['Ley 14.346','Ley 27.330','Res. SENASA 862/2009','Ord. local 12.345'].map((l,i) => <span key={l} className={'gob-fchip'+(i===0?' is-on':'')}>{i===0 && <i className="fa fa-check" style={{marginRight:5}} />}{l}</span>)}
              </div>
            </GobField>
            <GobField label="Descripción del hecho" req hint="Detallá lo constatado en la inspección. Es la base fáctica del acta.">
              <textarea className="gob-textarea" rows="3" defaultValue="Se constató alojamiento de 14 caninos en recinto de 20 m² sin ventilación adecuada, sin acceso a agua limpia y con tres animales con signos de desnutrición. Acta labrada en inspección del 24/05/2026." />
            </GobField>
          </GobFSec>

          <GobFSec n="03" title="Antecedentes" opt="opcional">
            <GobField label="Caso vinculado">
              <div className="gob-suffix"><input defaultValue="CAS-MALT-117" /><div className="sfx"><i className="fa fa-link" /></div></div>
            </GobField>
          </GobFSec>

          <GobFSec n="04" title="Sanción">
            <div className="gob-fopt"><span className="radio" /><div className="bd"><b>Apercibimiento</b><span>Advertencia formal sin multa.</span></div></div>
            <div className="gob-fopt is-sel" data-tone="danger"><span className="radio" /><div className="bd"><b>Multa</b><span>Sanción económica según escala de la ley.</span></div><span className="amt">UMA</span></div>
            <div className="gob-fopt"><span className="radio" /><div className="bd"><b>Clausura preventiva</b><span>Cierre del establecimiento.</span></div></div>
            <div className="gob-fopt"><span className="radio" /><div className="bd"><b>Suspensión de la verificación</b><span>Pierde el estado de organización verificada.</span></div></div>
            <div className="gob-frow">
              <GobField label="Monto (UMA)" req hint="1 UMA = $ 18.200 (may. 2026)"><input className="gob-input mono" defaultValue="50" /></GobField>
              <GobField label="Equivalente"><input className="gob-input mono" defaultValue="$ 910.000" disabled style={{background:'var(--g-stripe)',color:'var(--g-mute)'}} /></GobField>
            </div>
          </GobFSec>

          <GobFSec n="05" title="Notificación y firma">
            <div className="gob-ftgl"><span className="tgl is-on" /><div className="bd"><b>Notificar por correo institucional</b><span>El infractor recibe el acta y el plazo de descargo.</span></div></div>
            <div className="gob-ftgl"><span className="tgl is-on" /><div className="bd"><b>Adjuntar al expediente público</b><span>Visible en el caso vinculado bajo Res. MS 2588/2022.</span></div></div>
          </GobFSec>
        </div>
        <div className="gob-sheet-foot">
          <button className="gob-btn">Guardar borrador</button>
          <div className="sp" />
          <button className="gob-btn">Cancelar</button>
          <button className="gob-btn gob-btn--danger"><i className="fa fa-gavel" /> Labrar acta</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FORM · DECLARAR BROTE (Gobierno · epidemiológico)
// ============================================================
function GobDeclararBrote() {
  return (
    <div className="gob-sheetwrap">
      <div className="gob-sheet">
        <GobSheetHead route="?accion=declarar-brote" icon="fa-flask" tone="warn" title="Declarar brote" sub="Vigilancia epidemiológica · genera alerta territorial" />
        <div className="gob-sheet-body">
          <div className="gob-fcallout" data-tone="warn">
            <div className="t"><i className="fa fa-bullhorn" /> Activa el protocolo de vigilancia</div>
            <div className="x">Al declarar, se notifica a govts y orgs en el radio, aparece en el mapa de vigilancia y puede gatillar vacunación obligatoria.</div>
          </div>

          <GobFSec n="01" title="Enfermedad">
            <div className="gob-frow">
              <GobField label="Zoonosis" req>
                <select className="gob-select" defaultValue="rabia"><option value="rabia">Rabia</option><option>Leptospirosis</option><option>Hidatidosis</option><option>Brucelosis</option><option>Toxoplasmosis</option></select>
              </GobField>
              <GobField label="Especie reservorio" req>
                <select className="gob-select" defaultValue="murcielago"><option value="murcielago">Murciélago</option><option>Canino</option><option>Felino</option><option>Roedor</option><option>Otra</option></select>
              </GobField>
            </div>
            <GobField label="Severidad" req>
              <div className="gob-fopt is-sel" data-tone="danger"><span className="radio" /><div className="bd"><b>Crítica</b><span>Riesgo sanitario inmediato a población.</span></div></div>
              <div className="gob-fopt"><span className="radio" /><div className="bd"><b>Activa</b><span>Confirmada, en seguimiento.</span></div></div>
            </GobField>
          </GobFSec>

          <GobFSec n="02" title="Foco">
            <GobField label="Ubicación del foco" req>
              <div className="gob-suffix"><input style={{fontFamily:'var(--g-sans)'}} defaultValue="Camino de los Remeros 1200, Tigre" /><div className="sfx"><i className="fa fa-map-marker" /></div></div>
            </GobField>
            <div className="gob-fmap"><span style={{position:'absolute',top:'46%',left:'50%',transform:'translate(-50%,-100%)',fontSize:26}}>📍</span><span className="coords">-34.4264, -58.5797</span></div>
            <GobField label="Radio de alerta" req hint="Se notifica a todas las mascotas registradas dentro del radio.">
              <div className="gob-frow">
                <div className="gob-suffix"><input defaultValue="5" /><div className="sfx">km</div></div>
                <input className="gob-input" defaultValue="≈ 1.840 mascotas alcanzadas" disabled style={{background:'var(--g-stripe)',color:'var(--g-mute)'}} />
              </div>
            </GobField>
          </GobFSec>

          <GobFSec n="03" title="Alcance">
            <div className="gob-frow">
              <GobField label="Casos confirmados" req><input className="gob-input mono" defaultValue="1" /></GobField>
              <GobField label="Sospechosos"><input className="gob-input mono" defaultValue="3" /></GobField>
            </div>
            <GobField label="Notas epidemiológicas" opt="opcional">
              <textarea className="gob-textarea" rows="2" defaultValue="Murciélago hallado con sintomatología compatible. Confirmado por laboratorio (Instituto Pasteur). Sin contacto humano reportado." />
            </GobField>
          </GobFSec>

          <GobFSec n="04" title="Medidas">
            <div className="gob-ftgl"><span className="tgl is-on" /><div className="bd"><b>Vacunación antirrábica obligatoria en el radio</b><span>Genera campaña y recordatorios a los titulares.</span></div></div>
            <div className="gob-ftgl"><span className="tgl is-on" /><div className="bd"><b>Notificar a organizaciones del radio</b><span>Veterinarias y refugios reciben el protocolo.</span></div></div>
            <div className="gob-ftgl"><span className="tgl" /><div className="bd"><b>Restricción de tránsito de animales</b><span>Bloquea transferencias dentro del radio.</span></div></div>
          </GobFSec>
        </div>
        <div className="gob-sheet-foot">
          <button className="gob-btn">Cancelar</button>
          <div className="sp" />
          <button className="gob-btn gob-btn--warn"><i className="fa fa-flask" /> Declarar brote</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FORM · NUEVA CUENTA INSTITUCIONAL (Admin)
// ============================================================
function AdminNuevaCuenta() {
  return (
    <div className="gob-sheetwrap">
      <div className="gob-sheet">
        <GobSheetHead route="?accion=nueva-cuenta" icon="fa-user-plus" tone="" title="Nueva cuenta institucional" sub="Alta de govt o admin · acceso nominal y auditado" />
        <div className="gob-sheet-body">
          <GobFSec n="01" title="Identidad">
            <div className="gob-frow">
              <GobField label="Nombre y apellido" req><input className="gob-input" defaultValue="Lic. Ariel Bustos" /></GobField>
              <GobField label="Documento" req><input className="gob-input mono" defaultValue="28.123.456" /></GobField>
            </div>
            <GobField label="Correo institucional" req hint="Debe pertenecer a un dominio gob.ar o de organización verificada.">
              <input className="gob-input" defaultValue="ariel.bustos@mimar.gob.ar" />
            </GobField>
          </GobFSec>

          <GobFSec n="02" title="Rol">
            <div className="gob-fopt is-sel"><span className="radio" /><div className="bd"><b>Govt — autoridad de jurisdicción</b><span>Opera la cola, casos y vigilancia de sus localidades.</span></div></div>
            <div className="gob-fopt" data-tone="danger"><span className="radio" /><div className="bd"><b>Admin — plataforma</b><span>Acceso universal. Gestiona cuentas y sistema.</span></div></div>
          </GobFSec>

          <GobFSec n="03" title="Jurisdicción asignada">
            <div className="gob-frow">
              <GobField label="Provincia" req><select className="gob-select"><option>CABA</option><option>Buenos Aires</option><option>Córdoba</option><option>Santa Fe</option></select></GobField>
              <GobField label="Alcance"><select className="gob-select"><option>Localidades específicas</option><option>Toda la provincia</option></select></GobField>
            </div>
            <GobField label="Localidades" hint="El govt solo verá casos de estas localidades.">
              <div className="gob-fchips">
                {['Comuna 1','Comuna 2','Comuna 3','Comuna 4','Comuna 5','Comuna 6'].map((l,i) => <span key={l} className={'gob-fchip'+(i<3?' is-on':'')}>{i<3 && <i className="fa fa-check" style={{marginRight:5}} />}{l}</span>)}
              </div>
            </GobField>
          </GobFSec>

          <GobFSec n="04" title="Permisos">
            <div className="gob-ftgl"><span className="tgl is-on" /><div className="bd"><b>Aprobar / rechazar solicitudes de cola</b><span>Matrículas, orgs y credenciales RUPGA.</span></div></div>
            <div className="gob-ftgl"><span className="tgl is-on" /><div className="bd"><b>Labrar actas de infracción</b><span>Requiere matrícula cargada.</span></div></div>
            <div className="gob-ftgl"><span className="tgl" /><div className="bd"><b>Declarar brotes epidemiológicos</b><span>Acción de alto impacto territorial.</span></div></div>
            <div className="gob-ftgl"><span className="tgl" /><div className="bd"><b>Editar reglas de jurisdicción</b><span>Cambia obligatoriedades provinciales.</span></div></div>
          </GobFSec>

          <div className="gob-fcallout">
            <div className="t"><i className="fa fa-envelope" /> Invitación por correo</div>
            <div className="x">Se envía un enlace de activación de un solo uso (válido 72 h). La cuenta queda inactiva hasta que defina su contraseña.</div>
          </div>
        </div>
        <div className="gob-sheet-foot">
          <button className="gob-btn">Cancelar</button>
          <div className="sp" />
          <button className="gob-btn gob-btn--primary"><i className="fa fa-paper-plane" /> Crear y enviar invitación</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { GobLogin, GobActaInfraccion, GobDeclararBrote, AdminNuevaCuenta });
