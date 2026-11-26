import { Suspense } from "react";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { EstadoErro } from "@/components/EstadoErro";
import { TelaVendasMes } from "@/components/TelaVendasMes";
import { exigirUsuario } from "@/lib/auth";
import { carregarMes } from "@/lib/queries";

export const dynamic = "force-dynamic";

function mesAtualSP(): { ano: number; mes: number } {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const [anoStr, mesStr] = hoje.split("-");
  return { ano: Number(anoStr), mes: Number(mesStr) };
}

function interpretarMesParam(param?: string): { ano: number; mes: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [anoStr, mesStr] = param.split("-");
    const ano = Number(anoStr);
    const mes = Number(mesStr);
    if (ano >= 2020 && ano <= 2100 && mes >= 1 && mes <= 12) {
      return { ano, mes };
    }
  }
  return mesAtualSP();
}

async function ConteudoVendasMes({ ano, mes }: { ano: number; mes: number }) {
  let dados;
  try {
    dados = await carregarMes(ano, mes);
  } catch (err) {
    return (
      <EstadoErro
        titulo="Não foi possível carregar o mês"
        mensagem={err instanceof Error ? err.message : "Erro ao consultar o banco."}
      />
    );
  }

  return <TelaVendasMes key={`${dados.ano}-${dados.mes}`} dados={dados} />;
}

export default async function PaginaVendasMes({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  await exigirUsuario();
  const { mes: mesParam } = await searchParams;
  const { ano, mes } = interpretarMesParam(mesParam);

  return (
    <Suspense fallback={<CarregandoPainel />}>
      <ConteudoVendasMes ano={ano} mes={mes} />
    </Suspense>
  );
}
