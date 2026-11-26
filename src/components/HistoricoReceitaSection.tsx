"use client";

import { useState } from "react";
import { brl } from "@/lib/calc";
import type { MudancaReceita, VersaoReceita } from "@/lib/linha-do-tempo";
import {
  descreverMudancaReceita,
  formatarDataHoraBR,
  formatarPctBR,
  formatarQtdLimpaBR,
} from "./formatarMudancas";

function classeDiff(m: MudancaReceita): string {
  if (m.campo === "ingrediente" || m.campo === "embalagem") {
    if (m.de === null && m.para !== null) return "receita-diff-item--add";
    if (m.de !== null && m.para === null) return "receita-diff-item--rem";
  }
  return "";
}

function SnapshotReceitaDetails({
  versao,
  abertoPorPadrao = false,
  titulo = "Ver a receita como era",
}: {
  versao: VersaoReceita;
  abertoPorPadrao?: boolean;
  titulo?: string;
}) {
  const { receita, linhas, embalagens } = versao;
  return (
    <details className="receita-details" open={abertoPorPadrao}>
      <summary className="receita-details-summary">{titulo}</summary>
      <div className="receita-snapshot-box tnum">
        <div className="receita-snapshot-params">
          Rende {formatarQtdLimpaBR(receita.rendimento)} un · Preparo{" "}
          {formatarQtdLimpaBR(receita.minutosPreparo, 2)} min · Acabamento{" "}
          {formatarQtdLimpaBR(receita.minutosAcabamentoUn, 2)} min/un ·{" "}
          {receita.semForno
            ? "Não vai ao forno"
            : `Forno ${formatarQtdLimpaBR(receita.minutosForno, 2)} min`}{" "}
          · Perda {formatarPctBR(receita.perdaPct)}
        </div>

        <div>
          <strong>Ingredientes</strong>
          {linhas.length === 0 ? (
            <div style={{ color: "var(--muted)" }}>Nenhum ingrediente</div>
          ) : (
            <ul className="receita-snapshot-list">
              {linhas.map((l, idx) => (
                <li key={`${l.insumoId}-${idx}`}>
                  {l.nome}: {formatarQtdLimpaBR(l.qtd)} {l.unidade}
                </li>
              ))}
            </ul>
          )}
        </div>

        {embalagens.length > 0 && (
          <div>
            <strong>Embalagens</strong>
            <ul className="receita-snapshot-list">
              {embalagens.map((e, idx) => (
                <li key={`${e.insumoId}-${idx}`}>
                  {e.nome}: {formatarQtdLimpaBR(e.qtdPorUnidade)} {e.unidade} por unidade
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

export function HistoricoReceitaSection({
  versoes,
}: {
  versoes: VersaoReceita[] | null;
}) {
  const [mostrarTodas, setMostrarTodas] = useState(false);

  if (!versoes) return null;

  const limiteInicial = 5;
  const exibidas = mostrarTodas ? versoes : versoes.slice(0, limiteInicial);

  return (
    <section id="historico-receita" className="card" aria-label="Histórico da receita">
      <div className="section-row" style={{ marginBottom: 6 }}>
        <h2 className="section-heading">Histórico da receita</h2>
        <span className="badge badge--cream tnum">
          {versoes.length} {versoes.length === 1 ? "versão" : "versões"}
        </span>
      </div>

      {versoes.length <= 1 ? (
        <div className="receita-versoes">
          <div className="chart-empty">
            <strong>Ainda sem mudanças na receita</strong>
            <span>
              As próximas edições de ingredientes, embalagens, tempos ou perda serão registradas aqui.
            </span>
          </div>
          {versoes.length === 1 && (
            <article className="receita-versao-card">
              <div className="receita-versao-head">
                <div className="receita-versao-meta tnum">
                  <strong>Receita registrada</strong> · {formatarDataHoraBR(versoes[0].vigenteDesde)}
                  {` · ${versoes[0].alteradoPor ?? "Sistema"}`}
                </div>
                <span className="receita-versao-custo tnum">{brl(versoes[0].custoUn)}/un</span>
              </div>
              <SnapshotReceitaDetails versao={versoes[0]} />
            </article>
          )}
        </div>
      ) : (
        <div className="receita-versoes">
          {exibidas.map((versao, idx) => {
            const ehLinhaBase = idx === versoes.length - 1;

            return (
              <article key={versao.id} className="receita-versao-card">
                <div className="receita-versao-head">
                  <div className="receita-versao-meta tnum">
                    {ehLinhaBase ? (
                      <>
                        <strong>Receita registrada</strong> · {formatarDataHoraBR(versao.vigenteDesde)}
                      </>
                    ) : (
                      formatarDataHoraBR(versao.vigenteDesde)
                    )}
                    {` · ${versao.alteradoPor ?? "Sistema"}`}
                  </div>
                  <span className="receita-versao-custo tnum">
                    {versao.custoAntes !== null
                      ? `${brl(versao.custoAntes)} → ${brl(versao.custoUn)}`
                      : `${brl(versao.custoUn)}/un`}
                  </span>
                </div>

                {versao.mudancas.length > 0 && (
                  <ul className="receita-diff-list tnum">
                    {versao.mudancas.map((m, i) => (
                      <li key={i} className={classeDiff(m)}>
                        {descreverMudancaReceita(m)}
                      </li>
                    ))}
                  </ul>
                )}

                <SnapshotReceitaDetails versao={versao} abertoPorPadrao={ehLinhaBase} />
              </article>
            );
          })}

          {versoes.length > limiteInicial && (
            <button
              type="button"
              className="btn btn-soft btn-full"
              style={{ minHeight: 44, fontSize: 14 }}
              onClick={() => setMostrarTodas((v) => !v)}
            >
              {mostrarTodas
                ? "Mostrar apenas as 5 mais recentes"
                : `Ver todas (${versoes.length})`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
