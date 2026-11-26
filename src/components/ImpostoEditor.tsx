"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { salvarImposto } from "@/app/actions";
import { parseNumeroBR } from "@/lib/calc";
import { desfocarNoEnter, paraCampo, useSalvar } from "./useSalvar";

export function ImpostoEditor({ impostoPct }: { impostoPct: number }) {
  const router = useRouter();
  const { pendente, erro, salvar } = useSalvar();
  const [campo, setCampo] = useState(paraCampo(impostoPct, 4));
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    setCampo(paraCampo(impostoPct, 4));
  }, [impostoPct]);

  function aoSalvar() {
    const novo = parseNumeroBR(campo);
    const mudou = Math.abs(novo - impostoPct) > 0.00005;
    if (!mudou) {
      setCampo(paraCampo(novo, 4));
      return;
    }

    salvar(
      () => salvarImposto(campo),
      () => {
        setCampo(paraCampo(novo, 4));
        setSalvo(true);
        router.refresh();
      },
    );
  }

  return (
    <section className={`card${pendente ? " salvando" : ""}`} aria-label="Imposto">
      <div className="section-row" style={{ marginBottom: 10 }}>
        <h2 className="section-heading">Imposto</h2>
        {salvo && <span className="badge badge--good">Salvo no histórico</span>}
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="imposto-pct">
          Alíquota sobre o preço de venda (%)
        </label>
        <div className="field-with-suffix">
          <input
            id="imposto-pct"
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
          <span className="field-suffix">%</span>
        </div>
      </div>

      <p className="section-note" style={{ marginTop: 10 }}>
        Informal: 0%. Alterar aqui grava um registro novo no histórico.
      </p>

      {erro && (
        <div className="banner-erro" role="alert" style={{ marginTop: 10 }}>
          {erro}
        </div>
      )}
    </section>
  );
}
