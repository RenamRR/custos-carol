"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  criarEmbalagemProduto,
  criarLinha,
  duplicarProduto,
  limparAlerta,
  removerEmbalagemProduto,
  removerLinha,
  removerProduto,
  salvarCustoProduto,
  salvarEmbalagemProduto,
  salvarLinha,
  salvarPrecoProduto,
  salvarProduto,
} from "@/app/actions";
import {
  brl,
  brl4,
  calcularProduto,
  custoPorUnidadeDeMedida,
  formatarMinutos,
  parseNumeroBR,
  resumoCanais,
  type Insumo,
  type LinhaEmbalagem,
  type LinhaReceita,
} from "@/lib/calc";
import type { Canal, Config, Forno, ProdutoCompleto } from "@/lib/custo-completo";
import type { HistoricoProduto } from "@/lib/linha-do-tempo";
import { BadgeMargem, BarraCusto } from "./IndicadorMargem";
import { CartaoPrecoCanal } from "./CartaoPrecoCanal";
import { HistoricoProdutoSection } from "./HistoricoProdutoSection";
import { desfocarNoEnter, paraCampo, paraPreco, useSalvar } from "./useSalvar";

function CardLinhaIngrediente({
  linha,
  ingredientes,
  porId,
}: {
  linha: LinhaReceita;
  ingredientes: Insumo[];
  porId: Map<number, Insumo>;
}) {
  const router = useRouter();
  const { pendente, erro, salvar } = useSalvar();
  const [insumoId, setInsumoId] = useState(linha.insumoId);
  const [qtd, setQtd] = useState(paraCampo(linha.qtd, 4));

  useEffect(() => {
    setInsumoId(linha.insumoId);
    setQtd(paraCampo(linha.qtd, 4));
  }, [linha]);

  const insumo = porId.get(insumoId);
  const custoUnit = insumo ? custoPorUnidadeDeMedida(insumo) : 0;
  const custoLinha = custoUnit * parseNumeroBR(qtd);

  return (
    <div className={`line-card${pendente ? " salvando" : ""}`}>
      <div className="line-card-top">
        <select
          className="field-select"
          value={insumoId}
          aria-label="Ingrediente da receita"
          onChange={(e) => {
            const novo = Number(e.target.value);
            setInsumoId(novo);
            salvar(() => salvarLinha(linha.id, { insumoId: novo, qtd }), () => router.refresh());
          }}
        >
          {ingredientes.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nome}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="icon-btn"
          title="Remover ingrediente da receita"
          aria-label="Remover ingrediente da receita"
          disabled={pendente}
          onClick={() => salvar(() => removerLinha(linha.id), () => router.refresh())}
        >
          &times;
        </button>
      </div>

      <div className="line-card-bottom">
        <div className="field-group">
          <label className="field-label" htmlFor={`ing-qtd-${linha.id}`}>
            Qtd no lote
          </label>
          <div className="field-with-suffix">
            <input
              id={`ing-qtd-${linha.id}`}
              className="field-input field-input--num"
              inputMode="decimal"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              onKeyDown={desfocarNoEnter}
              onBlur={() => {
                setQtd(paraCampo(parseNumeroBR(qtd), 4));
                salvar(() => salvarLinha(linha.id, { insumoId, qtd }), () => router.refresh());
              }}
            />
            <span className="field-suffix">{insumo?.unidade ?? "—"}</span>
          </div>
        </div>

        <div className="line-cost-readout">
          <strong className="tnum">{brl(custoLinha)}</strong>
          <span className="tnum">
            {insumo ? `${brl4(custoUnit)}/${insumo.unidade}` : "—"}
          </span>
        </div>
      </div>

      {linha.alerta && (
        <div className="alerta-linha">
          <span>{linha.alerta}</span>
          <button
            type="button"
            className="btn btn-outline"
            style={{ minHeight: 40, fontSize: 13 }}
            disabled={pendente}
            onClick={() => salvar(() => limparAlerta(linha.id), () => router.refresh())}
          >
            Marcar como conferido
          </button>
        </div>
      )}

      {erro && (
        <div className="banner-erro" role="alert">
          {erro}
        </div>
      )}
    </div>
  );
}

function CardLinhaEmbalagem({
  linha,
  materiais,
  porId,
  rendimento,
}: {
  linha: LinhaEmbalagem;
  materiais: Insumo[];
  porId: Map<number, Insumo>;
  rendimento: number;
}) {
  const router = useRouter();
  const { pendente, erro, salvar } = useSalvar();
  const [insumoId, setInsumoId] = useState(linha.insumoId);
  const [qtd, setQtd] = useState(paraCampo(linha.qtdPorUnidade, 4));

  useEffect(() => {
    setInsumoId(linha.insumoId);
    setQtd(paraCampo(linha.qtdPorUnidade, 4));
  }, [linha]);

  const material = porId.get(insumoId);
  const custoUnit = material ? custoPorUnidadeDeMedida(material) : 0;
  const porUnidade = custoUnit * parseNumeroBR(qtd);

  return (
    <div className={`line-card${pendente ? " salvando" : ""}`}>
      <div className="line-card-top">
        <select
          className="field-select"
          value={insumoId}
          aria-label="Material de embalagem"
          onChange={(e) => {
            const novo = Number(e.target.value);
            setInsumoId(novo);
            salvar(
              () => salvarEmbalagemProduto(linha.id, { insumoId: novo, qtdPorUnidade: qtd }),
              () => router.refresh(),
            );
          }}
        >
          {materiais.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="icon-btn"
          title="Remover embalagem da receita"
          aria-label="Remover embalagem da receita"
          disabled={pendente}
          onClick={() => salvar(() => removerEmbalagemProduto(linha.id), () => router.refresh())}
        >
          &times;
        </button>
      </div>

      <div className="line-card-bottom">
        <div className="field-group">
          <label className="field-label" htmlFor={`emb-qtd-${linha.id}`}>
            Qtd por unidade
          </label>
          <div className="field-with-suffix">
            <input
              id={`emb-qtd-${linha.id}`}
              className="field-input field-input--num"
              inputMode="decimal"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              onKeyDown={desfocarNoEnter}
              onBlur={() => {
                setQtd(paraCampo(parseNumeroBR(qtd), 4));
                salvar(
                  () => salvarEmbalagemProduto(linha.id, { insumoId, qtdPorUnidade: qtd }),
                  () => router.refresh(),
                );
              }}
            />
            <span className="field-suffix">{material?.unidade ?? "—"}</span>
          </div>
        </div>

        <div className="line-cost-readout">
          <strong className="tnum">{brl4(porUnidade)}/un</strong>
          <span className="tnum">No lote: {brl(porUnidade * rendimento)}</span>
        </div>
      </div>

      {erro && (
        <div className="banner-erro" role="alert">
          {erro}
        </div>
      )}
    </div>
  );
}

export function DetalheProduto({
  produto,
  insumos,
  custoHora,
  forno,
  canais,
  config,
  historico,
}: {
  produto: ProdutoCompleto;
  insumos: Insumo[];
  custoHora: number;
  forno: Forno;
  canais: Canal[];
  config: Config;
  historico: HistoricoProduto | null;
}) {
  const router = useRouter();
  const dadosSave = useSalvar();
  const custoFornoSave = useSalvar();
  const linhaAddSave = useSalvar();
  const embAddSave = useSalvar();

  const [menuAberto, setMenuAberto] = useState(false);
  const [confirmarRemover, setConfirmarRemover] = useState(false);
  const [duplicado, setDuplicado] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [nome, setNome] = useState(produto.nome);
  const [rendimento, setRendimento] = useState(paraCampo(produto.rendimento, 4));
  const [precoVenda, setPrecoVenda] = useState(paraPreco(produto.precoVenda));
  const [minutosPreparo, setMinutosPreparo] = useState(paraCampo(produto.minutosPreparo, 2));
  const [minutosAcabamentoUn, setMinutosAcabamentoUn] = useState(
    paraCampo(produto.minutosAcabamentoUn, 2),
  );
  const [minutosForno, setMinutosForno] = useState(paraCampo(produto.minutosForno, 2));
  const [perdaPct, setPerdaPct] = useState(paraCampo(produto.perdaPct, 2));
  const [semForno, setSemForno] = useState(Boolean(produto.semForno));

  useEffect(() => {
    setNome(produto.nome);
    setRendimento(paraCampo(produto.rendimento, 4));
    setPrecoVenda(paraPreco(produto.precoVenda));
    setMinutosPreparo(paraCampo(produto.minutosPreparo, 2));
    setMinutosAcabamentoUn(paraCampo(produto.minutosAcabamentoUn, 2));
    setMinutosForno(paraCampo(produto.minutosForno, 2));
    setPerdaPct(paraCampo(produto.perdaPct, 2));
    setSemForno(Boolean(produto.semForno));
  }, [produto]);

  useEffect(() => {
    if (!menuAberto) return;
    function fecharFora(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuAberto(false);
    }
    function fecharEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuAberto(false);
    }
    document.addEventListener("mousedown", fecharFora);
    document.addEventListener("keydown", fecharEsc);
    return () => {
      document.removeEventListener("mousedown", fecharFora);
      document.removeEventListener("keydown", fecharEsc);
    };
  }, [menuAberto]);

  const ingredientes = insumos.filter((i) => i.tipo === "ingrediente");
  const materiais = insumos.filter((i) => i.tipo === "embalagem");
  const porId = new Map(insumos.map((i) => [i.id, i]));

  const perdaNum = Math.min(89.99, Math.max(0, parseNumeroBR(perdaPct)));
  const minutosFornoNum = semForno ? 0 : Math.max(0, parseNumeroBR(minutosForno));

  const produtoAoVivo: ProdutoCompleto = {
    ...produto,
    nome,
    rendimento: parseNumeroBR(rendimento) || produto.rendimento,
    precoVenda: parseNumeroBR(precoVenda),
    minutosPreparo: parseNumeroBR(minutosPreparo),
    minutosAcabamentoUn: parseNumeroBR(minutosAcabamentoUn),
    minutosForno: Math.max(0, parseNumeroBR(minutosForno)),
    perdaPct: perdaNum,
    semForno,
  };

  const r = calcularProduto(produtoAoVivo, insumos, custoHora, forno.custoMinuto);
  const canaisResumo = resumoCanais(produtoAoVivo, r.custoUnitario, canais, config.impostoPct);
  const canaisPorId = new Map(canais.map((c) => [c.id, c]));

  const somaSegmentos = (tipo: string) =>
    r.segmentos.filter((s) => s.tipo === tipo).reduce((acc, s) => acc + s.valor, 0);

  const categorias = [
    {
      chave: "ingredientes",
      nome: "Ingredientes",
      nota: `${produto.linhas.length} ${produto.linhas.length === 1 ? "item" : "itens"} na receita`,
      valor: somaSegmentos("ingrediente"),
      cor: "var(--r1)",
    },
    {
      chave: "embalagem",
      nome: "Embalagem",
      nota: `${produto.embalagens.length} ${produto.embalagens.length === 1 ? "material" : "materiais"} por unidade`,
      valor: r.custoEmbalagem,
      cor: "var(--r-pack)",
    },
    {
      chave: "mao-de-obra",
      nome: "Mão de obra",
      nota:
        r.minutosLote > 0
          ? `${formatarMinutos(r.minutosLote)} no lote · ${custoHora > 0 ? `${brl(custoHora)}/h` : "hora zerada"}`
          : "Sem tempo lançado",
      valor: somaSegmentos("mao-de-obra"),
      cor: "var(--r-labor)",
    },
    ...(r.custoForno > 0
      ? [
          {
            chave: "forno",
            nome: "Forno",
            nota: `${formatarMinutos(minutosFornoNum)} no lote · ${brl(forno.custoHora)}/h`,
            valor: somaSegmentos("forno"),
            cor: "var(--r-oven)",
          },
        ]
      : []),
    ...(r.custoPerda > 0
      ? [
          {
            chave: "perda",
            nome: "Perda",
            nota: `${paraCampo(perdaNum, 2)}% do lote perdido`,
            valor: r.custoPerda,
            cor: "var(--r-loss)",
          },
        ]
      : []),
  ].sort((a, b) => b.valor - a.valor);

  function salvarFornoEPerda(semFornoDestino = semForno) {
    custoFornoSave.limparErro();
    const minStr = minutosForno.trim();
    const perdaStr = perdaPct.trim();
    const minFmt = paraCampo(Math.max(0, parseNumeroBR(minStr)), 2);
    const perdaFmt = paraCampo(Math.max(0, parseNumeroBR(perdaStr)), 2);
    setMinutosForno(minFmt);
    setPerdaPct(perdaFmt);
    // Se o salvar falhar, o toggle volta ao valor gravado (semForno desta renderização).
    const anterior = semForno;
    const desfazer = () => { if (semFornoDestino !== anterior) setSemForno(anterior); };
    custoFornoSave.salvar(
      async () => {
        try {
          const r = await salvarCustoProduto(produto.id, {
            minutosForno: minStr || "0",
            perdaPct: perdaStr || "0",
            semForno: semFornoDestino,
          });
          if (!r?.ok) desfazer();
          return r;
        } catch (e) {
          desfazer();
          throw e;
        }
      },
      () => router.refresh(),
    );
  }

  function alternarSemForno() {
    const proximo = !semForno;
    setSemForno(proximo);
    salvarFornoEPerda(proximo);
  }

  function salvarDadosProduto() {
    dadosSave.limparErro();
    dadosSave.salvar(
      () =>
        salvarProduto(produto.id, {
          nome,
          rendimento,
          minutosPreparo,
          minutosAcabamentoUn,
        }),
      () => router.refresh(),
    );
  }

  return (
    <>
      <div className="detail-topbar">
        <Link href="/produtos" className="btn btn-soft">
          &lsaquo; Produtos
        </Link>

        <div className="menu-box" ref={menuRef}>
          <button
            type="button"
            className="btn btn-outline"
            aria-haspopup="menu"
            aria-expanded={menuAberto}
            disabled={dadosSave.pendente}
            onClick={() => setMenuAberto((v) => !v)}
          >
            ⋮ Ações
          </button>

          {menuAberto && (
            <div className="menu-list" role="menu">
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setMenuAberto(false);
                  setDuplicado(false);
                  dadosSave.salvar(
                    () => duplicarProduto(produto.id),
                    () => {
                      setDuplicado(true);
                      router.refresh();
                    },
                  );
                }}
              >
                Duplicar receita
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu-item menu-item--danger"
                onClick={() => {
                  setMenuAberto(false);
                  setConfirmarRemover(true);
                }}
              >
                Remover receita
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmarRemover && (
        <div className="confirm-box" role="alertdialog" aria-label={`Confirmar remoção de ${produto.nome}`}>
          <p>Remover “{produto.nome}”? A receita inteira e seus itens serão apagados.</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setConfirmarRemover(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger-solid"
              disabled={dadosSave.pendente}
              onClick={() =>
                dadosSave.salvar(
                  () => removerProduto(produto.id),
                  () => {
                    router.push("/produtos");
                    router.refresh();
                  },
                )
              }
            >
              {dadosSave.pendente ? "Removendo..." : "Sim, remover"}
            </button>
          </div>
        </div>
      )}

      {duplicado && (
        <div className="banner-sucesso" role="status">
          <span>Receita duplicada com sucesso!</span>
          <Link href="/produtos" style={{ color: "inherit", fontWeight: 800 }}>
            Ver na lista &rarr;
          </Link>
        </div>
      )}

      {dadosSave.erro && (
        <div className="banner-erro" role="alert">
          {dadosSave.erro}
        </div>
      )}

      <div>
        <h1 className="page-title">{nome || produto.nome}</h1>
        <p className="page-sub tnum">
          Rende {paraCampo(r.rendimento, 2)} unidades
          {perdaNum > 0 ? ` (${paraCampo(r.unidadesBoas, 2)} boas)` : ""} por lote
          {r.minutosLote > 0 ? ` · ${formatarMinutos(r.minutosLote)} de mão de obra` : ""}
          {minutosFornoNum > 0 ? ` · ${formatarMinutos(minutosFornoNum)} de forno` : ""}
        </p>
      </div>

      <div className="kpi-duo">
        <div className="kpi-box">
          <div className="metric-label">Custo por unidade</div>
          <div className="kpi-num tnum">{brl(r.custoUnitario)}</div>
          <div className="metric-sub tnum">Lote: {brl(r.custoTotal)}</div>
        </div>
        <div className="kpi-box">
          <div className="metric-label">Margem atual</div>
          <div className="kpi-num tnum">{r.margemPct.toFixed(0)}%</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <BadgeMargem margemPct={r.margemPct} />
          </div>
        </div>
      </div>

      <section className="card" aria-label="De onde vem o custo">
        <div className="section-row" style={{ marginBottom: 10 }}>
          <h2 className="section-heading">De onde vem o custo</h2>
        </div>

        <BarraCusto resultado={r} />

        <div className="cost-rows" style={{ marginTop: 12 }}>
          {categorias.map((cat) => {
            const pct = r.custoTotal > 0 ? (cat.valor / r.custoTotal) * 100 : 0;
            return (
              <div key={cat.chave} className="cost-row">
                <div className="cost-row-left">
                  <span className="cost-swatch" style={{ background: cat.cor }} />
                  <div>
                    <span className="cost-name">{cat.nome}</span>
                    <span className="cost-note tnum">{cat.nota}</span>
                  </div>
                </div>
                <div className="cost-row-right">
                  <span className="cost-val tnum">{brl(cat.valor / r.unidadesBoas)}/un</span>
                  <span className="cost-pct tnum">
                    {pct.toFixed(0)}% · {brl(cat.valor)} lote
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {canaisResumo.length > 0 && (
        <section className="card" aria-label="Preço por canal">
          <div className="section-row" style={{ marginBottom: 6 }}>
            <h2 className="section-heading">Preço por canal</h2>
          </div>
          <p className="section-note" style={{ marginBottom: 12 }}>
            Margem líquida considerando a pior taxa aceita
            {config.impostoPct > 0 ? ` e ${paraCampo(config.impostoPct, 4)}% de imposto` : ""}.
          </p>

          <div className="canal-preco-list">
            {canaisResumo.map((canalResumo) => {
              const canalCfg = canaisPorId.get(canalResumo.canalId);
              return (
                <CartaoPrecoCanal
                  key={canalResumo.canalId}
                  produtoId={produto.id}
                  canal={canalResumo}
                  custoUnitario={r.custoUnitario}
                  margemAlvoPct={canalCfg?.margemAlvoPct ?? 50}
                  impostoPct={config.impostoPct}
                />
              );
            })}
          </div>
        </section>
      )}

      <HistoricoProdutoSection historico={historico} />

      <section className={`card${dadosSave.pendente ? " salvando" : ""}`} aria-label="Dados básicos do produto">
        <h2 className="section-heading" style={{ marginBottom: 12 }}>
          Dados do produto
        </h2>
        <div className="form-grid-2">
          <div className="field-group form-span-2">
            <label className="field-label" htmlFor="prod-nome">
              Nome do produto
            </label>
            <input
              id="prod-nome"
              className="field-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={desfocarNoEnter}
              onBlur={salvarDadosProduto}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="prod-preco">
              Preço geral (R$)
            </label>
            <input
              id="prod-preco"
              className="field-input field-input--num"
              inputMode="decimal"
              value={precoVenda}
              onChange={(e) => setPrecoVenda(e.target.value)}
              onKeyDown={desfocarNoEnter}
              onBlur={() => {
                setPrecoVenda(paraPreco(parseNumeroBR(precoVenda)));
                dadosSave.salvar(
                  () => salvarPrecoProduto(produto.id, precoVenda),
                  () => router.refresh(),
                );
              }}
            />
            <span className="field-hint">Vale nos canais sem preço próprio</span>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="prod-rend">
              Rendimento (un)
            </label>
            <input
              id="prod-rend"
              className="field-input field-input--num"
              inputMode="decimal"
              value={rendimento}
              onChange={(e) => setRendimento(e.target.value)}
              onKeyDown={desfocarNoEnter}
              onBlur={() => {
                setRendimento(paraCampo(parseNumeroBR(rendimento), 4));
                salvarDadosProduto();
              }}
            />
          </div>

          <div className="field-group form-span-2">
            <div className="section-row">
              <span className="field-label">Sobra por unidade</span>
              <strong className="tnum" style={{ fontSize: 18 }}>
                {brl(r.margem)}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section className="card" aria-label="Ingredientes da receita">
        <div className="section-row" style={{ marginBottom: 10 }}>
          <div>
            <h2 className="section-heading">Ingredientes</h2>
            <p className="page-sub">Quantidades para o lote inteiro ({paraCampo(r.rendimento, 2)} un)</p>
          </div>
          <strong className="tnum">{brl(r.custoInsumos)}</strong>
        </div>

        <div className="stack-list">
          {produto.linhas.length === 0 ? (
            <div className="estado-vazio" style={{ padding: 16 }}>
              <p>Nenhum ingrediente ainda nesta receita.</p>
            </div>
          ) : (
            produto.linhas.map((l) => (
              <CardLinhaIngrediente
                key={l.id}
                linha={l}
                ingredientes={ingredientes}
                porId={porId}
              />
            ))
          )}

          {linhaAddSave.erro && (
            <div className="banner-erro" role="alert">
              {linhaAddSave.erro}
            </div>
          )}

          <button
            type="button"
            className="btn btn-soft btn-full"
            disabled={linhaAddSave.pendente}
            onClick={() => linhaAddSave.salvar(() => criarLinha(produto.id), () => router.refresh())}
          >
            {linhaAddSave.pendente ? "Adicionando..." : "+ Adicionar ingrediente"}
          </button>
        </div>
      </section>

      <section className="card" aria-label="Embalagens da receita">
        <div className="section-row" style={{ marginBottom: 10 }}>
          <div>
            <h2 className="section-heading">Embalagem</h2>
            <p className="page-sub">Por unidade produzida — só entra o que está aqui</p>
          </div>
          <strong className="tnum">{brl(r.custoEmbalagem)}</strong>
        </div>

        <div className="stack-list">
          {produto.embalagens.length === 0 ? (
            <div className="estado-vazio" style={{ padding: 16 }}>
              <p>Sem embalagem. Este produto não soma custo de embalagem.</p>
            </div>
          ) : (
            produto.embalagens.map((e) => (
              <CardLinhaEmbalagem
                key={e.id}
                linha={e}
                materiais={materiais}
                porId={porId}
                rendimento={r.unidadesBoas}
              />
            ))
          )}

          {embAddSave.erro && (
            <div className="banner-erro" role="alert">
              {embAddSave.erro}
            </div>
          )}

          <button
            type="button"
            className="btn btn-soft btn-full"
            disabled={embAddSave.pendente}
            onClick={() =>
              embAddSave.salvar(() => criarEmbalagemProduto(produto.id), () => router.refresh())
            }
          >
            {embAddSave.pendente ? "Adicionando..." : "+ Adicionar embalagem"}
          </button>
        </div>
      </section>

      <section
        id="forno"
        className={`card${custoFornoSave.pendente ? " salvando" : ""}`}
        aria-label="Forno e perda do lote"
      >
        <div className="section-row" style={{ marginBottom: 10 }}>
          <div>
            <h2 className="section-heading">Forno e perda</h2>
            <p className="page-sub">Tempo de forno e quebra esperada do lote</p>
          </div>
          <strong className="tnum">{brl(r.custoForno)}</strong>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={semForno}
          className="toggle-forno-row"
          style={{ width: "100%", textAlign: "left" }}
          disabled={custoFornoSave.pendente}
          onClick={alternarSemForno}
        >
          <span className="toggle-forno-info">
            <strong>Não vai ao forno</strong>
            <span>Zera o custo de forno e tira a pendência de tempo de forno</span>
          </span>
          <span className={`toggle-switch${semForno ? " is-on" : ""}`} aria-hidden="true" />
        </button>

        <div className="form-grid-2">
          <div className="field-group">
            <label className="field-label" htmlFor="prod-forno">
              Forno (min/lote)
            </label>
            <input
              id="prod-forno"
              className="field-input field-input--num"
              inputMode="decimal"
              disabled={semForno}
              value={minutosForno}
              onChange={(e) => setMinutosForno(e.target.value)}
              onKeyDown={desfocarNoEnter}
              onBlur={() => salvarFornoEPerda()}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="prod-perda">
              Perda (%)
            </label>
            <div className="field-with-suffix">
              <input
                id="prod-perda"
                className="field-input field-input--num"
                inputMode="decimal"
                value={perdaPct}
                onChange={(e) => setPerdaPct(e.target.value)}
                onKeyDown={desfocarNoEnter}
                onBlur={() => salvarFornoEPerda()}
              />
              <span className="field-suffix">%</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {!semForno && minutosFornoNum > 0 && !forno.informado ? (
            <div className="banner-aviso">
              O gás do forno não foi informado ainda.{" "}
              <Link href="/mais#forno" style={{ color: "inherit", fontWeight: 800 }}>
                Defina em Mais &rarr;
              </Link>
            </div>
          ) : (
            <p className="page-sub" style={{ margin: 0 }}>
              Rendendo <b className="tnum">{paraCampo(r.unidadesBoas, 2)}</b> unidades boas
              {r.custoPerda > 0 ? (
                <>
                  {" "}
                  · perda de <b className="tnum">{brl(r.custoPerda)}</b> no lote (
                  <b className="tnum">{brl(r.custoPerdaPorUnidade)}/un</b>)
                </>
              ) : (
                "."
              )}
            </p>
          )}
        </div>

        {custoFornoSave.erro && (
          <div className="banner-erro" role="alert" style={{ marginTop: 10 }}>
            {custoFornoSave.erro}
          </div>
        )}
      </section>

      <section className={`card${dadosSave.pendente ? " salvando" : ""}`} aria-label="Tempos de mão de obra">
        <div className="section-row" style={{ marginBottom: 10 }}>
          <div>
            <h2 className="section-heading">Mão de obra</h2>
            <p className="page-sub">Preparo é do lote; acabamento cresce com a quantidade</p>
          </div>
          <strong className="tnum">{brl(r.custoMaoDeObra)}</strong>
        </div>

        <div className="form-grid-2">
          <div className="field-group">
            <label className="field-label" htmlFor="prod-prep">
              Preparo (min/lote)
            </label>
            <input
              id="prod-prep"
              className="field-input field-input--num"
              inputMode="decimal"
              value={minutosPreparo}
              onChange={(e) => setMinutosPreparo(e.target.value)}
              onKeyDown={desfocarNoEnter}
              onBlur={() => {
                setMinutosPreparo(paraCampo(parseNumeroBR(minutosPreparo), 2));
                salvarDadosProduto();
              }}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="prod-acab">
              Acabamento (min/un)
            </label>
            <input
              id="prod-acab"
              className="field-input field-input--num"
              inputMode="decimal"
              value={minutosAcabamentoUn}
              onChange={(e) => setMinutosAcabamentoUn(e.target.value)}
              onKeyDown={desfocarNoEnter}
              onBlur={() => {
                setMinutosAcabamentoUn(paraCampo(parseNumeroBR(minutosAcabamentoUn), 2));
                salvarDadosProduto();
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {custoHora === 0 ? (
            <div className="banner-aviso">
              O valor da hora está zerado.{" "}
              <Link href="/mais#mao-de-obra" style={{ color: "inherit", fontWeight: 800 }}>
                Defina em Mais &rarr;
              </Link>
            </div>
          ) : (
            <p className="page-sub" style={{ margin: 0 }}>
              Total no lote: <b className="tnum">{formatarMinutos(r.minutosLote)}</b> ·{" "}
              <b className="tnum">{brl(r.custoMaoDeObra / r.unidadesBoas)}</b> por unidade.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
