"use client";

import { useEffect, useRef, useState } from "react";
import { duplicarProduto, removerProduto } from "@/app/actions";
import { useSalvar } from "./useSalvar";

export function MenuProduto({
  produtoId,
  nome,
  recolhido,
  aoAlternar,
}: {
  produtoId: number;
  nome: string;
  recolhido: boolean;
  aoAlternar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const { pendente, erro, salvar } = useSalvar();

  useEffect(() => {
    if (!aberto) return;

    function foraDaCaixa(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAberto(false);
        gatilho.current?.focus();
      }
    }

    document.addEventListener("mousedown", foraDaCaixa);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", foraDaCaixa);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div className="menu" ref={caixa}>
      <button
        ref={gatilho}
        type="button"
        className="menu__gatilho"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Ações de ${nome}`}
        disabled={pendente}
        onClick={() => setAberto((v) => !v)}
      >
        ⋮
      </button>

      {aberto && (
        <div className="menu__lista" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              aoAlternar();
              setAberto(false);
            }}
          >
            {recolhido ? "Mostrar mais" : "Mostrar menos"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAberto(false);
              salvar(() => duplicarProduto(produtoId));
            }}
          >
            Duplicar receita
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu__item--danger"
            onClick={() => {
              setAberto(false);
              if (!window.confirm(`Remover ${nome}? A receita inteira vai junto.`)) return;
              salvar(() => removerProduto(produtoId));
            }}
          >
            Remover receita
          </button>
        </div>
      )}

      {erro && <span className="erro">{erro}</span>}
    </div>
  );
}
