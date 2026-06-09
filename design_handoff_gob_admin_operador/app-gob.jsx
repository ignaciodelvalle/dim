// App entry · Console Gobierno + Admin (Dirección A — Libreta Nacional · Operador)
function GobAdminApp() {
  return (
    <DesignCanvas>
      <DCSection id="gob" title="Gobierno — console de jurisdicción"
        subtitle="Tier «Operador»: chrome institucional azul-900, lienzo gris denso, mismo ADN serif/mono/sellos. Panel, cola de aprobaciones, expedientes regulatorios y vigilancia epidemiológica con mapa multicapa.">
        <DCArtboard id="gob-panel" label="Panel de jurisdicción" width={1340} height={1180}><GobPanel /></DCArtboard>
        <DCArtboard id="gob-cola" label="Cola de solicitudes (selección múltiple)" width={1200} height={900}><GobCola /></DCArtboard>
        <DCArtboard id="gob-detalle" label="Detalle de solicitud (decisión firmada)" width={900} height={1320}><GobColaDetalle /></DCArtboard>
        <DCArtboard id="gob-casos" label="Casos regulatorios (índice)" width={1200} height={820}><GobCasos /></DCArtboard>
        <DCArtboard id="gob-maltrato" label="Maltrato — cola de triage" width={1200} height={1000}><GobMaltrato /></DCArtboard>
        <DCArtboard id="gob-expediente" label="Expediente de maltrato (11 secciones)" width={900} height={1900}><GobMaltratoDetalle /></DCArtboard>
        <DCArtboard id="gob-vigilancia" label="Vigilancia · MAPA MULTICAPA" width={1340} height={1100}><GobVigilancia /></DCArtboard>
        <DCArtboard id="gob-reglas" label="Reglas por jurisdicción" width={1200} height={720}><GobReglas /></DCArtboard>
        <DCArtboard id="gob-catalogo" label="Catálogo regulatorio" width={1200} height={760}><GobCatalogo /></DCArtboard>
      </DCSection>

      <DCSection id="admin" title="Admin — console de plataforma"
        subtitle="Meta-plataforma del superadmin: salud técnica del sistema, cuentas institucionales y moderación. Mismo tier Operador, con el acento de superadmin en rojo.">
        <DCArtboard id="admin-panel" label="Panel de administración" width={1180} height={1000}><AdminPanel /></DCArtboard>
        <DCArtboard id="admin-equipo" label="Equipo (govts y admins)" width={1180} height={920}><AdminEquipo /></DCArtboard>
        <DCArtboard id="admin-moderacion" label="Moderación" width={1180} height={840}><AdminModeracion /></DCArtboard>
        <DCArtboard id="admin-jurisdicciones" label="Jurisdicciones (mapa de cobertura)" width={1340} height={760}><AdminJurisdicciones /></DCArtboard>
        <DCArtboard id="admin-sistema" label="Sistema / Outbox (salud técnica)" width={1180} height={920}><AdminSistema /></DCArtboard>
      </DCSection>

      <DCSection id="acceso" title="Acceso institucional"
        subtitle="Login sobrio y separado del dueño, para gobierno / organización / plataforma. Sin alta pública: el acceso es nominal, por invitación, y todo queda auditado.">
        <DCArtboard id="login" label="Acceso institucional (gob / org / admin)" width={1100} height={720}><GobLogin /></DCArtboard>
      </DCSection>

      <DCSection id="forms" title="Formularios del operador"
        subtitle="Los actos administrativos más importantes, como «documentos» — etiquetas mono, secciones numeradas, normativa y firma. De Gobierno (acta, brote) y de Admin (alta de cuenta).">
        <DCArtboard id="form-acta" label="Gob · Acta de infracción (Ley 14.346)" width={660} height={1640}><GobActaInfraccion /></DCArtboard>
        <DCArtboard id="form-brote" label="Gob · Declarar brote (epidemiológico)" width={660} height={1480}><GobDeclararBrote /></DCArtboard>
        <DCArtboard id="form-cuenta" label="Admin · Nueva cuenta institucional" width={660} height={1380}><AdminNuevaCuenta /></DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<GobAdminApp />);
