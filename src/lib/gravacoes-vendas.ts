import "server-only";
// Interno: usuarioId só vem de actions.ts, após exigirUsuario().
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { canais, eventos, formasPagamento, produtos, vendas, vendaItens } from "../db/schema";
import type { Resultado } from "../app/actions";
import { carregarPainel } from "./consultas-db";
import { comAutor } from "./autoria";
import { idValido, numeroCusto } from "./validacao-custo";
import { CANAL_FEIRA, dataCivilValida, diaSaoPaulo, instanteVenda, type EntradaEvento, type EntradaVenda, type ResultadoEvento, type ResultadoVenda } from "./vendas";

const ok = { ok: true } as const;
const falha = (erro: string) => ({ ok: false, erro } as const);
async function gravar<T extends { ok: boolean }>(acao: () => Promise<T>): Promise<T | { ok: false; erro: string }> {
  try { return await acao(); }
  catch { return falha("Não foi possível salvar. Atualize a tela e tente novamente."); }
}
function notaValida(nota: unknown): boolean { return nota === undefined || (typeof nota === "string" && nota.length <= 2000); }

export async function registrarVenda(usuarioId: number, entrada: EntradaVenda): Promise<ResultadoVenda> {
  if (!entrada || !idValido(entrada.canalId) || !idValido(entrada.formaId) || (entrada.eventoId != null && !idValido(entrada.eventoId)) || !notaValida(entrada.nota)) return falha("Dados da venda inválidos.");
  const vendidaEm = instanteVenda(entrada.vendidaEm);
  if (!vendidaEm) return falha("Informe uma data válida nos últimos 60 dias, sem data futura.");
  if (!Array.isArray(entrada.itens) || !entrada.itens.length || entrada.itens.length > 100) return falha("Informe de 1 a 100 itens.");
  const itens = entrada.itens.map((i) => ({ ...i, valor: typeof i?.precoUn === "string" ? numeroCusto(i.precoUn, 9999999999.99) : null }));
  if (itens.some((i) => !idValido(i.produtoId) || !Number.isInteger(i.quantidade) || i.quantidade < 1 || i.quantidade > 999 || i.valor === null)) return falha("Confira produto, quantidade (1 a 999) e preço não negativo com até 2 casas decimais.");
  return gravar(() => getDb().transaction(async (tx) => {
    // Mesmo lock usado em salvar/cancelarEvento. Não pode vender enquanto cancelam a feira.
    if (entrada.eventoId != null) {
      const [evento] = await tx.select().from(eventos).where(eq(eventos.id, entrada.eventoId)).for("update");
      if (!evento || evento.canceladoEm) return falha("Feira não encontrada ou cancelada.");
      if (evento.data !== diaSaoPaulo(vendidaEm)) return falha("A feira deve ser do mesmo dia da venda.");
    }
    // Compartilha o lock de alternarFormaCanal; estabiliza as formas aceitas.
    await tx.select({ id: canais.id }).from(canais).where(eq(canais.id, entrada.canalId)).for("update");
    // Impede salvarTaxaForma de publicar outra taxa enquanto este snapshot é registrado.
    await tx.select({ id: formasPagamento.id }).from(formasPagamento).where(eq(formasPagamento.id, entrada.formaId)).for("share");
    const ids = [...new Set(itens.map((i) => i.produtoId))].sort((a, b) => a - b);
    await tx.select({ id: produtos.id }).from(produtos).where(inArray(produtos.id, ids)).orderBy(produtos.id).for("update");
    // Uma única visão consistente de receita, preços e taxas, no registro (ADR-003).
    const painel = await carregarPainel(tx);
    const canal = painel.canais.find((c) => c.id === entrada.canalId);
    const forma = canal?.formas.find((f) => f.id === entrada.formaId);
    if (!canal || !forma) return falha("O canal não aceita essa forma de pagamento.");
    if (entrada.eventoId != null && canal.nome !== CANAL_FEIRA) return falha("Somente vendas no canal Feira podem ter evento.");
    const snapshots = itens.map((i) => ({ item: i, produto: painel.produtos.find((p) => p.produto.id === i.produtoId) }));
    if (snapshots.some((s) => !s.produto || !Number.isFinite(s.produto.resultado.custoUnitario) || s.produto.resultado.custoUnitario < 0)) return falha("Produto indisponível ou custo inválido. Atualize a tela.");
    const [venda] = await tx.insert(vendas).values({ canalId: canal.id, formaId: forma.id, eventoId: entrada.eventoId ?? null, vendidaEm, taxaPct: forma.taxaPct === null ? null : String(forma.taxaPct), impostoPct: String(painel.config.impostoPct), nota: entrada.nota?.trim() || null, criadoPor: usuarioId }).returning({ id: vendas.id });
    const linhas = snapshots.map(({ item, produto }) => ({ vendaId: venda.id, produtoId: item.produtoId, produtoNome: produto!.produto.nome, quantidade: item.quantidade, precoUn: String(item.valor), custoUn: String(produto!.resultado.custoUnitario) }));
    await tx.insert(vendaItens).values(linhas);
    const itensComCusto = linhas.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, custoUn: Number(i.custoUn) }));
    const unidades = itensComCusto.reduce((s, i) => s + i.quantidade, 0);
    return { ok: true as const, vendaId: venda.id, itensComCusto, custoUnMedio: itensComCusto.reduce((s, i) => s + i.quantidade * i.custoUn, 0) / unidades };
  }, { isolationLevel: "repeatable read" }));
}
export async function cancelarVenda(usuarioId: number, vendaId: number): Promise<Resultado> {
  if (!idValido(vendaId)) return falha("Venda inválida.");
  return gravar(() => getDb().transaction(async (tx) => {
    const [venda] = await tx.select().from(vendas).where(eq(vendas.id, vendaId)).for("update");
    if (!venda) return falha("Venda não encontrada.");
    if (venda.canceladaEm) return ok;
    await tx.update(vendas).set({ canceladaEm: sql`now()`, canceladaPor: usuarioId }).where(eq(vendas.id, vendaId));
    return ok;
  }));
}
function validarEvento(entrada: EntradaEvento) {
  if (!entrada || typeof entrada.nome !== "string" || !entrada.nome.trim() || entrada.nome.trim().length > 200 || !dataCivilValida(entrada.data) || !notaValida(entrada.nota)) return null;
  const custoFixo = typeof entrada.custoFixo === "string" ? numeroCusto(entrada.custoFixo, 9999999999.99) : null;
  if (custoFixo === null) return null;
  return { nome: entrada.nome.trim(), data: entrada.data, custoFixo: String(custoFixo), nota: entrada.nota?.trim() || null };
}
export async function criarEvento(usuarioId: number, entrada: EntradaEvento): Promise<ResultadoEvento> {
  const campos = validarEvento(entrada);
  if (!campos) return falha("Confira nome, data e custo da feira (não negativo, até 2 casas decimais).");
  return gravar(async () => {
    const [evento] = await getDb().insert(eventos).values({ ...campos, criadoPor: usuarioId }).returning({ id: eventos.id });
    return { ok: true as const, eventoId: evento.id };
  });
}
export async function salvarEvento(usuarioId: number, id: number, entrada: EntradaEvento): Promise<Resultado> {
  const campos = validarEvento(entrada);
  if (!idValido(id) || !campos) return falha("Confira nome, data e custo da feira.");
  return gravar(() => getDb().transaction(async (tx) => {
    const [evento] = await tx.select().from(eventos).where(eq(eventos.id, id)).for("update");
    if (!evento || evento.canceladoEm) return falha("Feira não encontrada ou cancelada.");
    if (evento.data !== campos.data) {
      const [ativa] = await tx.select({ id: vendas.id }).from(vendas).where(and(eq(vendas.eventoId, id), isNull(vendas.canceladaEm))).limit(1);
      if (ativa) return falha("Cancele as vendas antes de mudar a data da feira.");
    }
    await tx.update(eventos).set({ ...campos, alteradoPor: usuarioId, alteradoEm: sql`now()` }).where(eq(eventos.id, id));
    return ok;
  }));
}
export async function cancelarEvento(usuarioId: number, id: number): Promise<Resultado> {
  if (!idValido(id)) return falha("Feira inválida.");
  return gravar(() => getDb().transaction(async (tx) => {
    const [evento] = await tx.select().from(eventos).where(eq(eventos.id, id)).for("update");
    if (!evento) return falha("Feira não encontrada.");
    if (evento.canceladoEm) return ok;
    const [ativa] = await tx.select({ id: vendas.id }).from(vendas).where(and(eq(vendas.eventoId, id), isNull(vendas.canceladaEm))).limit(1);
    if (ativa) return falha("Cancele as vendas antes de cancelar a feira.");
    await tx.update(eventos).set({ canceladoPor: usuarioId, canceladoEm: sql`now()` }).where(eq(eventos.id, id));
    return ok;
  }));
}
export async function removerProduto(usuarioId: number, id: number): Promise<Resultado> {
  if (!idValido(id)) return falha("Produto inválido.");
  return gravar(() => comAutor(usuarioId, async (tx) => {
    const [produto] = await tx.select().from(produtos).where(eq(produtos.id, id)).for("update");
    if (!produto) return falha("Produto não encontrado.");
    const [item] = await tx.select({ id: vendaItens.id }).from(vendaItens).where(eq(vendaItens.produtoId, id)).limit(1);
    if (item) {
      if (produto.ativo) await tx.update(produtos).set({ ativo: false, arquivadoPor: usuarioId, arquivadoEm: sql`now()` }).where(eq(produtos.id, id));
    } else await tx.delete(produtos).where(eq(produtos.id, id));
    return ok;
  }));
}
