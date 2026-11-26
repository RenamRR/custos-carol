import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { EstadoErro } from "@/components/EstadoErro";
import { HistoricoInsumoView } from "@/components/HistoricoInsumoView";
import { exigirUsuario } from "@/lib/auth";
import { carregarHistoricoInsumo } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function ConteudoHistoricoInsumo({ insumoId }: { insumoId: number }) {
  let dados;
  try {
    dados = await carregarHistoricoInsumo(insumoId);
  } catch (err) {
    return (
      <EstadoErro
        titulo="Não foi possível carregar o histórico"
        erro={err}
        acaoHref="/insumos"
        acaoRotulo="Voltar para Insumos"
      />
    );
  }

  if (!dados) {
    notFound();
  }

  return <HistoricoInsumoView dados={dados} />;
}

export default async function PaginaHistoricoInsumo({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirUsuario();
  const { id } = await params;
  const insumoId = Number(id);

  if (!Number.isInteger(insumoId) || insumoId <= 0) {
    notFound();
  }

  return (
    <Suspense fallback={<CarregandoPainel />}>
      <ConteudoHistoricoInsumo insumoId={insumoId} />
    </Suspense>
  );
}
