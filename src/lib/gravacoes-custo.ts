import "server-only";
// Interno: só actions.ts fornece usuarioId após exigirUsuario(). Nunca usar "use server" aqui.
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { alertasDispensados, canalFormas, canais, configuracaoValores, formaPagamentoTaxas, formasPagamento, fornoCustos, produtoPrecos, produtos } from "../db/schema";
import type { Resultado } from "../app/actions";
import { idValido, IMPOSTO_CHAVE, numeroCusto, PERDA_MAXIMA_PCT } from "./validacao-custo";
import { lerChaveAlerta } from "./linha-do-tempo";

const ok: Resultado = { ok: true };
const falha = (erro: string): Resultado => ({ ok: false, erro });
const MAX_VALOR = 9999999999.9999;
async function gravar(acao: () => Promise<Resultado>): Promise<Resultado> {
  try { return await acao(); }
  catch { return falha("Não foi possível salvar. Tente novamente."); }
}

export async function salvarForno(usuarioId: number, preco: string, horas: string): Promise<Resultado> {
  const precoBotijao = numeroCusto(preco, MAX_VALOR, 4);
  const horasPorBotijao = numeroCusto(horas, MAX_VALOR, 4, 0.0001);
  if (precoBotijao === null || horasPorBotijao === null) return falha("Informe preço não negativo e duração do botijão maior que zero (até 4 casas decimais).");
  return gravar(async () => {
    await getDb().insert(fornoCustos).values({ precoBotijao: String(precoBotijao), horasPorBotijao: String(horasPorBotijao), alteradoPor: usuarioId });
    return ok;
  });
}

export async function salvarPrecoCanal(usuarioId: number, produtoId: number, canalId: number, preco: string): Promise<Resultado> {
  const valor = numeroCusto(preco, MAX_VALOR, 4);
  if (!idValido(produtoId) || !idValido(canalId) || valor === null) return falha("Produto, canal ou preço inválido.");
  return gravar(() => getDb().transaction(async (tx) => {
    const [produto] = await tx.select({ id: produtos.id }).from(produtos).where(and(eq(produtos.id, produtoId), eq(produtos.ativo, true))).for("update");
    const [canal] = await tx.select({ id: canais.id }).from(canais).where(and(eq(canais.id, canalId), eq(canais.ativo, true)));
    if (!produto || !canal) return falha("Produto ou canal não encontrado.");
    const [atual] = await tx.select({ preco: produtoPrecos.preco }).from(produtoPrecos)
      .where(and(eq(produtoPrecos.produtoId, produtoId), eq(produtoPrecos.canalId, canalId), lte(produtoPrecos.vigenteDesde, sql`now()`)))
      .orderBy(desc(produtoPrecos.vigenteDesde), desc(produtoPrecos.id)).limit(1);
    // Mesmo valor do geral ainda cria a primeira escolha explícita do canal.
    if (atual && Number(atual.preco) === valor) return ok;
    await tx.insert(produtoPrecos).values({ produtoId, canalId, preco: String(valor), alteradoPor: usuarioId });
    return ok;
  }));
}

export async function salvarMargemAlvoCanal(usuarioId: number, canalId: number, pct: string): Promise<Resultado> {
  const valor = numeroCusto(pct, 95);
  if (!idValido(canalId) || valor === null) return falha("Margem alvo deve estar entre 0 e 95%, com até 2 casas decimais.");
  return gravar(async () => {
    const rows = await getDb().update(canais).set({ margemAlvoPct: String(valor), alteradoPor: usuarioId, alteradoEm: sql`now()` })
      .where(and(eq(canais.id, canalId), eq(canais.ativo, true))).returning({ id: canais.id });
    return rows.length ? ok : falha("Canal não encontrado.");
  });
}

export async function salvarTaxaForma(usuarioId: number, formaId: number, pct: string): Promise<Resultado> {
  const taxa = numeroCusto(pct, 30);
  if (!idValido(formaId) || taxa === null) return falha("Taxa deve estar entre 0 e 30%, com até 2 casas decimais.");
  return gravar(() => getDb().transaction(async (tx) => {
    const [forma] = await tx.select({ id: formasPagamento.id }).from(formasPagamento)
      .where(and(eq(formasPagamento.id, formaId), eq(formasPagamento.ativo, true))).for("update");
    if (!forma) return falha("Forma de pagamento não encontrada.");
    const [atual] = await tx.select({ taxa: formaPagamentoTaxas.taxaPct }).from(formaPagamentoTaxas)
      .where(and(eq(formaPagamentoTaxas.formaId, formaId), lte(formaPagamentoTaxas.vigenteDesde, sql`now()`)))
      .orderBy(desc(formaPagamentoTaxas.vigenteDesde), desc(formaPagamentoTaxas.id)).limit(1);
    if (atual && Number(atual.taxa) === taxa) return ok;
    await tx.insert(formaPagamentoTaxas).values({ formaId, taxaPct: String(taxa), alteradoPor: usuarioId });
    return ok;
  }));
}

export async function alternarFormaCanal(usuarioId: number, canalId: number, formaId: number, aceita: boolean): Promise<Resultado> {
  if (!idValido(canalId) || !idValido(formaId) || typeof aceita !== "boolean") return falha("Canal ou forma inválidos.");
  return gravar(() => getDb().transaction(async (tx) => {
    const [canal] = await tx.select({ id: canais.id }).from(canais).where(and(eq(canais.id, canalId), eq(canais.ativo, true))).for("update");
    const [forma] = await tx.select({ id: formasPagamento.id }).from(formasPagamento).where(and(eq(formasPagamento.id, formaId), eq(formasPagamento.ativo, true)));
    if (!canal || !forma) return falha("Canal ou forma não encontrados.");
    if (aceita) await tx.insert(canalFormas).values({ canalId, formaId }).onConflictDoNothing();
    else {
      const formas = await tx.select({ id: formasPagamento.id }).from(canalFormas)
        .innerJoin(formasPagamento, eq(formasPagamento.id, canalFormas.formaId))
        .where(and(eq(canalFormas.canalId, canalId), eq(formasPagamento.ativo, true)));
      if (!formas.some((f) => f.id !== formaId)) return falha("O canal precisa aceitar ao menos uma forma de pagamento.");
      await tx.delete(canalFormas).where(and(eq(canalFormas.canalId, canalId), eq(canalFormas.formaId, formaId)));
    }
    await tx.update(canais).set({ alteradoEm: sql`now()`, alteradoPor: usuarioId }).where(eq(canais.id, canalId));
    return ok;
  }));
}

export async function salvarImposto(usuarioId: number, pct: string): Promise<Resultado> {
  const valor = numeroCusto(pct, 50, 4);
  if (valor === null) return falha("Imposto deve estar entre 0 e 50%, com até 4 casas decimais.");
  return gravar(async () => {
    await getDb().insert(configuracaoValores).values({ chave: IMPOSTO_CHAVE, valor: String(valor), alteradoPor: usuarioId });
    return ok;
  });
}

/** `semForno` é opcional: ausente mantém o valor gravado (compatível com a tela da etapa 2). */
export async function salvarCustoProduto(_usuarioId: number, id: number, campos: { minutosForno: string; perdaPct: string; semForno?: boolean }): Promise<Resultado> {
  const minutos = numeroCusto(campos?.minutosForno, 999999999999.99);
  const perda = numeroCusto(campos?.perdaPct, PERDA_MAXIMA_PCT);
  const semForno = campos?.semForno;
  if (!idValido(id) || minutos === null || perda === null) return falha("Minutos devem ser não negativos e perda entre 0 e 89,99%, com até 2 casas decimais.");
  if (semForno !== undefined && typeof semForno !== "boolean") return falha("Valor inválido para \"não vai ao forno\".");
  return gravar(async () => {
    const rows = await getDb().update(produtos).set({ minutosForno: String(minutos), perdaPct: String(perda), ...(semForno === undefined ? {} : { semForno }) })
      .where(and(eq(produtos.id, id), eq(produtos.ativo, true))).returning({ id: produtos.id });
    return rows.length ? ok : falha("Produto não encontrado.");
  });
}

/** Grava só a dispensa; o alerta em si é recalculado. Repetir o pedido não muda quem dispensou. */
export async function dispensarAlerta(usuarioId: number, chave: string): Promise<Resultado> {
  if (!lerChaveAlerta(chave)) return falha("Alerta inválido.");
  return gravar(async () => {
    await getDb().insert(alertasDispensados).values({ chave, dispensadoPor: usuarioId }).onConflictDoNothing();
    return ok;
  });
}
