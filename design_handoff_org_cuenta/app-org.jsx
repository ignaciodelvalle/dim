// App entry · Organización + Mi Cuenta (Dirección A — Libreta Nacional)
function OrgCuentaApp() {
  return (
    <DesignCanvas>
      <DCSection id="org" title="Organización / Refugio — back-office"
        subtitle="El actor que faltaba por dentro. Tier Operador (azul-marino, acento teal para diferenciarlo de gobierno). Dashboard, gestión de mascotas en adopción, pipeline de postulaciones, agenda y equipo.">
        <DCArtboard id="org-panel" label="Panel del refugio" width={1180} height={1080}><OrgPanel /></DCArtboard>
        <DCArtboard id="org-mascotas" label="Mis mascotas (gestión de adopción)" width={1180} height={900}><OrgMascotas /></DCArtboard>
        <DCArtboard id="org-adopciones" label="Adopciones (pipeline por etapa)" width={1340} height={760}><OrgAdopciones /></DCArtboard>
        <DCArtboard id="org-agenda" label="Agenda del día" width={1100} height={980}><OrgAgenda /></DCArtboard>
        <DCArtboard id="org-equipo" label="Equipo y voluntarios" width={1100} height={820}><OrgEquipo /></DCArtboard>
      </DCSection>

      <DCSection id="cuenta" title="Owner — «Mi cuenta»"
        subtitle="El clúster de cuenta del dueño, en la estética cálida «Libreta Nacional» con submenú lateral. Ajustes y notificaciones, hogar de tránsito, solicitudes recibidas y membresías.">
        <DCArtboard id="acct-ajustes" label="Ajustes de cuenta" width={1100} height={1360}><AcctAjustes /></DCArtboard>
        <DCArtboard id="acct-transitos" label="Tránsitos (hogar temporal)" width={1100} height={1120}><AcctTransitos /></DCArtboard>
        <DCArtboard id="acct-solicitudes" label="Solicitudes recibidas" width={1100} height={760}><AcctSolicitudes /></DCArtboard>
        <DCArtboard id="acct-membresias" label="Membresías" width={1100} height={780}><AcctMembresias /></DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<OrgCuentaApp />);
