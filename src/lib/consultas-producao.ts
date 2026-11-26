import "server-only";
// Interno; a entrada pública em queries.ts exige sessão antes de chamar esta leitura.
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { carregarProdutos } from "./consultas-db";
import type { DadosProduzir, InsumoProducao } from "./producao";

export async function carregarProduzir(): Promise<DadosProduzir> {
  return getDb().transaction(async (tx) => {
    const produtos = await carregarProdutos(tx);
    // A consulta antiga converte ausência de preço em zero. Produção precisa distinguir
    // preço ausente de zero explícito, sem alterar o contrato das outras telas.
    const rows = await tx.execute<{
      id: number; nome: string; tipo: "ingrediente" | "embalagem"; embalagem: string;
      qtd: string; unidade: string; preco: string | null;
    }>(sql`
      select i.id, i.nome, i.tipo, i.embalagem, i.qtd, i.unidade, p.preco
      from insumos i
      left join lateral (
        select ip.preco from insumo_precos ip
        where ip.insumo_id = i.id and ip.vigente_desde <= now()
        order by ip.vigente_desde desc, ip.id desc limit 1
      ) p on true
      where i.ativo order by (i.tipo = 'embalagem'), i.nome, i.id
    `);
    const insumos: InsumoProducao[] = Array.from(rows).map((r) => ({
      ...r, qtd: Number(r.qtd), preco: r.preco === null ? null : Number(r.preco),
    }));
    return {
      produtos: produtos.map(({ id, nome, rendimento, perdaPct, linhas, embalagens }) => ({ id, nome, rendimento, perdaPct, linhas, embalagens })),
      insumos,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
