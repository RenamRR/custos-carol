import { Suspense } from "react";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { EstadoErro } from "@/components/EstadoErro";
import { ListaProdutos } from "@/components/ListaProdutos";
import { exigirUsuario } from "@/lib/auth";
import { calcularProduto } from "@/lib/calc";
import { carregarCustoHora, carregarInsumos, carregarProdutos } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function ConteudoProdutos() {
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
        titulo="Não foi possível carregar os produtos"
        mensagem={err instanceof Error ? err.message : "Erro ao consultar o banco."}
      />
    );
  }

  const resultados = produtos.map((p) => calcularProduto(p, insumos, custoHora));
  return <ListaProdutos produtos={produtos} resultados={resultados} />;
}

export default async function PaginaProdutos() {
  await exigirUsuario();

  return (
    <Suspense fallback={<CarregandoPainel />}>
      <ConteudoProdutos />
    </Suspense>
  );
}
