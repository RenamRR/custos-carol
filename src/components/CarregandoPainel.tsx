export function CarregandoPainel() {
  return (
    <div className="stack-list" aria-busy="true" aria-label="Carregando conteúdo">
      <div className="card" style={{ minHeight: 132, opacity: 0.72 }}>
        <span className="badge badge--cream">Carregando...</span>
      </div>
      <div className="card" style={{ minHeight: 112, opacity: 0.56 }} />
      <div className="card" style={{ minHeight: 112, opacity: 0.4 }} />
    </div>
  );
}
