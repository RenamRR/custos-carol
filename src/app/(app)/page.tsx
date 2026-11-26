import Link from "next/link";
import { Suspense } from "react";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { EstadoErro } from "@/components/EstadoErro";
import { BadgeMargem, BarraCusto } from "@/components/IndicadorMargem";
import { exigirUsuario } from "@/lib/auth";
import { brl } from "@/lib/calc";
import {
  carregarHoje,
  carregarPainel,
  type ProdutoPainel,
  type ResumoCanal,
} from "@/lib/queries";
import { FUSO_VENDAS } from "@/lib/vendas";

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

function nomeMesCapitalizado(ano: number, mes: number): string {
  const txt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(ano, mes - 1, 15, 12, 0, 0)));
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function formatarHoraSP(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_VENDAS,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

async function ConteudoInicio() {
  let painel;
  let hoje;

  try {
    [painel, hoje] = await Promise.all([carregarPainel(), carregarHoje()]);
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

  const resumoCanaisMes = hoje.porCanal
    .filter((c) => c.unidades > 0)
    .map((c) => `${c.unidades} ${c.nome}`)
    .join(" · ");
  const temMovimentoMes = hoje.totais.vendas > 0 || hoje.totais.custoFeiras > 0;

  return (
    <>
      <div className="home-month-bar">
        <span className="page-sub" style={{ margin: 0 }}>
          Resumo do mês
        </span>
        <Link href={`/vendas?mes=${hoje.ano}-${String(hoje.mes).padStart(2, "0")}`} className="month-chip">
          {nomeMesCapitalizado(hoje.ano, hoje.mes)} &rarr;
        </Link>
      </div>

      <section className="hero-card" aria-label="Lucro líquido no mês">
        <div className="hero-top">
          <span className="hero-kicker">Lucro líquido no mês</span>
          <span className="hero-pill tnum">
            {temMovimentoMes ? `Margem ${hoje.totais.margemPct.toFixed(0)}%` : "Sem vendas ainda"}
          </span>
        </div>

        {temMovimentoMes ? (
          <>
            <div className="hero-profit tnum">{brl(hoje.totais.lucro)}</div>
            <div className="hero-grid">
              <div>
                <div className="hero-stat-label">Faturamento</div>
                <div className="hero-stat-val tnum">{brl(hoje.totais.faturamento)}</div>
                <div className="hero-stat-sub">Encomenda + Feira</div>
              </div>
              <div>
                <div className="hero-stat-label">Vendidos no mês</div>
                <div className="hero-stat-val tnum">{hoje.totais.unidades} un</div>
                <div className="hero-stat-sub tnum">
                  {resumoCanaisMes || `${hoje.totais.vendas} vendas`}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div>
            <div className="hero-profit tnum">R$ 0,00</div>
            <p className="hero-focus-sub">
              Registre a primeira venda do mês para acompanhar faturamento, taxas e lucro real.
            </p>
          </div>
        )}

        <div>
          <Link href="/vendas" className="hero-link">
            Ver mês completo e feiras &rarr;
          </Link>
        </div>
      </section>

      <Link href="/vender" className="btn btn-mustard btn-full">
        Registrar venda agora
      </Link>

      <section aria-label="Últimas vendas de hoje">
        <div className="section-row" style={{ marginBottom: 8 }}>
          <h2 className="section-heading">Últimas vendas de hoje</h2>
          <Link href="/vendas" className="alert-link" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)" }}>
            Ver mês &rarr;
          </Link>
        </div>

        {(() => {
          const ativasHoje = hoje.vendas.filter((v) => !v.canceladaEm);
          if (ativasHoje.length === 0) {
            return (
              <div className="card">
                <p className="section-note">Nenhuma venda registrada hoje ainda.</p>
              </div>
            );
          }
          return (
            <div className="recent-list">
              {ativasHoje.map((v) => (
                <div key={v.id} className="recent-row">
                  <div className="recent-row-info">
                    <div className="recent-main tnum">
                      {v.itens.map((i) => `${i.quantidade}× ${i.produtoNome}`).join(" + ")}
                    </div>
                    <div className="recent-meta tnum">
                      {formatarHoraSP(v.vendidaEm)} · {v.canalNome} · {v.formaNome}
                    </div>
                  </div>
                  <div className="recent-val tnum">+{brl(v.resultado.faturamento)}</div>
                </div>
              ))}
            </div>
          );
        })()}
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
                  &rarr;
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {foco && focoDados && (
        <section aria-label="Produto que pede atenção">
          <div className="section-row" style={{ marginBottom: 8 }}>
            <h2 className="section-heading">Pede atenção na margem</h2>
            <Link href="/produtos" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)" }}>
              Ver todos ({painel.produtos.length}) &rarr;
            </Link>
          </div>

          <Link href={`/produtos/${foco.produto.id}`} className="product-card">
            <div className="product-card-top">
              <h3 className="product-name">{foco.produto.nome}</h3>
              <BadgeMargem margemPct={focoDados.margemPct} />
            </div>
            <BarraCusto resultado={foco.resultado} />
            <div className="metrics-grid">
              <div>
                <div className="metric-label">Custo / un</div>
                <div className="metric-value tnum">{brl(foco.resultado.custoUnitario)}</div>
              </div>
              <div>
                <div className="metric-label">
                  {focoDados.piorCanal ? focoDados.piorCanal.nome : "Preço"}
                </div>
                <div className="metric-value tnum">{brl(focoDados.preco)}</div>
              </div>
              <div>
                <div className="metric-label">Sobra / un</div>
                <div className="metric-value tnum">{brl(focoDados.margem)}</div>
              </div>
            </div>
          </Link>
        </section>
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
