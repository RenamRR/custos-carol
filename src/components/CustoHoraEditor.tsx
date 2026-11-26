"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { salvarCustoHora } from "@/app/actions";
import { brl, parseNumeroBR } from "@/lib/calc";
import { desfocarNoEnter, paraPreco, useSalvar } from "./useSalvar";

export function CustoHoraEditor({ valor }: { valor: number }) {
  const router = useRouter();
  const { pendente, erro, salvar } = useSalvar();
  const [campo, setCampo] = useState(paraPreco(valor));
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    setCampo(paraPreco(valor));
  }, [valor]);

  const atual = parseNumeroBR(campo);

  function aoSalvar() {
    const novo = parseNumeroBR(campo);
    const mudou = Math.abs(novo - valor) > 0.00005;
    setCampo(paraPreco(novo));
    salvar(
      () => salvarCustoHora(campo),
      () => {
        if (mudou) setSalvo(true);
        router.refresh();
      },
    );
  }

  return (
    <section
      id="mao-de-obra"
      className={`card${pendente ? " salvando" : ""}`}
      aria-label="Custo da hora de trabalho"
    >
      <div className="section-row" style={{ marginBottom: 10 }}>
        <h2 className="section-heading">Mão de obra</h2>
        {salvo && <span className="badge badge--good">Salvo no histórico</span>}
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="custo-hora">
          Valor da hora de trabalho (R$)
        </label>
        <div className="field-with-suffix">
          <input
            id="custo-hora"
            className="field-input field-input--num"
            inputMode="decimal"
            value={campo}
            onChange={(e) => {
              setSalvo(false);
              setCampo(e.target.value);
            }}
            onKeyDown={desfocarNoEnter}
            onBlur={aoSalvar}
          />
          <span className="field-suffix">/h</span>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {atual > 0 ? (
          <p className="page-sub" style={{ margin: 0 }}>
            Um minuto de trabalho custa <b className="tnum">{brl(atual / 60)}</b>. Alterar aqui
            não sobrescreve: grava um registro novo no histórico.
          </p>
        ) : (
          <div className="banner-aviso">
            Enquanto estiver zerado, a mão de obra <b>não entra</b> no custo dos produtos. Defina
            quanto vale a hora de trabalho para incluir os tempos das receitas.
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
