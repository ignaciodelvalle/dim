// App entry · Portales públicos TANDA 2 (Dirección A — Libreta Nacional)
function PublicApp2() {
  return (
    <DesignCanvas>
      <DCSection id="tiers" title="Credencial pública — tiers de divulgación"
        subtitle="Lo que ve quien escanea el QR de la chapita, según cuánto decide mostrar el dueño. Tier 0 = identidad. Tier 0+ = suma alerta médica (siempre visible por seguridad). Tier 2 = libreta médica que un vet puede leer y completar. (Tier 1 = perdido, en el archivo anterior.)">
        <DCArtboard id="tier0" label="Tier 0 · identidad básica" width={440} height={920}><CredTier0 /></DCArtboard>
        <DCArtboard id="tier0plus" label="Tier 0+ · alerta médica" width={440} height={1020}><CredTier0Plus /></DCArtboard>
        <DCArtboard id="tier2" label="Tier 2 · libreta médica (vet)" width={440} height={1120}><CredTier2 /></DCArtboard>
        <DCArtboard id="mostrar-libreta" label="Sheet · el dueño habilita Tier 2" width={600} height={1080}><SheetMostrarLibreta /></DCArtboard>
      </DCSection>

      <DCSection id="denuncia" title="Denunciar maltrato — wizard de 5 pasos"
        subtitle="Rehecho con TODOS los pasos visibles y un stepper numerado «Paso N de 5». Anónimo si se quiere. Termina en un código DEN- para seguimiento, con su pantalla de búsqueda y el detalle público.">
        <DCArtboard id="den1" label="Paso 1 · Qué pasó" width={440} height={1000}><DenWizard1 /></DCArtboard>
        <DCArtboard id="den2" label="Paso 2 · Gravedad" width={440} height={820}><DenWizard2 /></DCArtboard>
        <DCArtboard id="den3" label="Paso 3 · Dónde y cuándo" width={440} height={1180}><DenWizard3 /></DCArtboard>
        <DCArtboard id="den4" label="Paso 4 · Sobre quién" width={440} height={1000}><DenWizard4 /></DCArtboard>
        <DCArtboard id="den5" label="Paso 5 · Cerrar / enviar" width={440} height={1000}><DenWizard5 /></DCArtboard>
        <DCArtboard id="denok" label="Éxito · código DEN-" width={440} height={840}><DenWizardOK /></DCArtboard>
        <DCArtboard id="denbuscar" label="Buscar mi denuncia" width={900} height={620}><DenBuscar /></DCArtboard>
        <DCArtboard id="dendetalle" label="Detalle público (DEN-)" width={900} height={1180}><DenDetalle /></DCArtboard>
      </DCSection>

      <DCSection id="adopcion" title="Adopción — ficha, postulación y seguimiento"
        subtitle="El flujo más complejo del lado adoptante: ficha pública con galería, salud, personalidad y refugio; formulario de postulación con secciones numeradas; confirmación; y el seguimiento de «Mis postulaciones».">
        <DCArtboard id="adopt-detalle" label="Ficha pública de adopción" width={760} height={1820}><AdoptDetalle /></DCArtboard>
        <DCArtboard id="adopt-postular" label="Postulación (form)" width={760} height={1640}><AdoptPostular /></DCArtboard>
        <DCArtboard id="adopt-ok" label="Postulación enviada" width={760} height={780}><AdoptOK /></DCArtboard>
        <DCArtboard id="mis-postulaciones" label="Mis postulaciones (seguimiento)" width={900} height={680}><MisPostulaciones /></DCArtboard>
        <DCArtboard id="refugio" label="Perfil público de refugio" width={1240} height={1180}><RefugioPerfil /></DCArtboard>
      </DCSection>

      <DCSection id="transfer" title="Transferencias y reclamos"
        subtitle="Transferir una mascota dueño → organización con stepper de 3 pasos (Tipo → Destinatario → Confirmar), la bandeja de transferencias entre organizaciones, y el flujo de reclamar / devolver una mascota por chip.">
        <DCArtboard id="tr1" label="Transferir · Paso 1 Tipo" width={680} height={900}><SheetTransfer1 /></DCArtboard>
        <DCArtboard id="tr2" label="Transferir · Paso 2 Destinatario" width={680} height={960}><SheetTransfer2 /></DCArtboard>
        <DCArtboard id="tr3" label="Transferir · Paso 3 Confirmar" width={680} height={940}><SheetTransfer3 /></DCArtboard>
        <DCArtboard id="org-transfer" label="Transferencias entre orgs (bandeja)" width={900} height={900}><OrgTransferInbox /></DCArtboard>
        <DCArtboard id="reclamar" label="Reclamar mascota (por chip)" width={900} height={1560}><PubReclamar /></DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<PublicApp2 />);
