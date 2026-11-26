import Link from "next/link";
import { brl, brl4 } from "@/lib/calc";
import type { HistoricoInsumo } from "@/lib/linha-do-tempo";
import { GraficoDegrau } from "./GraficoHistorico";
import { formatarDataCurtaBR, formatarDataHoraBR } from "./formatarMudancas";

function formatarVariacaoPct(de: number, para: number): { texto: string; classe: string } {
  if (!(de > 0)) return { texto: "—", classe: "" };
  const pct = ((para - de) / de) * 100;
  const sinal = pct > 0 ? "+" : "";
  const texto = `${sinal}${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(pct)}%`;
  const classe = pct > 0.05 ? "history-var-up" : pct < -0.05 ? "history-var-down" : "";
  return { texto, classe };
}

export function HistoricoInsumoView({ dados }: { dados: HistoricoInsumo }) {
  const { insumo, pontos } = dados;
  const ultimo = pontos[pontos.length - 1] ?? null;
  const primeiro = pontos[0] ?? null;

  const linhasTabela = pontos
    .map((ponto, idx) => {
      const anterior = idx > 0 ? pontos[idx - 1] : null;
      return {
        ponto,
        precoAnterior: anterior ? anterior.preco : null,
      };
    })
    .reverse();

  const ariaLabel =
    pontos.length > 1 && primeiro && ultimo
      ? `Histórico do preço de ${insumo.nome} entre ${formatarDataCurtaBR(
          primeiro.instante,
        )} e ${formatarDataCurtaBR(ultimo.instante)}: de ${brl(primeiro.preco)} para ${brl(
          ultimo.preco,
        )}.`
      : `Histórico de preço de ${insumo.nome}.`;

  return (
    <>
      <div className="detail-topbar">
        <Link href="/insumos" className="btn btn-soft">
          &lsaquo; Insumos
        </Link>
        <span className="badge badge--cream">
          {insumo.tipo === "ingrediente" ? "Ingrediente" : "Embalagem"}
        </span>
      </div>

      <div>
        <h1 className="page-title">{insumo.nome}</h1>
        <p className="page-sub">
          {insumo.embalagem || `${insumo.qtd} ${insumo.unidade}`} · últimos 12 meses
        </p>
      </div>

      {ultimo && (
        <div className="kpi-pair">
          <div className="kpi-box">
            <div className="metric-label">Preço vigente</div>
            <div className="kpi-num tnum">{brl(ultimo.preco)}</div>
            <div className="metric-sub tnum">
              {insumo.qtd} {insumo.unidade}
            </div>
          </div>
          <div className="kpi-box">
            <div className="metric-label">Por {insumo.unidade}</div>
            <div className="kpi-num tnum">{brl4(ultimo.precoPorUnidade)}</div>
            <div className="metric-sub tnum">
              {ultimo.alteradoPor ? `Última alteração: ${ultimo.alteradoPor}` : "Preço atual"}
            </div>
          </div>
        </div>
      )}

      <section className="card" aria-label="Evolução do preço pago">
        <div className="section-row" style={{ marginBottom: 8 }}>
          <h2 className="section-heading">Preço pago no tempo</h2>
          <span className="badge badge--cream tnum">
            {pontos.length} {pontos.length === 1 ? "registro" : "registros"}
          </span>
        </div>

        <GraficoDegrau
          pontos={pontos.map((p) => ({ instante: p.instante, valor: p.preco }))}
          formatarY={brl}
          ariaLabel={ariaLabel}
          mensagemVazio="Nenhuma mudança de preço registrada nos últimos 12 meses."
        />
      </section>

      <section className="card" aria-label="Tabela de mudanças de preço">
        <h2 className="section-heading">Mudanças registradas</h2>
        {linhasTabela.length === 0 ? (
          <p className="section-note" style={{ marginTop: 8 }}>
            Nenhum preço informado ainda para este item.
          </p>
        ) : (
          <div className="history-table-list">
            <table className="history-table tnum">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>De &rarr; Para</th>
                  <th>Var.</th>
                  <th>Quem</th>
                </tr>
              </thead>
              <tbody>
                {linhasTabela.map(({ ponto, precoAnterior }, idx) => {
                  const varInfo =
                    precoAnterior !== null
                      ? formatarVariacaoPct(precoAnterior, ponto.preco)
                      : { texto: "Inicial", classe: "" };
                  return (
                    <tr key={`${ponto.instante}-${idx}`}>
                      <td>{formatarDataHoraBR(ponto.instante)}</td>
                      <td>
                        {precoAnterior !== null
                          ? `${brl(precoAnterior)} → ${brl(ponto.preco)}`
                          : brl(ponto.preco)}
                      </td>
                      <td className={varInfo.classe}>{varInfo.texto}</td>
                      <td>{ponto.alteradoPor ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
