import { brl } from "@/lib/calc";
import type { HistoricoProduto } from "@/lib/linha-do-tempo";
import { GraficoCustoEMargem } from "./GraficoHistorico";
import { descreverCausa, formatarDataHoraBR, formatarPctBR } from "./formatarMudancas";

export function HistoricoProdutoSection({
  historico,
}: {
  historico: HistoricoProduto | null;
}) {
  if (!historico) return null;

  const { produto, pontos, canais } = historico;
  const canaisPorId = new Map(canais.map((c) => [c.id, c]));
  const pontosDesc = [...pontos].reverse();

  return (
    <section id="historico" className="card" aria-label="Custo e margem no tempo">
      <div className="section-row" style={{ marginBottom: 4 }}>
        <h2 className="section-heading">Custo e margem no tempo</h2>
        <span className="badge badge--cream tnum">12 meses</span>
      </div>
      <p className="section-note" style={{ marginBottom: 12 }}>
        Calculado com a receita atual a partir das mudanças de preços, taxas e custos.
      </p>

      <GraficoCustoEMargem
        pontos={pontos}
        canais={canais}
        nomeProduto={produto.nome}
      />

      <div style={{ marginTop: 14 }}>
        <h3 className="chart-subhead" style={{ marginBottom: 6 }}>
          Mudanças que mexeram no produto
        </h3>

        {pontosDesc.length === 0 ? (
          <p className="section-note">Sem registros no período.</p>
        ) : (
          <div className="history-table-list" style={{ marginTop: 0 }}>
            <table className="history-table tnum">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Custo / Margem</th>
                  <th>O que mudou</th>
                </tr>
              </thead>
              <tbody>
                {pontosDesc.map((pt, idx) => {
                  const resumoMargens = pt.canais
                    .map((c) => {
                      const canal = canaisPorId.get(c.canalId);
                      return `${canal ? canal.nome : `#${c.canalId}`}: ${formatarPctBR(c.margemPct, 1)}`;
                    })
                    .join(" · ");

                  return (
                    <tr key={`${pt.instante}-${idx}`}>
                      <td>{formatarDataHoraBR(pt.instante)}</td>
                      <td>
                        <strong>{brl(pt.custoUn)}</strong>
                        {resumoMargens && (
                          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                            {resumoMargens}
                          </div>
                        )}
                      </td>
                      <td>
                        {pt.causas.length === 0 ? (
                          <span style={{ color: "var(--muted)" }}>Início do período</span>
                        ) : (
                          pt.causas
                            .map((causa) => descreverCausa(causa, { incluirAutor: true }))
                            .join("; ")
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
