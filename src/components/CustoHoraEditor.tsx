"use client";

import { useEffect, useState } from "react";
import { salvarCustoHora } from "@/app/actions";
import { brl, parseNumeroBR } from "@/lib/calc";
import { paraCampo, useSalvar } from "./useSalvar";

export function CustoHoraEditor({ valor }: { valor: number }) {
  const { pendente, erro, salvar } = useSalvar();
  const [campo, setCampo] = useState(paraCampo(valor, 2));

  useEffect(() => {
    setCampo(paraCampo(valor, 2));
  }, [valor]);

  const atual = parseNumeroBR(campo);

  return (
    <div className={`custo-hora${pendente ? " salvando" : ""}`}>
      <div className="campo">
        <label htmlFor="custo-hora">Custo da hora</label>
        <input
          id="custo-hora"
          className="campo-num"
          inputMode="decimal"
          value={campo}
          onChange={(e) => setCampo(e.target.value)}
          onBlur={() => {
            setCampo(paraCampo(parseNumeroBR(campo), 2));
            salvar(() => salvarCustoHora(campo));
          }}
        />
      </div>

      <div className="custo-hora__nota">
        {atual > 0 ? (
          <p>
            Um minuto de trabalho custa <b>{brl(atual / 60)}</b>. Alterar aqui não sobrescreve:
            vira registro novo no histórico, então o custo do passado continua correto.
          </p>
        ) : (
          <p className="custo-hora__vazio">
            Enquanto estiver zerado, mão de obra <b>não entra</b> em nenhum custo. Nada foi
            inventado — defina quanto vale a hora de trabalho para o cálculo começar a valer.
          </p>
        )}
        {erro && <span className="erro">{erro}</span>}
      </div>
    </div>
  );
}
