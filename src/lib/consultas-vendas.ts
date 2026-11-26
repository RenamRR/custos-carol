import "server-only";
import { and, asc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { canais, eventos, formasPagamento, vendas, vendaItens } from "../db/schema";
import { carregarPainel } from "./consultas-db";
import { CANAL_FEIRA, detalharVendas, diaSaoPaulo, limitesMes, resumoMes, somarDias, type DadosHoje, type DadosMes, type DadosVender, type Evento, type Venda } from "./vendas";

const iso = (d: Date | null) => d?.toISOString() ?? null;
const eventoPublico = (e: typeof eventos.$inferSelect): Evento => ({ ...e, custoFixo: Number(e.custoFixo), criadoEm: e.criadoEm.toISOString(), alteradoEm: iso(e.alteradoEm), canceladoEm: iso(e.canceladoEm) });
export async function carregarVender(): Promise<DadosVender> {
  const hoje = diaSaoPaulo();
  return getDb().transaction(async (tx) => {
    const painel = await carregarPainel(tx);
    const rows = await tx.select().from(eventos).where(and(isNull(eventos.canceladoEm), gte(eventos.data, hoje), lte(eventos.data, somarDias(hoje, 7)))).orderBy(eventos.data, eventos.id);
    return { hoje, produtos: painel.produtos.map(({ produto, resultado }) => ({ id: produto.id, nome: produto.nome, custoUn: resultado.custoUnitario, precosPorCanal: produto.precosPorCanal })), canais: painel.canais, eventos: rows.map(eventoPublico), impostoPct: painel.config.impostoPct };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function carregarMes(ano: number, mes: number): Promise<DadosMes> {
  const { inicio, fim } = limitesMes(ano, mes);
  return getDb().transaction(async (tx) => {
    // Datas civis são convertidas pelo Postgres com o fuso explícito, nunca pelo host.
    const periodo = and(gte(vendas.vendidaEm, sql`${inicio}::date::timestamp at time zone 'America/Sao_Paulo'`), lt(vendas.vendidaEm, sql`${fim}::date::timestamp at time zone 'America/Sao_Paulo'`));
    const rows = await tx.select({ venda: vendas, canalNome: canais.nome, formaNome: formasPagamento.nome }).from(vendas)
      .innerJoin(canais, eq(canais.id, vendas.canalId)).innerJoin(formasPagamento, eq(formasPagamento.id, vendas.formaId))
      .where(periodo).orderBy(sql`${vendas.vendidaEm} desc`, sql`${vendas.id} desc`);
    const itens = await tx.select({ item: vendaItens }).from(vendaItens).innerJoin(vendas, eq(vendas.id, vendaItens.vendaId)).where(periodo).orderBy(asc(vendaItens.id));
    const eventosRows = await tx.select().from(eventos).where(and(gte(eventos.data, inicio), lt(eventos.data, fim))).orderBy(eventos.data, eventos.id);
    const [feira] = await tx.select({ id: canais.id }).from(canais).where(eq(canais.nome, CANAL_FEIRA));
    const lista: Venda[] = rows.map(({ venda: v, canalNome, formaNome }) => ({ ...v, canalNome, formaNome, vendidaEm: v.vendidaEm.toISOString(), criadoEm: v.criadoEm.toISOString(), canceladaEm: iso(v.canceladaEm), taxaPct: v.taxaPct === null ? null : Number(v.taxaPct), impostoPct: Number(v.impostoPct), itens: itens.filter(({ item }) => item.vendaId === v.id).map(({ item }) => ({ ...item, precoUn: Number(item.precoUn), custoUn: Number(item.custoUn) })) }));
    const listaEventos = eventosRows.map(eventoPublico);
    return { ano, mes, resumo: resumoMes(lista, listaEventos, feira?.id), vendas: detalharVendas(lista, listaEventos), eventos: listaEventos };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function carregarHoje(): Promise<DadosHoje> {
  const hoje = diaSaoPaulo();
  const [ano, mes] = hoje.split("-").map(Number);
  const dados = await carregarMes(ano, mes);
  return { hoje, ano, mes, totais: dados.resumo.totais, porCanal: dados.resumo.porCanal, vendas: dados.vendas.filter((v) => diaSaoPaulo(v.vendidaEm) === hoje) };
}
