"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  criarInsumo,
  removerInsumo,
  salvarInsumo,
  salvarPrecoInsumo,
} from "@/app/actions";
import {
  brl4,
  custoPorUnidadeDeMedida,
  parseNumeroBR,
  type Insumo,
  type TipoInsumo,
} from "@/lib/calc";
import { desfocarNoEnter, paraCampo, paraPreco, useSalvar } from "./useSalvar";

function CardInsumo({ insumo }: { insumo: Insumo }) {
  const router = useRouter();
  const { pendente, erro, limparErro, salvar } = useSalvar();

  const [nome, setNome] = useState(insumo.nome);
  const [embalagem, setEmbalagem] = useState(insumo.embalagem);
  const [qtd, setQtd] = useState(paraCampo(insumo.qtd, 4));
  const [unidade, setUnidade] = useState(insumo.unidade);
  const [preco, setPreco] = useState(paraPreco(insumo.preco));
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [salvoHistorico, setSalvoHistorico] = useState(false);

  useEffect(() => {
    setNome(insumo.nome);
    setEmbalagem(insumo.embalagem);
    setQtd(paraCampo(insumo.qtd, 4));
    setUnidade(insumo.unidade);
    setPreco(paraPreco(insumo.preco));
  }, [insumo]);

  function salvarCampos() {
    limparErro();
    salvar(() => salvarInsumo(insumo.id, { nome, embalagem, qtd, unidade }), () =>
      router.refresh(),
    );
  }

  function salvarPreco() {
    limparErro();
    const novoValor = parseNumeroBR(preco);
    const mudou = Math.abs(novoValor - insumo.preco) > 0.00005;
    setPreco(paraPreco(novoValor));
    salvar(
      () => salvarPrecoInsumo(insumo.id, preco),
      () => {
        if (mudou) setSalvoHistorico(true);
        router.refresh();
      },
    );
  }

  const custoUnit = custoPorUnidadeDeMedida({
    qtd: parseNumeroBR(qtd),
    preco: parseNumeroBR(preco),
  });

  return (
    <article className={`insumo-card${pendente ? " salvando" : ""}`}>
      <div className="insumo-head">
        <input
          className="field-input"
          value={nome}
          aria-label="Nome do item"
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={desfocarNoEnter}
          onBlur={salvarCampos}
        />
        <button
          type="button"
          className="icon-btn"
          title={`Remover ${insumo.nome}`}
          aria-label={`Remover ${insumo.nome}`}
          disabled={pendente}
          onClick={() => {
            limparErro();
            setConfirmarExclusao((v) => !v);
          }}
        >
          &times;
        </button>
      </div>

      {confirmarExclusao && (
        <div className="confirm-box" role="alertdialog" aria-label={`Confirmar exclusão de ${insumo.nome}`}>
          <p>Remover “{insumo.nome}” do catálogo?</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setConfirmarExclusao(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger-solid"
              disabled={pendente}
              onClick={() =>
                salvar(
                  () => removerInsumo(insumo.id),
                  () => {
                    setConfirmarExclusao(false);
                    router.refresh();
                  },
                )
              }
            >
              Sim, remover
            </button>
          </div>
        </div>
      )}

      <div className="field-group">
        <label className="field-label" htmlFor={`emb-${insumo.id}`}>
          Embalagem de compra
        </label>
        <input
          id={`emb-${insumo.id}`}
          className="field-input"
          placeholder="Ex.: Pacote 500g"
          value={embalagem}
          onChange={(e) => setEmbalagem(e.target.value)}
          onKeyDown={desfocarNoEnter}
          onBlur={salvarCampos}
        />
      </div>

      <div className="insumo-grid-3">
        <div className="field-group">
          <label className="field-label" htmlFor={`qtd-${insumo.id}`}>
            Qtd compra
          </label>
          <input
            id={`qtd-${insumo.id}`}
            className="field-input field-input--num"
            inputMode="decimal"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            onKeyDown={desfocarNoEnter}
            onBlur={() => {
              setQtd(paraCampo(parseNumeroBR(qtd), 4));
              salvarCampos();
            }}
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor={`un-${insumo.id}`}>
            Unidade
          </label>
          <input
            id={`un-${insumo.id}`}
            className="field-input"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            onKeyDown={desfocarNoEnter}
            onBlur={salvarCampos}
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor={`preco-${insumo.id}`}>
            Preço pago (R$)
          </label>
          <input
            id={`preco-${insumo.id}`}
            className="field-input field-input--num"
            inputMode="decimal"
            value={preco}
            onChange={(e) => {
              setSalvoHistorico(false);
              setPreco(e.target.value);
            }}
            onKeyDown={desfocarNoEnter}
            onBlur={salvarPreco}
          />
        </div>
      </div>

      <div className="insumo-foot">
        <span className="insumo-unit-cost tnum">
          {brl4(custoUnit)} <span style={{ color: "var(--muted)", fontWeight: 600 }}>/{unidade}</span>
        </span>
        {salvoHistorico ? (
          <span className="badge badge--good">Novo preço salvo no histórico</span>
        ) : (
          <span className="field-hint">Mudar preço cria registro no histórico</span>
        )}
      </div>

      {erro && (
        <div className="banner-erro" role="alert">
          {erro}
        </div>
      )}
    </article>
  );
}

export function CatalogoInsumos({ insumos }: { insumos: Insumo[] }) {
  const router = useRouter();
  const [aba, setAba] = useState<TipoInsumo>("ingrediente");
  const [criado, setCriado] = useState(false);
  const { pendente, erro, salvar } = useSalvar();

  const ingredientes = insumos.filter((i) => i.tipo === "ingrediente");
  const embalagens = insumos.filter((i) => i.tipo === "embalagem");
  const lista = aba === "ingrediente" ? ingredientes : embalagens;

  function aoCriar() {
    setCriado(false);
    salvar(
      () => criarInsumo(aba),
      () => {
        setCriado(true);
        router.refresh();
      },
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Insumos</h1>
          <p className="page-sub">
            {aba === "ingrediente"
              ? "Ingredientes de compra. Mudou aqui, todas as receitas recalculam."
              : "Materiais de embalagem. Só entram no custo dos produtos que os usam."}
          </p>
        </div>
        <button type="button" className="btn btn-mustard" disabled={pendente} onClick={aoCriar}>
          {pendente ? "Criando..." : aba === "ingrediente" ? "+ Ingrediente" : "+ Material"}
        </button>
      </div>

      <div className="tabs-bar" role="tablist" aria-label="Tipo de insumo">
        <button
          type="button"
          role="tab"
          aria-selected={aba === "ingrediente"}
          className="tab-btn tnum"
          onClick={() => {
            setCriado(false);
            setAba("ingrediente");
          }}
        >
          Ingredientes ({ingredientes.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === "embalagem"}
          className="tab-btn tnum"
          onClick={() => {
            setCriado(false);
            setAba("embalagem");
          }}
        >
          Embalagens ({embalagens.length})
        </button>
      </div>

      <div className="banner-aviso">
        Preço nunca é sobrescrito: qualquer alteração de valor pago grava um registro novo no
        histórico.
      </div>

      {criado && (
        <div className="banner-sucesso" role="status">
          <span>
            {aba === "ingrediente" ? "Novo insumo" : "Novo material"} criado na lista em ordem
            alfabética.
          </span>
        </div>
      )}

      {erro && (
        <div className="banner-erro" role="alert">
          {erro}
        </div>
      )}

      {lista.length === 0 ? (
        <div className="estado-vazio">
          <h2>
            {aba === "ingrediente"
              ? "Nenhum ingrediente cadastrado"
              : "Nenhuma embalagem cadastrada"}
          </h2>
          <p>Adicione o primeiro item para poder incluí-lo nas receitas.</p>
          <button type="button" className="btn btn-mustard" disabled={pendente} onClick={aoCriar}>
            {aba === "ingrediente" ? "+ Novo ingrediente" : "+ Novo material"}
          </button>
        </div>
      ) : (
        <div className="stack-list">
          {lista.map((item) => (
            <CardInsumo key={item.id} insumo={item} />
          ))}
        </div>
      )}
    </>
  );
}
