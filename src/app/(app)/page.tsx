import Link from "next/link";
import { Suspense } from "react";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { EstadoErro } from "@/components/EstadoErro";
import { BadgeMargem, BarraCusto } from "@/components/IndicadorMargem";
import { exigirUsuario } from "@/lib/auth";
import { brl } from "@/lib/calc";
import { carregarPainel, type ProdutoPainel, type ResumoCanal } from "@/lib/queries";

export const dynamic = "force-dynamic";

function piorCanalDoProduto(item: ProdutoPainel): ResumoCanal | null {
  if (item.canais.length === 0) return null;
  return item.canais.reduce((pior, atual) =>
    atual.margemPct < pior.margemPct ? atual : pior,
  );
}

function dadosEfetivos(item: ProdutoPainel) {
  const piorCanal = piorCanalDoProduto(item);
  return {
    piorCanal,
    preco: piorCanal ? piorCanal.preco : item.resultado.precoVenda,
    margem: piorCanal ? piorCanal.margem : item.resultado.margem,
    margemPct: piorCanal ? piorCanal.margemPct : item.resultado.margemPct,
  };
}

async function ConteudoInicio() {
  let painel;

  try {
    painel = await carregarPainel();
  } catch (err) {
    return (
      <EstadoErro
        titulo="Não foi possível carregar o painel"
        mensagem={err instanceof Error ? err.message : "Erro ao consultar o banco."}
      />
    );
  }

  const ordenados = [...painel.produtos].sort(
    (a, b) => dadosEfetivos(a).margemPct - dadosEfetivos(b).margemPct,
  );
  const foco = ordenados[0] ?? null;
  const focoDados = foco ? dadosEfetivos(foco) : null;
  const pendencias = painel.faltaPreencher;

  return (
    <>
      <section className="hero-card" aria-label="Resumo atual dos produtos">
        <div className="hero-top">
          <span className="hero-kicker">
            {foco ? "Margem mais apertada" : "Painel de custos"}
          </span>
          {focoDados && (
            <span className="hero-pill tnum">{focoDados.margemPct.toFixed(0)}% margem</span>
          )}
        </div>

        {foco && focoDados ? (
          <div>
            <h1 className="hero-focus-title">{foco.produto.nome}</h1>
            {focoDados.piorCanal && (
              <span className="hero-canal-tag">
                Pior margem em {focoDados.piorCanal.nome}
              </span>
            )}
            <p className="hero-focus-sub tnum" style={{ marginTop: 8 }}>
              Custa {brl(foco.resultado.custoUnitario)}/un · vende por {brl(focoDados.preco)} ·{" "}
              sobra {brl(focoDados.margem)}/un
            </p>
            <div style={{ marginTop: 10 }}>
              <Link href={`/produtos/${foco.produto.id}`} className="hero-link">
                Ver receita e preços →
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="hero-focus-title">Nenhum produto ainda</h1>
            <p className="hero-focus-sub">
              Cadastre a primeira receita em Produtos para enxergar custo, margem e lucro líquido.
            </p>
          </div>
        )}

        <div className="hero-grid">
          <div>
            <div className="hero-stat-label">Produtos ativos</div>
            <div className="hero-stat-val tnum">{painel.produtos.length}</div>
          </div>
          <div>
            <div className="hero-stat-label">Hora de trabalho</div>
            <div className="hero-stat-val tnum">
              {painel.custoHora > 0 ? brl(painel.custoHora) : "Zerada"}
            </div>
            <div style={{ marginTop: 4 }}>
              <Link href="/mais" className="hero-link">
                Ajustar em Mais →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {pendencias.length > 0 && (
        <section className="falta-card" aria-label="Falta preencher">
          <div className="section-row">
            <h2 className="section-heading">Falta preencher</h2>
            <span className="badge badge--warn tnum">{pendencias.length}</span>
          </div>
          <p className="section-note" style={{ marginTop: 4 }}>
            Toque em cada item para completar o custo real de gás, forno e taxas.
          </p>
          <div className="falta-list">
            {pendencias.map((item) => (
              <Link key={item.id} href={item.href} className="falta-item">
                <div className="falta-item-main">
                  <span className="falta-item-title">{item.mensagem}</span>
                </div>
                <span className="falta-item-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Link href="/produtos" className="btn btn-mustard btn-full">
        Ver todos os produtos ({painel.produtos.length})
      </Link>

      {ordenados.length > 0 ? (
        <section aria-label="Receitas por margem">
          <div className="section-row" style={{ marginBottom: 10 }}>
            <h2 className="section-heading">Por margem líquida</h2>
            <span className="page-sub" style={{ margin: 0 }}>
              pior canal primeiro
            </span>
          </div>
          <div className="stack-list">
            {ordenados.map((item) => {
              const dados = dadosEfetivos(item);
              const r = item.resultado;
              return (
                <Link
                  key={item.produto.id}
                  href={`/produtos/${item.produto.id}`}
                  className="product-card"
                >
                  <div className="product-card-top">
                    <h3 className="product-name">{r.nome}</h3>
                    <BadgeMargem margemPct={dados.margemPct} />
                  </div>
                  <BarraCusto resultado={r} />
                  <div className="metrics-grid">
                    <div>
                      <div className="metric-label">Custo / un</div>
                      <div className="metric-value tnum">{brl(r.custoUnitario)}</div>
                    </div>
                    <div>
                      <div className="metric-label">
                        {dados.piorCanal ? dados.piorCanal.nome : "Preço"}
                      </div>
                      <div className="metric-value tnum">{brl(dados.preco)}</div>
                    </div>
                    <div>
                      <div className="metric-label">Sobra / un</div>
                      <div className="metric-value tnum">{brl(dados.margem)}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="estado-vazio">
          <h2>Comece cadastrando os insumos e receitas</h2>
          <p>Depois você compara a margem entre Encomenda e Feira em um toque.</p>
          <Link href="/produtos" className="btn btn-soft">
            Ir para Produtos
          </Link>
        </div>
      )}
    </>
  );
}

export default async function PaginaInicio() {
  await exigirUsuario();

  return (
    <Suspense fallback={<CarregandoPainel />}>
      <ConteudoInicio />
    </Suspense>
  );
}
