"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { salvarPrecoCanal } from "@/app/actions";
import { brl, margemNoCanal, parseNumeroBR } from "@/lib/calc";
import type { ResumoCanal } from "@/lib/custo-completo";
import { BadgeMargem } from "./IndicadorMargem";
import { desfocarNoEnter, paraCampo, paraPreco, useSalvar } from "./useSalvar";

function juntarNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

export function CartaoPrecoCanal({
  produtoId,
  canal,
  custoUnitario,
  margemAlvoPct,
  impostoPct,
}: {
  produtoId: number;
  canal: ResumoCanal;
  custoUnitario: number;
  margemAlvoPct: number;
  impostoPct: number;
}) {
  const router = useRouter();
  const { pendente, erro, salvar } = useSalvar();
  const [campo, setCampo] = useState(paraPreco(canal.preco));
  const [sugeridoPendente, setSugeridoPendente] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    setCampo(paraPreco(canal.preco));
    setSugeridoPendente(false);
  }, [canal.preco]);

  const precoDigitado = parseNumeroBR(campo);
  const previa = margemNoCanal(custoUnitario, precoDigitado, canal.taxaPct, impostoPct);
  const mudouDoSalvo = Math.abs(precoDigitado - canal.preco) > 0.00005;

  function executarSave(valorParaSalvar: string) {
    const novo = parseNumeroBR(valorParaSalvar);
    salvar(
      () => salvarPrecoCanal(produtoId, canal.canalId, valorParaSalvar),
      () => {
        setCampo(paraPreco(novo));
        setSugeridoPendente(false);
        setSalvo(true);
        router.refresh();
      },
    );
  }

  function aoDesfocar() {
    if (sugeridoPendente) return;
    if (!mudouDoSalvo) {
      setCampo(paraPreco(precoDigitado));
      return;
    }
    executarSave(campo);
  }

  function aoUsarSugerido() {
    if (canal.precoSugerido === null) return;
    setSalvo(false);
    setCampo(paraPreco(canal.precoSugerido));
    setSugeridoPendente(true);
  }

  return (
    <div className={`canal-preco-card${pendente ? " salvando" : ""}`}>
      <div className="canal-preco-top">
        <div className="canal-preco-titulo">
          <span className="canal-preco-nome">{canal.nome}</span>
          {canal.precoHerdado && !mudouDoSalvo && (
            <span className="canal-preco-herdado">igual ao geral</span>
          )}
          {salvo && <span className="badge badge--good">Salvo</span>}
        </div>
        <BadgeMargem margemPct={previa.margemPct} />
      </div>

      <div className="form-grid-2">
        <div className="field-group">
          <label
            className="field-label"
            htmlFor={`canal-preco-${produtoId}-${canal.canalId}`}
          >
            Preço no canal (R$)
          </label>
          <div className="field-with-suffix">
            <input
              id={`canal-preco-${produtoId}-${canal.canalId}`}
              className="field-input field-input--num"
              inputMode="decimal"
              value={campo}
              onChange={(e) => {
                setSalvo(false);
                setSugeridoPendente(false);
                setCampo(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && sugeridoPendente) {
                  e.preventDefault();
                  executarSave(campo);
                  return;
                }
                desfocarNoEnter(e);
              }}
              onBlur={aoDesfocar}
            />
            <span className="field-suffix">/un</span>
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">Sobra líquida</span>
          <div className="kpi-box" style={{ padding: "8px 10px" }}>
            <div className="metric-value tnum">{brl(previa.margem)}/un</div>
            <div className="metric-sub tnum">{previa.margemPct.toFixed(1).replace(".", ",")}%</div>
          </div>
        </div>
      </div>

      {canal.formasSemTaxa.length > 0 ? (
        <div className="banner-aviso" style={{ padding: "8px 10px", fontSize: 12 }}>
          Taxa de <b>{juntarNomes(canal.formasSemTaxa)}</b> ainda não informada: margem e
          sugerido sem ela{impostoPct > 0 ? ` (imposto ${paraCampo(impostoPct, 4)}% incluído)` : ""}.{" "}
          <Link href="/mais#formas-pagamento" style={{ color: "inherit", fontWeight: 800 }}>
            Informar em Mais &rarr;
          </Link>
        </div>
      ) : (
        <p className="canal-preco-meta">
          {canal.formaMaisCara ? (
            <>
              Pior caso: <b>{canal.formaMaisCara}</b> ({paraCampo(canal.taxaPct, 2)}%)
            </>
          ) : (
            "Sem forma de pagamento com taxa cadastrada"
          )}
          {impostoPct > 0 && ` + imposto ${paraCampo(impostoPct, 4)}%`}.
        </p>
      )}

      <div className="canal-sugestao-row">
        {canal.precoSugerido !== null ? (
          <>
            <span className="canal-sugestao-texto tnum">
              Sugerido (meta {paraCampo(margemAlvoPct, 2)}%):{" "}
              <b>{brl(canal.precoSugerido)}</b>
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-sugerido"
                onClick={aoUsarSugerido}
              >
                Usar sugerido
              </button>
              {sugeridoPendente && (
                <button
                  type="button"
                  className="btn btn-choco"
                  disabled={pendente}
                  onClick={() => executarSave(campo)}
                >
                  Salvar preço
                </button>
              )}
            </div>
          </>
        ) : (
          <span className="canal-sugestao-texto">
            Meta {paraCampo(margemAlvoPct, 2)}% + taxas/imposto somam 100% ou mais — reduza a
            meta em Mais para sugerir preço.
          </span>
        )}
      </div>

      {erro && (
        <div className="banner-erro" role="alert">
          {erro}
        </div>
      )}
    </div>
  );
}
