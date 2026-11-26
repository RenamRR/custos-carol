import "server-only";
// Interno: só actions.ts e gravacoes-*.ts chamam, com o id vindo de exigirUsuario().
import { sql } from "drizzle-orm";
import { getDb } from "../db";

export type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Abre a transação e diz ao banco quem está escrevendo: os triggers da 0007 (versão da receita,
 * troca de embalagem) leem `custos.usuario_id` para gravar `alterado_por`. O `true` limita a
 * setting a esta transação. O id vai como parâmetro ($1), nunca interpolado no SQL.
 */
export async function comAutor<T>(usuarioId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) throw new Error("Usuário inválido.");
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('custos.usuario_id', ${String(usuarioId)}, true)`);
    return fn(tx);
  });
}
