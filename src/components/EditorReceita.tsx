"use client";

import { useEffect, useState } from "react";
import {
  criarEmbalagemProduto,
  criarLinha,
  limparAlerta,
  removerEmbalagemProduto,
  removerLinha,
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
  type Insumo,
  type LinhaEmbalagem,
  type LinhaReceita,
  type Produto,
} from "@/lib/calc";
import { MenuProduto } from "./MenuProduto";
import { paraCampo, useSalvar } from "./useSalvar";

function LinhaIngrediente({
  linha,
  ingredientes,
  porId,
}: {
  linha: LinhaReceita;
  ingredientes: Insumo[];
  porId: Map<number, Insumo>;
}) {
  const { pendente, erro, salvar } = useSalvar();
  const [insumoId, setInsumoId] = useState(linha.insumoId);
  const [qtd, setQtd] = useState(paraCampo(linha.qtd, 4));

  useEffect(() => {
    setInsumoId(linha.insumoId);
    setQtd(paraCampo(linha.qtd, 4));
  }, [linha]);

  const insumo = porId.get(insumoId);
  const custoUnit = insumo ? custoPorUnidadeDeMedida(insumo) : 0;

  return (
    <tr className={pendente ? "salvando" : undefined}>
      <td>
        <select
          value={insumoId}
          aria-label="Insumo"
          onChange={(e) => {
            const novo = Number(e.target.value);
            setInsumoId(novo);
            salvar(() => salvarLinha(linha.id, { insumoId: novo, qtd }));
          }}
        >
          {ingredientes.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nome}
            </option>
          ))}
        </select>
        {linha.alerta && (
          <button
            type="button"
            className="flag flag--acao"
            title={`${linha.alerta} — clique para marcar como resolvido`}
            onClick={() => salvar(() => limparAlerta(linha.id))}
          >
            conferir ✕
          </button>
        )}
        {erro && <span className="erro">{erro}</span>}
      </td>
      <td className="num">
        <input
          className="campo-num"
          inputMode="decimal"
          value={qtd}
          aria-label="Quantidade na receita"
          onChange={(e) => setQtd(e.target.value)}
          onBlur={() => {
            setQtd(paraCampo(parseNumeroBR(qtd), 4));
            salvar(() => salvarLinha(linha.id, { insumoId, qtd }));
          }}
        />
      </td>
      <td>{insumo?.unidade ?? "—"}</td>
      <td className="num">{insumo ? brl4(custoUnit) : "—"}</td>
      <td className="num strong">{brl(custoUnit * parseNumeroBR(qtd))}</td>
      <td className="row-actions">
        <button
          type="button"
          className="icon-btn"
          title="Remover linha"
          aria-label="Remover ingrediente da receita"
          onClick={() => salvar(() => removerLinha(linha.id))}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function LinhaEmbalagemProduto({
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
    <tr className={pendente ? "salvando" : undefined}>
      <td>
        <select
          value={insumoId}
          aria-label="Material de embalagem"
          onChange={(e) => {
            const novo = Number(e.target.value);
            setInsumoId(novo);
            salvar(() =>
              salvarEmbalagemProduto(linha.id, { insumoId: novo, qtdPorUnidade: qtd }),
            );
          }}
        >
          {materiais.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nome}
            </option>
          ))}
        </select>
        {erro && <span className="erro">{erro}</span>}
      </td>
      <td className="num">
        <input
          className="campo-num"
          inputMode="decimal"
          value={qtd}
          aria-label="Quantidade por unidade produzida"
          onChange={(e) => setQtd(e.target.value)}
          onBlur={() => {
            setQtd(paraCampo(parseNumeroBR(qtd), 4));
            salvar(() => salvarEmbalagemProduto(linha.id, { insumoId, qtdPorUnidade: qtd }));
          }}
        />
      </td>
      <td>{material?.unidade ?? "—"}</td>
      <td className="num">{material ? brl4(custoUnit) : "—"}</td>
      <td className="num strong">{brl4(porUnidade)}</td>
      <td className="num">{brl(porUnidade * rendimento)}</td>
      <td className="row-actions">
        <button
          type="button"
          className="icon-btn"
          title="Remover material"
          aria-label="Remover material de embalagem"
          onClick={() => salvar(() => removerEmbalagemProduto(linha.id))}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

export function EditorReceita({
  produto,
  insumos,
  custoHora,
}: {
  produto: Produto;
  insumos: Insumo[];
  custoHora: number;
}) {
  const { pendente, erro, salvar } = useSalvar();
  const [recolhido, setRecolhido] = useState(false);

  const ingredientes = insumos.filter((i) => i.tipo === "ingrediente");
  const materiais = insumos.filter((i) => i.tipo === "embalagem");
  const porId = new Map(insumos.map((i) => [i.id, i]));

  const [nome, setNome] = useState(produto.nome);
  const [rendimento, setRendimento] = useState(paraCampo(produto.rendimento, 4));
  const [markupAlvo, setMarkupAlvo] = useState(paraCampo(produto.markupAlvo, 2));
  const [precoVenda, setPrecoVenda] = useState(paraCampo(produto.precoVenda, 2));
  const [minutosPreparo, setMinutosPreparo] = useState(paraCampo(produto.minutosPreparo, 2));
  const [minutosAcabamentoUn, setMinutosAcabamentoUn] = useState(
    paraCampo(produto.minutosAcabamentoUn, 2),
  );

  useEffect(() => {
    setNome(produto.nome);
    setRendimento(paraCampo(produto.rendimento, 4));
    setMarkupAlvo(paraCampo(produto.markupAlvo, 2));
    setPrecoVenda(paraCampo(produto.precoVenda, 2));
    setMinutosPreparo(paraCampo(produto.minutosPreparo, 2));
    setMinutosAcabamentoUn(paraCampo(produto.minutosAcabamentoUn, 2));
  }, [produto]);

  const r = calcularProduto(produto, insumos, custoHora);

  function salvarCabecalho() {
    salvar(() =>
      salvarProduto(produto.id, {
        nome,
        rendimento,
        markupAlvo,
        minutosPreparo,
        minutosAcabamentoUn,
      }),
    );
  }

  return (
    <section className={`recipe${pendente ? " salvando" : ""}`}>
      <div className="recipe__head">
        <div className="campo">
          <label htmlFor={`nome-${produto.id}`}>Produto</label>
          <input
            id={`nome-${produto.id}`}
            className="campo-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={salvarCabecalho}
          />
        </div>
        <div className="campo">
          <label htmlFor={`rend-${produto.id}`}>Rendimento (un)</label>
          <input
            id={`rend-${produto.id}`}
            className="campo-num"
            inputMode="decimal"
            value={rendimento}
            onChange={(e) => setRendimento(e.target.value)}
            onBlur={() => {
              setRendimento(paraCampo(parseNumeroBR(rendimento), 4));
              salvarCabecalho();
            }}
          />
        </div>
        <div className="campo">
          <label htmlFor={`preco-${produto.id}`}>Preço de venda</label>
          <input
            id={`preco-${produto.id}`}
            className="campo-num"
            inputMode="decimal"
            value={precoVenda}
            onChange={(e) => setPrecoVenda(e.target.value)}
            onBlur={() => {
              setPrecoVenda(paraCampo(parseNumeroBR(precoVenda), 2));
              salvar(() => salvarPrecoProduto(produto.id, precoVenda));
            }}
          />
        </div>
        <div className="campo">
          <label htmlFor={`markup-${produto.id}`}>Markup alvo</label>
          <input
            id={`markup-${produto.id}`}
            className="campo-num"
            inputMode="decimal"
            value={markupAlvo}
            onChange={(e) => setMarkupAlvo(e.target.value)}
            onBlur={() => {
              setMarkupAlvo(paraCampo(parseNumeroBR(markupAlvo), 2));
              salvarCabecalho();
            }}
          />
        </div>

        <MenuProduto
          produtoId={produto.id}
          nome={produto.nome}
          recolhido={recolhido}
          aoAlternar={() => setRecolhido((v) => !v)}
        />
        {erro && <span className="erro">{erro}</span>}
      </div>

      {!recolhido && (
        <>
          <div className="secao">
            <h4>Receita</h4>
            <span>quantidades para o lote inteiro de {paraCampo(produto.rendimento, 2)} unidades</span>
          </div>

          <div className="scroller">
            <table>
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th className="num">Qtd no lote</th>
                  <th>Un</th>
                  <th className="num">Custo unitário</th>
                  <th className="num">Custo na receita</th>
                  <th className="row-actions" />
                </tr>
              </thead>
              <tbody>
                {produto.linhas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="vazio">
                      Nenhum ingrediente ainda.
                    </td>
                  </tr>
                ) : (
                  produto.linhas.map((l) => (
                    <LinhaIngrediente
                      key={l.id}
                      linha={l}
                      ingredientes={ingredientes}
                      porId={porId}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="add-row">
            <button type="button" onClick={() => salvar(() => criarLinha(produto.id))}>
              + Insumo na receita
            </button>
          </div>

          <div className="secao">
            <h4>Embalagem</h4>
            <span>quantidades por unidade produzida — só o que este produto usa</span>
          </div>

          <div className="scroller">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="num">Qtd por unidade</th>
                  <th>Un</th>
                  <th className="num">Custo unitário</th>
                  <th className="num">Custo por unidade</th>
                  <th className="num">Custo no lote</th>
                  <th className="row-actions" />
                </tr>
              </thead>
              <tbody>
                {produto.embalagens.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="vazio">
                      Sem embalagem. Este produto não tem custo de embalagem no cálculo.
                    </td>
                  </tr>
                ) : (
                  produto.embalagens.map((e) => (
                    <LinhaEmbalagemProduto
                      key={e.id}
                      linha={e}
                      materiais={materiais}
                      porId={porId}
                      rendimento={produto.rendimento}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="add-row">
            <button type="button" onClick={() => salvar(() => criarEmbalagemProduto(produto.id))}>
              + Material de embalagem
            </button>
          </div>

          <div className="secao">
            <h4>Mão de obra</h4>
            <span>
              preparo é do lote inteiro; acabamento é por unidade — é isso que faz lote maior
              sair mais barato
            </span>
          </div>

          <div className="tempos">
            <div className="campo">
              <label htmlFor={`prep-${produto.id}`}>Preparo (min por lote)</label>
              <input
                id={`prep-${produto.id}`}
                className="campo-num"
                inputMode="decimal"
                value={minutosPreparo}
                onChange={(e) => setMinutosPreparo(e.target.value)}
                onBlur={() => {
                  setMinutosPreparo(paraCampo(parseNumeroBR(minutosPreparo), 2));
                  salvarCabecalho();
                }}
              />
            </div>
            <div className="campo">
              <label htmlFor={`acab-${produto.id}`}>Acabamento (min por unidade)</label>
              <input
                id={`acab-${produto.id}`}
                className="campo-num"
                inputMode="decimal"
                value={minutosAcabamentoUn}
                onChange={(e) => setMinutosAcabamentoUn(e.target.value)}
                onBlur={() => {
                  setMinutosAcabamentoUn(paraCampo(parseNumeroBR(minutosAcabamentoUn), 2));
                  salvarCabecalho();
                }}
              />
            </div>

            <p className="tempos__resumo">
              {r.minutosLote > 0 ? (
                <>
                  <b>{formatarMinutos(r.minutosLote)}</b> por lote de{" "}
                  {paraCampo(produto.rendimento, 2)} unidades
                  {custoHora > 0 ? (
                    <>
                      {" "}
                      · <b>{brl(r.custoMaoDeObra)}</b> de mão de obra ({brl(
                        r.custoMaoDeObra / r.rendimento,
                      )}{" "}
                      por unidade)
                    </>
                  ) : (
                    <> · custo da hora ainda zerado, então não entra no cálculo</>
                  )}
                </>
              ) : (
                <>Sem tempo lançado — este produto não tem custo de mão de obra.</>
              )}
            </p>
          </div>
        </>
      )}

      <dl className="recipe__totals">
        <div className="total">
          <dt>Subtotal insumos</dt>
          <dd>{brl(r.custoInsumos)}</dd>
        </div>
        <div className="total">
          <dt>Embalagem</dt>
          <dd>{brl(r.custoEmbalagem)}</dd>
        </div>
        <div className="total">
          <dt>Mão de obra</dt>
          <dd>{brl(r.custoMaoDeObra)}</dd>
        </div>
        <div className="total">
          <dt>Custo total</dt>
          <dd>{brl(r.custoTotal)}</dd>
        </div>
        <div className="total total--accent">
          <dt>Custo por unidade</dt>
          <dd>{brl(r.custoUnitario)}</dd>
        </div>
        <div className="total">
          <dt>Margem por unidade</dt>
          <dd>{brl(r.margem)}</dd>
        </div>
        <div className="total">
          <dt>Preço sugerido</dt>
          <dd>{brl(r.precoSugerido)}</dd>
        </div>
      </dl>
    </section>
  );
}
