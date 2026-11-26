"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { criarProduto } from "@/app/actions";
import { brl, formatarMinutos, nivelMargem } from "@/lib/calc";
import type { ProdutoPainel, ResumoCanal } from "@/lib/custo-completo";
import { BadgeMargem, BarraCusto } from "./IndicadorMargem";
import { useSalvar } from "./useSalvar";

type Filtro = "todos" | "atencao" | "boas";

function piorCanal(item: ProdutoPainel): ResumoCanal | null {
  if (item.canais.length === 0) return null;
  return item.canais.reduce((pior, atual) =>
    atual.margemPct < pior.margemPct ? atual : pior,
  );
}

function margemReferencia(item: ProdutoPainel): number {
  const canal = piorCanal(item);
  return canal ? canal.margemPct : item.resultado.margemPct;
}

export function ListaProdutos({
  itens,
}: {
  itens: ProdutoPainel[];
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [criado, setCriado] = useState(false);
  const { pendente, erro, salvar } = useSalvar();

  const qtdAtencao = itens.filter((item) => nivelMargem(margemReferencia(item)) !== "good").length;
  const qtdBoas = itens.length - qtdAtencao;

  const visiveis = itens.filter((item) => {
    const nivel = nivelMargem(margemReferencia(item));
    if (filtro === "atencao") return nivel !== "good";
    if (filtro === "boas") return nivel === "good";
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

      {itens.length > 0 && (
        <div className="filter-row" role="group" aria-label="Filtrar produtos por margem">
          <button
            type="button"
            className={`filter-pill tnum${filtro === "todos" ? " is-active" : ""}`}
            onClick={() => setFiltro("todos")}
          >
            Todos ({itens.length})
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

      {itens.length === 0 ? (
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
          {visiveis.map((item) => {
            const { produto: prod, resultado: r, canais } = item;
            const margemRef = margemReferencia(item);
            const alertas = prod.linhas.filter((l) => Boolean(l.alerta)).length;

            return (
              <Link
                key={r.produtoId}
                href={`/produtos/${r.produtoId}`}
                className="product-card"
              >
                <div className="product-card-top">
                  <h2 className="product-name">{r.nome}</h2>
                  <BadgeMargem margemPct={margemRef} />
                </div>

                <BarraCusto resultado={r} />

                <div className="metrics-grid">
                  <div>
                    <div className="metric-label">Custo / un</div>
                    <div className="metric-value tnum">{brl(r.custoUnitario)}</div>
                    <div className="metric-sub tnum">
                      {r.custoMaoDeObra > 0
                        ? `direto ${brl(r.custoDireto / r.unidadesBoas)}`
                        : `${r.rendimento} un/lote`}
                    </div>
                  </div>
                  <div>
                    <div className="metric-label">Preço geral</div>
                    <div className="metric-value tnum">{brl(r.precoVenda)}</div>
                    <div className="metric-sub tnum">
                      {prod.perdaPct > 0
                        ? `${r.unidadesBoas.toFixed(1).replace(".", ",")} un boas`
                        : `sobra ${brl(r.margem)}/un`}
                    </div>
                  </div>
                </div>

                {canais.length > 0 && (
                  <div className="produto-canais">
                    {canais.map((canal) => (
                      <div key={canal.canalId} className="produto-canal-col">
                        <div className="produto-canal-head">
                          <span className="produto-canal-nome">{canal.nome}</span>
                          <span className={`badge badge--${canal.nivel} tnum`}>
                            {canal.margemPct.toFixed(0)}%
                          </span>
                        </div>
                        <span className="produto-canal-preco tnum">{brl(canal.preco)}</span>
                        <span className="produto-canal-sub">
                          {canal.precoHerdado ? "igual ao geral" : `sobra ${brl(canal.margem)}/un`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="product-foot">
                  <span>
                    {alertas > 0
                      ? `${alertas} ${alertas === 1 ? "item" : "itens"} para conferir na receita`
                      : r.minutosLote > 0 || prod.minutosForno > 0
                        ? `Trabalho ${formatarMinutos(r.minutosLote)}${prod.minutosForno > 0 ? ` · forno ${formatarMinutos(prod.minutosForno)}` : ""}`
                        : "Sem tempo de mão de obra ou forno"}
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
