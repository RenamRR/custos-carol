import Link from "next/link";

const MENSAGEM_ERRO_BANCO = "Erro ao consultar o banco. Tente novamente.";

export function EstadoErro({
  titulo,
  mensagem,
  erro,
  acaoHref,
  acaoRotulo,
}: {
  titulo: string;
  mensagem?: string;
  erro?: unknown;
  acaoHref?: string;
  acaoRotulo?: string;
}) {
  if (erro !== undefined) {
    console.error(`[${titulo}]`, erro);
  }
  const texto = erro !== undefined ? MENSAGEM_ERRO_BANCO : (mensagem ?? MENSAGEM_ERRO_BANCO);

  return (
    <div className="estado-vazio" role="alert">
      <h2>{titulo}</h2>
      <p>{texto}</p>
      {acaoHref && acaoRotulo && (
        <Link href={acaoHref} className="btn btn-soft">
          {acaoRotulo}
        </Link>
      )}
    </div>
  );
}
