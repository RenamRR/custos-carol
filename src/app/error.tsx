"use client";

// Rede de segurança: pega o que escapa do try das páginas, inclusive o login no layout (app)
// quando o banco cai. Em produção o Next já esconde a mensagem do servidor; aqui ela nem é lida.
export default function Erro({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return (
    <main className="estado-vazio" role="alert" style={{ margin: "48px 16px" }}>
      <h2>Não consegui carregar</h2>
      <p>Erro ao consultar o banco. Tente novamente.</p>
      <button type="button" className="btn btn-soft" onClick={() => retry()}>
        Tentar de novo
      </button>
      {digest && <p style={{ fontSize: 12, opacity: 0.6 }}>Código: {digest}</p>}
    </main>
  );
}
