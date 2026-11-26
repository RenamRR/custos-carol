import { Suspense } from "react";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { CatalogoInsumos } from "@/components/CatalogoInsumos";
import { EstadoErro } from "@/components/EstadoErro";
import { exigirUsuario } from "@/lib/auth";
import { carregarInsumos } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function ConteudoInsumos() {
  try {
    const insumos = await carregarInsumos();
    return <CatalogoInsumos insumos={insumos} />;
  } catch (err) {
    return (
      <EstadoErro
        titulo="Não foi possível carregar os insumos"
        mensagem={err instanceof Error ? err.message : "Erro ao consultar o banco."}
      />
    );
  }
}

export default async function PaginaInsumos() {
  await exigirUsuario();

  return (
    <Suspense fallback={<CarregandoPainel />}>
      <ConteudoInsumos />
    </Suspense>
  );
}
