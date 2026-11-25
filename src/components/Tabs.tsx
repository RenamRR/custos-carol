"use client";

import { useId, useRef, useState, type ReactNode } from "react";

export interface Aba {
  id: string;
  rotulo: string;
  conteudo: ReactNode;
}

export function Tabs({ abas }: { abas: Aba[] }) {
  const [ativa, setAtiva] = useState(abas[0]?.id ?? "");
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function aoTeclar(evento: React.KeyboardEvent, indice: number) {
    const passo = evento.key === "ArrowRight" ? 1 : evento.key === "ArrowLeft" ? -1 : 0;
    if (passo === 0) return;
    evento.preventDefault();
    const alvo = abas[(indice + passo + abas.length) % abas.length];
    setAtiva(alvo.id);
    refs.current[alvo.id]?.focus();
  }

  return (
    <>
      <nav className="tabs" role="tablist" aria-label="Seções">
        {abas.map((aba, i) => (
          <button
            key={aba.id}
            ref={(n) => {
              refs.current[aba.id] = n;
            }}
            type="button"
            className="tab"
            role="tab"
            id={`${base}-tab-${aba.id}`}
            aria-controls={`${base}-painel-${aba.id}`}
            aria-selected={aba.id === ativa}
            tabIndex={aba.id === ativa ? 0 : -1}
            onClick={() => setAtiva(aba.id)}
            onKeyDown={(e) => aoTeclar(e, i)}
          >
            {aba.rotulo}
          </button>
        ))}
      </nav>

      {abas.map((aba) => (
        <section
          key={aba.id}
          role="tabpanel"
          id={`${base}-painel-${aba.id}`}
          aria-labelledby={`${base}-tab-${aba.id}`}
          hidden={aba.id !== ativa}
        >
          {aba.conteudo}
        </section>
      ))}
    </>
  );
}
