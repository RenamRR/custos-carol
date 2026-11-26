"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { salvarForno } from "@/app/actions";
import { brl, brl4, parseNumeroBR } from "@/lib/calc";
import type { Forno } from "@/lib/custo-completo";
import { desfocarNoEnter, paraCampo, paraPreco, useSalvar } from "./useSalvar";

export function FornoEditor({ forno }: { forno: Forno }) {
  const router = useRouter();
  const { pendente, erro, salvar } = useSalvar();
  const [precoCampo, setPrecoCampo] = useState(
    forno.precoBotijao > 0 ? paraPreco(forno.precoBotijao) : "",
  );
  const [horasCampo, setHorasCampo] = useState(
    forno.horasPorBotijao > 0 ? paraCampo(forno.horasPorBotijao, 2) : "",
  );
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    setPrecoCampo(forno.precoBotijao > 0 ? paraPreco(forno.precoBotijao) : "");
    setHorasCampo(forno.horasPorBotijao > 0 ? paraCampo(forno.horasPorBotijao, 2) : "");
  }, [forno.precoBotijao, forno.horasPorBotijao]);

  const precoAtual = parseNumeroBR(precoCampo);
  const horasAtual = parseNumeroBR(horasCampo);
  const valido = Number.isFinite(precoAtual) && precoAtual > 0 && Number.isFinite(horasAtual) && horasAtual > 0;
  const custoHoraCalc = valido ? precoAtual / horasAtual : 0;

  function aoSalvar() {
    const pTxt = precoCampo.trim();
    const hTxt = horasCampo.trim();
    if (!pTxt || !hTxt) return;

    const novoPreco = parseNumeroBR(pTxt);
    const novasHoras = parseNumeroBR(hTxt);
    const mudou =
      Math.abs(novoPreco - forno.precoBotijao) > 0.00005 ||
      Math.abs(novasHoras - forno.horasPorBotijao) > 0.00005;
    if (!mudou) {
      setPrecoCampo(forno.precoBotijao > 0 ? paraPreco(forno.precoBotijao) : "");
      setHorasCampo(forno.horasPorBotijao > 0 ? paraCampo(forno.horasPorBotijao, 2) : "");
      return;
    }

    salvar(
      () => salvarForno(pTxt, hTxt),
      () => {
        setPrecoCampo(paraPreco(novoPreco));
        setHorasCampo(paraCampo(novasHoras, 2));
        setSalvo(true);
        router.refresh();
      },
    );
  }

  return (
    <section
      id="forno"
      className={`card${pendente ? " salvando" : ""}`}
      aria-label="Forno e gás"
    >
      <div className="section-row" style={{ marginBottom: 10 }}>
        <h2 className="section-heading">Forno e gás</h2>
        {salvo && <span className="badge badge--good">Salvo no histórico</span>}
      </div>

      <div className="form-grid-2">
        <div className="field-group">
          <label className="field-label" htmlFor="forno-preco">
            Botijão de gás (R$)
          </label>
          <input
            id="forno-preco"
            className="field-input field-input--num"
            inputMode="decimal"
            placeholder="0,00"
            value={precoCampo}
            onChange={(e) => {
              setSalvo(false);
              setPrecoCampo(e.target.value);
            }}
            onKeyDown={desfocarNoEnter}
            onBlur={aoSalvar}
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="forno-horas">
            Duração (horas)
          </label>
          <div className="field-with-suffix">
            <input
              id="forno-horas"
              className="field-input field-input--num"
              inputMode="decimal"
              placeholder="0"
              value={horasCampo}
              onChange={(e) => {
                setSalvo(false);
                setHorasCampo(e.target.value);
              }}
              onKeyDown={desfocarNoEnter}
              onBlur={aoSalvar}
            />
            <span className="field-suffix">h</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {valido ? (
          <p className="section-note">
            Hora de forno: <b className="tnum">{brl(custoHoraCalc)}/h</b> (
            <span className="tnum">{brl4(custoHoraCalc / 60)}/min</span>). Alterar grava um novo
            registro no histórico.
          </p>
        ) : (
          <div className="banner-aviso">
            Informe quanto custa o botijão e quantas horas ele dura para incluir o gás nas
            receitas com tempo de forno.
          </div>
        )}
      </div>

      {erro && (
        <div className="banner-erro" role="alert" style={{ marginTop: 10 }}>
          {erro}
        </div>
      )}
    </section>
  );
}
