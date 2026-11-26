"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { salvarTaxaForma } from "@/app/actions";
import { parseNumeroBR } from "@/lib/calc";
import type { FormaPagamento } from "@/lib/custo-completo";
import { desfocarNoEnter, paraCampo, useSalvar } from "./useSalvar";

function LinhaForma({ forma }: { forma: FormaPagamento }) {
  const router = useRouter();
  const { pendente, erro, salvar } = useSalvar();
  const [campo, setCampo] = useState(
    forma.taxaPct !== null ? paraCampo(forma.taxaPct, 2) : "",
  );
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    setCampo(forma.taxaPct !== null ? paraCampo(forma.taxaPct, 2) : "");
  }, [forma.taxaPct]);

  function aoSalvar() {
    const limpo = campo.trim();
    if (!limpo) {
      if (forma.taxaPct !== null) setCampo(paraCampo(forma.taxaPct, 2));
      return;
    }

    const novo = parseNumeroBR(limpo);
    if (forma.taxaPct !== null && Math.abs(novo - forma.taxaPct) <= 0.00005) {
      setCampo(paraCampo(novo, 2));
      return;
    }

    salvar(
      () => salvarTaxaForma(forma.id, limpo),
      () => {
        setCampo(paraCampo(novo, 2));
        setSalvo(true);
        router.refresh();
      },
    );
  }

  return (
    <div className={pendente ? "salvando" : ""}>
      <div className="forma-row">
        <div className="forma-info">
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="forma-nome">{forma.nome}</span>
            {salvo && <span className="badge badge--good">Salva</span>}
          </div>
          <span className="forma-taxa-atual">
            {forma.taxaPct === null ? "Taxa ainda não informada" : "Taxa ativa"}
          </span>
        </div>

        <div className="forma-input-box">
          <div className="field-with-suffix">
            <input
              aria-label={`Taxa de ${forma.nome} em %`}
              className="field-input field-input--num"
              inputMode="decimal"
              placeholder="0,00"
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
      </div>

      {erro && (
        <div className="banner-erro" role="alert" style={{ marginTop: 6 }}>
          {erro}
        </div>
      )}
    </div>
  );
}

export function FormasPagamentoEditor({ formas }: { formas: FormaPagamento[] }) {
  const ativas = formas.filter((f) => f.ativo);

  return (
    <section id="formas-pagamento" className="card" aria-label="Formas de pagamento">
      <div className="section-row" style={{ marginBottom: 6 }}>
        <h2 className="section-heading">Formas de pagamento</h2>
      </div>
      <p className="section-note" style={{ marginBottom: 12 }}>
        Taxas descontadas na venda. Alterar aqui não sobrescreve: grava um novo registro no
        histórico.
      </p>

      <div className="forma-list">
        {ativas.map((forma) => (
          <LinhaForma key={forma.id} forma={forma} />
        ))}
      </div>
    </section>
  );
}
