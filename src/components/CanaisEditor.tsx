"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { alternarFormaCanal, salvarMargemAlvoCanal } from "@/app/actions";
import { parseNumeroBR } from "@/lib/calc";
import type { Canal, FormaPagamento } from "@/lib/custo-completo";
import { desfocarNoEnter, paraCampo, useSalvar } from "./useSalvar";

function CartaoCanal({
  canal,
  todasFormas,
}: {
  canal: Canal;
  todasFormas: FormaPagamento[];
}) {
  const router = useRouter();
  const { pendente, erro, salvar } = useSalvar();
  const [margemCampo, setMargemCampo] = useState(paraCampo(canal.margemAlvoPct, 2));
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    setMargemCampo(paraCampo(canal.margemAlvoPct, 2));
  }, [canal.margemAlvoPct]);

  const aceitas = new Set(canal.formas.map((f) => f.id));

  function aoSalvarMargem() {
    const novo = parseNumeroBR(margemCampo);
    const mudou = Math.abs(novo - canal.margemAlvoPct) > 0.00005;
    if (!mudou) {
      setMargemCampo(paraCampo(novo, 2));
      return;
    }

    salvar(
      () => salvarMargemAlvoCanal(canal.id, margemCampo),
      () => {
        setMargemCampo(paraCampo(novo, 2));
        setSalvo(true);
        router.refresh();
      },
    );
  }

  function aoAlternarForma(formaId: number, estaAceita: boolean) {
    setSalvo(false);
    salvar(
      () => alternarFormaCanal(canal.id, formaId, !estaAceita),
      () => {
        setSalvo(true);
        router.refresh();
      },
    );
  }

  return (
    <div className={`canal-config-card${pendente ? " salvando" : ""}`}>
      <div className="section-row">
        <strong className="canal-preco-nome">{canal.nome}</strong>
        {salvo && <span className="badge badge--good">Salvo</span>}
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor={`canal-alvo-${canal.id}`}>
          Margem alvo (%)
        </label>
        <div className="field-with-suffix">
          <input
            id={`canal-alvo-${canal.id}`}
            className="field-input field-input--num"
            inputMode="decimal"
            value={margemCampo}
            onChange={(e) => {
              setSalvo(false);
              setMargemCampo(e.target.value);
            }}
            onKeyDown={desfocarNoEnter}
            onBlur={aoSalvarMargem}
          />
          <span className="field-suffix">%</span>
        </div>
      </div>

      <div className="field-group">
        <span className="field-label">Formas de pagamento aceitas</span>
        <div className="formas-chips">
          {todasFormas.map((forma) => {
            const marcada = aceitas.has(forma.id);
            const taxaTxt =
              forma.taxaPct === null ? "?" : `${paraCampo(forma.taxaPct, 2)}%`;
            return (
              <button
                key={forma.id}
                type="button"
                className={`forma-chip${marcada ? " forma-chip--ativa" : ""}`}
                aria-pressed={marcada}
                disabled={pendente}
                onClick={() => aoAlternarForma(forma.id, marcada)}
              >
                <span>{forma.nome}</span>
                <span className="tnum" style={{ opacity: 0.8, fontSize: 12 }}>
                  ({taxaTxt})
                </span>
              </button>
            );
          })}
        </div>
        {aceitas.size === 0 && (
          <p className="alerta-linha" style={{ marginTop: 4 }}>
            Selecione pelo menos uma forma aceita neste canal.
          </p>
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

export function CanaisEditor({
  canais,
  formasPagamento,
}: {
  canais: Canal[];
  formasPagamento: FormaPagamento[];
}) {
  const canaisAtivos = canais.filter((c) => c.ativo);
  const formasAtivas = formasPagamento.filter((f) => f.ativo);

  return (
    <section id="canais" className="card" aria-label="Canais de venda">
      <div className="section-row" style={{ marginBottom: 6 }}>
        <h2 className="section-heading">Canais</h2>
      </div>
      <p className="section-note" style={{ marginBottom: 12 }}>
        Meta de lucro líquido e formas de pagamento aceitas em cada canal. A sugestão de preço usa
        a maior taxa aceita no canal.
      </p>

      <div className="canal-preco-list">
        {canaisAtivos.map((canal) => (
          <CartaoCanal key={canal.id} canal={canal} todasFormas={formasAtivas} />
        ))}
      </div>
    </section>
  );
}
