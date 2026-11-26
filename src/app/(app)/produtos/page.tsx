import { Suspense } from "react";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { EstadoErro } from "@/components/EstadoErro";
import { ListaProdutos } from "@/components/ListaProdutos";
import { exigirUsuario } from "@/lib/auth";
import { carregarPainel } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function ConteudoProdutos() {
  let painel;

  try {
    painel = await carregarPainel();
  } catch (err) {
    return (
      <EstadoErro
        titulo="Não foi possível carregar os produtos"
        erro={err}
      />
    );
  }

  return <ListaProdutos itens={painel.produtos} />;
}

export default async function PaginaProdutos() {
  await exigirUsuario();

  return (
    <Suspense fallback={<CarregandoPainel />}>
      <ConteudoProdutos />
    </Suspense>
  );
}
