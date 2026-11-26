"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { criarProduto } from "@/app/actions";
import { brl, formatarMinutos, nivelMargem, type Produto, type ResultadoProduto } from "@/lib/calc";
import { BadgeMargem, BarraCusto } from "./IndicadorMargem";
import { useSalvar } from "./useSalvar";

type Filtro = "todos" | "atencao" | "boas";

export function ListaProdutos({
  produtos,
  resultados,
}: {
  produtos: Produto[];
  resultados: ResultadoProduto[];
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [criado, setCriado] = useState(false);
  const { pendente, erro, salvar } = useSalvar();

  const porId = new Map(produtos.map((p) => [p.id, p]));
  const qtdAtencao = resultados.filter((r) => nivelMargem(r.margemPct) !== "good").length;
  const qtdBoas = resultados.length - qtdAtencao;

  const visiveis = resultados.filter((r) => {
    if (filtro === "atencao") return nivelMargem(r.margemPct) !== "good";
    if (filtro === "boas") return nivelMargem(r.margemPct) === "good";
    return true;
  });

  function aoCriar() {
    setCriado(false);
    salvar(
      () => criarProduto(),
      () => {
        setFiltro("todos");
        setCriado(true);
        router.refresh();
      },
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Produtos</h1>
          <p className="page-sub">Toque em um produto para ver o custo e editar a receita.</p>
        </div>
        <button type="button" className="btn btn-mustard" disabled={pendente} onClick={aoCriar}>
          {pendente ? "Criando..." : "+ Produto"}
        </button>
      </div>

      {criado && (
        <div className="banner-sucesso" role="status">
          <span>Novo produto criado. Role até ele para montar a receita.</span>
        </div>
      )}

      {erro && (
        <div className="banner-erro" role="alert">
          {erro}
        </div>
      )}

      {resultados.length > 0 && (
        <div className="filter-row" role="group" aria-label="Filtrar produtos por margem">
          <button
            type="button"
            className={`filter-pill tnum${filtro === "todos" ? " is-active" : ""}`}
            onClick={() => setFiltro("todos")}
          >
            Todos ({resultados.length})
          </button>
          <button
            type="button"
            className={`filter-pill tnum${filtro === "atencao" ? " is-active" : ""}`}
            onClick={() => setFiltro("atencao")}
          >
            Atenção ({qtdAtencao})
          </button>
          <button
            type="button"
            className={`filter-pill tnum${filtro === "boas" ? " is-active" : ""}`}
            onClick={() => setFiltro("boas")}
          >
            Boas ({qtdBoas})
          </button>
        </div>
      )}

      {resultados.length === 0 ? (
        <div className="estado-vazio">
          <h2>Nenhum produto cadastrado</h2>
          <p>Crie o primeiro produto para montar a receita e calcular o custo por unidade.</p>
          <button type="button" className="btn btn-mustard" disabled={pendente} onClick={aoCriar}>
            + Criar primeiro produto
          </button>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="estado-vazio">
          <h3>Nenhum produto neste filtro</h3>
          <p>Tente voltar para “Todos” para ver o catálogo completo.</p>
        </div>
      ) : (
        <div className="stack-list">
          {visiveis.map((r) => {
            const prod = porId.get(r.produtoId);
            const alertas = prod?.linhas.filter((l) => Boolean(l.alerta)).length ?? 0;

            return (
              <Link
                key={r.produtoId}
                href={`/produtos/${r.produtoId}`}
                className="product-card"
              >
                <div className="product-card-top">
                  <h2 className="product-name">{r.nome}</h2>
                  <BadgeMargem margemPct={r.margemPct} />
                </div>

                <BarraCusto resultado={r} />

                <div className="metrics-grid">
                  <div>
                    <div className="metric-label">Custo / un</div>
                    <div className="metric-value tnum">{brl(r.custoUnitario)}</div>
                    <div className="metric-sub tnum">
                      {r.custoMaoDeObra > 0
                        ? `direto ${brl(r.custoDireto / r.rendimento)}`
                        : `${r.rendimento} un/lote`}
                    </div>
                  </div>
                  <div>
                    <div className="metric-label">Preço atual</div>
                    <div className="metric-value tnum">{brl(r.precoVenda)}</div>
                    <div className="metric-sub tnum">sobra {brl(r.margem)}/un</div>
                  </div>
                  <div>
                    <div className="metric-label tnum">
                      Sugerido ({prod?.markupAlvo.toFixed(1) ?? "3.5"}×)
                    </div>
                    <div className="metric-value tnum">{brl(r.precoSugerido)}</div>
                    <div className="metric-sub tnum">markup {r.markup.toFixed(2)}×</div>
                  </div>
                </div>

                <div className="product-foot">
                  <span>
                    {alertas > 0
                      ? `${alertas} ${alertas === 1 ? "item" : "itens"} para conferir na receita`
                      : r.minutosLote > 0
                        ? `Mão de obra: ${formatarMinutos(r.minutosLote)} por lote`
                        : "Sem tempo de mão de obra definido"}
                  </span>
                  <span>Editar receita &rsaquo;</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
