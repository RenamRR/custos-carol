import { Suspense } from "react";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { DetalheProduto } from "@/components/DetalheProduto";
import { EstadoErro } from "@/components/EstadoErro";
import { exigirUsuario } from "@/lib/auth";
import { carregarCustoHora, carregarInsumos, carregarProdutos } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function ConteudoDetalheProduto({ produtoId }: { produtoId: number }) {
  let insumos;
  let produtos;
  let custoHora;

  try {
    [insumos, produtos, custoHora] = await Promise.all([
      carregarInsumos(),
      carregarProdutos(),
      carregarCustoHora(),
    ]);
  } catch (err) {
    return (
      <EstadoErro
        titulo="Não foi possível abrir o produto"
        mensagem={err instanceof Error ? err.message : "Erro ao consultar o banco."}
        acaoHref="/produtos"
        acaoRotulo="Voltar para Produtos"
      />
    );
  }

  const produto = produtos.find((p) => p.id === produtoId);
  if (!produto) {
    return (
      <EstadoErro
        titulo="Produto não encontrado"
        mensagem="Esse produto pode ter sido removido recentemente."
        acaoHref="/produtos"
        acaoRotulo="Voltar para Produtos"
      />
    );
  }

  return <DetalheProduto produto={produto} insumos={insumos} custoHora={custoHora} />;
}

export default async function PaginaDetalheProduto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirUsuario();
  const { id } = await params;
  const produtoId = Number(id);

  if (!Number.isInteger(produtoId) || produtoId <= 0) {
    return (
      <EstadoErro
        titulo="Produto não encontrado"
        mensagem="O código deste produto não é válido."
        acaoHref="/produtos"
        acaoRotulo="Voltar para Produtos"
      />
    );
  }

  return (
    <Suspense fallback={<CarregandoPainel />}>
      <ConteudoDetalheProduto produtoId={produtoId} />
    </Suspense>
  );
}
