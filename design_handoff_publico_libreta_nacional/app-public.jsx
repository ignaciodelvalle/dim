// App entry · Portales públicos (Dirección A — Libreta Nacional)
function PublicApp() {
  return (
    <DesignCanvas>
      <DCSection id="public" title="Portales públicos — ciudadanía"
        subtitle="Páginas sin login en la estética «Libreta Nacional»: portada, catálogos de adopción y mascotas perdidas, la credencial pública que se ve al escanear el QR, el flujo de denuncia y el expediente público.">
        <DCArtboard id="pub-portada" label="Portada pública" width={1320} height={1240}><PubPortada /></DCArtboard>
        <DCArtboard id="pub-adoptar" label="Adoptar · catálogo" width={1320} height={1320}><PubAdoptar /></DCArtboard>
        <DCArtboard id="pub-perdidas" label="Perdidas · catálogo (emergencia)" width={1320} height={1480}><PubPerdidas /></DCArtboard>
        <DCArtboard id="pub-credencial" label="Credencial pública · escaneo de QR" width={820} height={1180}><PubCredencial /></DCArtboard>
        <DCArtboard id="pub-denuncia" label="Denuncia · wizard + éxito" width={1180} height={900}><PubDenuncia /></DCArtboard>
        <DCArtboard id="pub-caso" label="Caso público · expediente" width={820} height={1340}><PubCaso /></DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<PublicApp />);
