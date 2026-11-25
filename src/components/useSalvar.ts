"use client";

import { useState, useTransition } from "react";
import type { Resultado } from "@/app/actions";

/**
 * Envolve uma Server Action: mantém o estado pendente e guarda a mensagem de erro
 * para mostrar ao lado do campo, em vez de estourar uma exceção na tela.
 */
export function useSalvar() {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function salvar(acao: () => Promise<Resultado>) {
    iniciar(async () => {
      try {
        const r = await acao();
        setErro(r.ok ? null : r.erro);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não consegui salvar.");
      }
    });
  }

  return { pendente, erro, salvar };
}

/** Número no formato pt-BR para exibir dentro do input. */
export function paraCampo(n: number, casas = 2): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}
