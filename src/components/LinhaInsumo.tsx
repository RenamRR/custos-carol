"use client";

import { useEffect, useState } from "react";
import { removerInsumo, salvarInsumo, salvarPrecoInsumo } from "@/app/actions";
import { brl4, custoPorUnidadeDeMedida, parseNumeroBR, type Insumo } from "@/lib/calc";
import { paraCampo, useSalvar } from "./useSalvar";

/**
 * Linha do catálogo — serve para ingrediente e para material de embalagem.
 * Guarda só o que é do material: o que vem na compra e por quanto. Quanto entra em
 * cada produto é definido dentro do produto.
 */
export function LinhaInsumo({ insumo }: { insumo: Insumo }) {
  const { pendente, erro, salvar } = useSalvar();

  const [nome, setNome] = useState(insumo.nome);
  const [embalagem, setEmbalagem] = useState(insumo.embalagem);
  const [qtd, setQtd] = useState(paraCampo(insumo.qtd, 4));
  const [unidade, setUnidade] = useState(insumo.unidade);
  const [preco, setPreco] = useState(paraCampo(insumo.preco, 2));

  // Depois de um revalidate o servidor manda o valor novo; sem isso os campos
  // ficariam presos no que foi digitado antes.
  useEffect(() => {
    setNome(insumo.nome);
    setEmbalagem(insumo.embalagem);
    setQtd(paraCampo(insumo.qtd, 4));
    setUnidade(insumo.unidade);
    setPreco(paraCampo(insumo.preco, 2));
  }, [insumo]);

  function salvarCampos() {
    salvar(() => salvarInsumo(insumo.id, { nome, embalagem, qtd, unidade }));
  }

  const custoAtual = custoPorUnidadeDeMedida({
    qtd: parseNumeroBR(qtd),
    preco: parseNumeroBR(preco),
  });

  return (
    <tr className={pendente ? "salvando" : undefined}>
      <td>
        <input
          value={nome}
          aria-label="Nome"
          onChange={(e) => setNome(e.target.value)}
          onBlur={salvarCampos}
        />
        {erro && <span className="erro">{erro}</span>}
      </td>
      <td>
        <input
          value={embalagem}
          aria-label="Embalagem de compra"
          onChange={(e) => setEmbalagem(e.target.value)}
          onBlur={salvarCampos}
        />
      </td>
      <td className="num">
        <input
          className="campo-num"
          inputMode="decimal"
          value={qtd}
          aria-label="Quantidade na embalagem de compra"
          onChange={(e) => setQtd(e.target.value)}
          onBlur={() => {
            setQtd(paraCampo(parseNumeroBR(qtd), 4));
            salvarCampos();
          }}
        />
      </td>
      <td>
        <input
          className="campo-un"
          value={unidade}
          aria-label="Unidade"
          onChange={(e) => setUnidade(e.target.value)}
          onBlur={salvarCampos}
        />
      </td>
      <td className="num">
        <input
          className="campo-num"
          inputMode="decimal"
          value={preco}
          aria-label="Preço pago"
          onChange={(e) => setPreco(e.target.value)}
          onBlur={() => {
            setPreco(paraCampo(parseNumeroBR(preco), 2));
            salvar(() => salvarPrecoInsumo(insumo.id, preco));
          }}
        />
      </td>
      <td className="num strong">
        {brl4(custoAtual)} <span className="por">/{unidade}</span>
      </td>
      <td className="row-actions">
        <button
          type="button"
          className="icon-btn"
          title={`Remover ${insumo.nome}`}
          aria-label={`Remover ${insumo.nome}`}
          onClick={() => salvar(() => removerInsumo(insumo.id))}
        >
          ×
        </button>
      </td>
    </tr>
  );
}
