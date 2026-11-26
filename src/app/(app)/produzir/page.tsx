import { Suspense } from "react";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { EstadoErro } from "@/components/EstadoErro";
import { TelaProduzir } from "@/components/TelaProduzir";
import { exigirUsuario } from "@/lib/auth";
import { carregarProduzir } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function ConteudoProduzir({ planoQuery }: { planoQuery: string }) {
  let dados;

  try {
    dados = await carregarProduzir();
  } catch (err) {
    return (
      <EstadoErro
        titulo="Não foi possível carregar a tela de produção"
        mensagem={err instanceof Error ? err.message : "Erro ao consultar o banco."}
      />
    );
  }

  return <TelaProduzir dados={dados} planoQuery={planoQuery} />;
}

export default async function PaginaProduzir({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await exigirUsuario();
  const { p } = await searchParams;

  return (
    <Suspense fallback={<CarregandoPainel />}>
      <ConteudoProduzir planoQuery={p ?? ""} />
    </Suspense>
  );
}
