import { Suspense } from "react";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { EstadoErro } from "@/components/EstadoErro";
import { TelaVender } from "@/components/TelaVender";
import { exigirUsuario } from "@/lib/auth";
import { carregarVender } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function ConteudoVender() {
  let dados;
  try {
    dados = await carregarVender();
  } catch (err) {
    return (
      <EstadoErro
        titulo="Não foi possível carregar a tela de vendas"
        mensagem={err instanceof Error ? err.message : "Erro ao consultar o banco."}
      />
    );
  }

  return <TelaVender dados={dados} />;
}

export default async function PaginaVender() {
  await exigirUsuario();

  return (
    <Suspense fallback={<CarregandoPainel />}>
      <ConteudoVender />
    </Suspense>
  );
}
