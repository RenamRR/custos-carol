"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import type { Resultado } from "@/app/actions";

/**
 * Envolve uma Server Action: mantém o estado pendente e guarda a mensagem de erro
 * para mostrar ao usuário em vez de estourar exceção na tela.
 */
export function useSalvar() {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function salvar(acao: () => Promise<Resultado>, aoSucesso?: () => void) {
    iniciar(async () => {
      try {
        const r = await acao();
        if (!r) return;
        if (r.ok) {
          setErro(null);
          aoSucesso?.();
        } else {
          setErro(r.erro);
        }
      } catch (e) {
        if (
          typeof e === "object" &&
          e !== null &&
          "digest" in e &&
          typeof (e as { digest?: unknown }).digest === "string" &&
          (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw e;
        }
        setErro(e instanceof Error ? e.message : "Não consegui salvar.");
      }
    });
  }

  return { pendente, erro, limparErro: () => setErro(null), salvar };
}

/** Número no formato pt-BR para exibir dentro do input (sem separador de milhar). */
export function paraCampo(n: number, casas = 2): string {
  return n.toLocaleString("pt-BR", {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: casas,
  });
}

/** Faz Enter/Concluído do teclado do celular disparar o onBlur para salvar o campo. */
export function desfocarNoEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.currentTarget.blur();
  }
}
