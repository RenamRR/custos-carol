import Link from "next/link";
import { Suspense } from "react";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { EstadoErro } from "@/components/EstadoErro";
import { BadgeMargem, BarraCusto } from "@/components/IndicadorMargem";
import { exigirUsuario } from "@/lib/auth";
import { brl, calcularProduto } from "@/lib/calc";
import { carregarCustoHora, carregarInsumos, carregarProdutos } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function ConteudoInicio() {
  let insumos;
  let produtos;
  let custoHora;

  try {
    [insumos, produtos, custoHora] = await Promise.all([
      carregarInsumos(),
      carregarProdutos(),
      carregarCustoHora(),
    ]);
  } catch (err) {
    return (
      <EstadoErro
        titulo="Não foi possível carregar os dados"
        mensagem={err instanceof Error ? err.message : "Erro ao consultar o banco."}
      />
    );
  }

  const resultados = produtos.map((p) => calcularProduto(p, insumos, custoHora));
  const ordenados = [...resultados].sort((a, b) => a.margemPct - b.margemPct);
  const pior = ordenados[0];

  return (
    <>
      <section className="hero-card" aria-label="Resumo atual dos produtos">
        <div className="hero-top">
          <span className="hero-kicker">
            {pior ? "Produto que pede mais atenção" : "Catálogo vazio"}
          </span>
          {pior && (
            <span className="hero-pill tnum">{pior.margemPct.toFixed(0)}% margem</span>
          )}
        </div>

        {pior ? (
          <div>
            <h1 className="hero-focus-title">{pior.nome}</h1>
            <p className="hero-focus-sub tnum">
              Custo {brl(pior.custoUnitario)}/un · Venda {brl(pior.precoVenda)} · Sobra{" "}
              {brl(pior.margem)}/un
            </p>
            <div style={{ marginTop: 8 }}>
              <Link href={`/produtos/${pior.produtoId}`} className="hero-link">
                Abrir receita e ajustar &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="hero-focus-title">Nenhum produto ainda</h1>
            <p className="hero-focus-sub">
              Cadastre seu primeiro brownie para acompanhar custo e margem.
            </p>
          </div>
        )}

        <div className="hero-grid">
          <div>
            <div className="hero-stat-label">Produtos ativos</div>
            <div className="hero-stat-val tnum">{resultados.length}</div>
          </div>
          <div>
            <div className="hero-stat-label">Hora de trabalho</div>
            <div className="hero-stat-val tnum">
              {custoHora > 0 ? `${brl(custoHora)}/h` : "Zerada"}
            </div>
            {custoHora === 0 && (
              <Link href="/mais" className="hero-link">
                Definir em Mais
              </Link>
            )}
          </div>
        </div>
      </section>

      <Link href="/produtos" className="btn btn-mustard btn-full">
        Ver produtos e editar receitas &rarr;
      </Link>

      <div className="section-row">
        <h2 className="section-heading">Margens de hoje</h2>
        <span className="badge badge--cream tnum">{resultados.length} produtos</span>
      </div>

      {ordenados.length === 0 ? (
        <div className="estado-vazio">
          <p>Quando você criar produtos, eles aparecem aqui ordenados da menor para a maior margem.</p>
          <Link href="/produtos" className="btn btn-soft">
            Ir para Produtos
          </Link>
        </div>
      ) : (
        <div className="stack-list">
          {ordenados.map((r, indice) => (
            <Link key={r.produtoId} href={`/produtos/${r.produtoId}`} className="product-card">
              <div className="product-card-top">
                <h3 className="product-name">{r.nome}</h3>
                <BadgeMargem margemPct={r.margemPct} />
              </div>

              <BarraCusto resultado={r} />

              <div className="metrics-grid">
                <div>
                  <div className="metric-label">Custo / un</div>
                  <div className="metric-value tnum">{brl(r.custoUnitario)}</div>
                </div>
                <div>
                  <div className="metric-label">Preço</div>
                  <div className="metric-value tnum">{brl(r.precoVenda)}</div>
                </div>
                <div>
                  <div className="metric-label">Sobra / un</div>
                  <div className="metric-value tnum">{brl(r.margem)}</div>
                </div>
              </div>

              <div className="product-foot">
                <span>
                  {indice === 0 && ordenados.length > 1
                    ? "Menor margem entre os produtos"
                    : r.custoMaoDeObra === 0
                      ? "Sem mão de obra no custo"
                      : `Mão de obra ${brl(r.custoMaoDeObra / r.rendimento)}/un`}
                </span>
                <span>Detalhes &rsaquo;</span>
              </div>
            </Link>
          ))}
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
