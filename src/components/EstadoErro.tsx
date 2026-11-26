import Link from "next/link";

export function EstadoErro({
  titulo,
  mensagem,
  acaoHref,
  acaoRotulo,
}: {
  titulo: string;
  mensagem: string;
  acaoHref?: string;
  acaoRotulo?: string;
}) {
  return (
    <div className="estado-vazio" role="alert">
      <h2>{titulo}</h2>
      <p>{mensagem}</p>
      {acaoHref && acaoRotulo && (
        <Link href={acaoHref} className="btn btn-soft">
          {acaoRotulo}
        </Link>
      )}
    </div>
  );
}
