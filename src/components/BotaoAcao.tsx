"use client";

import type { Resultado } from "@/app/actions";
import { useSalvar } from "./useSalvar";

export function BotaoAcao({
  acao,
  children,
  className,
}: {
  acao: () => Promise<Resultado>;
  children: React.ReactNode;
  className?: string;
}) {
  const { pendente, erro, salvar } = useSalvar();

  return (
    <>
      <button type="button" className={className} disabled={pendente} onClick={() => salvar(acao)}>
        {children}
      </button>
      {erro && <span className="erro">{erro}</span>}
    </>
  );
}
