import "server-only";
// Interno; as entradas públicas em queries.ts exigem sessão antes de chamar estas leituras.
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { carregarCanais, carregarInsumos, carregarProdutos, type LeitorDb } from "./consultas-db";
import {
  alertasAtivos, alertasMargem, diasAtras, maisSubiram, painelEm, serieInsumo, serieProduto,
  type AlertaMargem, type BaseCusto, type HistoricoInsumo, type HistoricoProduto, type InsumoQueSubiu, type SeriesCusto,
} from "./linha-do-tempo";

type Row<T> = T & Record<string, unknown>;
const ms = (v: unknown) => new Date(v as string | Date).getTime();
const n = (v: unknown) => Number(v);

export const JANELA_ALERTAS_DIAS = 90;
export const JANELA_HISTORICO_DIAS = 365;
export const JANELA_SUBIRAM_DIAS = 90;

/** Todas as séries até agora (a vigência em `desde` precisa do que veio antes da janela). */
export async function carregarSeries(db: LeitorDb): Promise<SeriesCusto> {
  const autor = sql`(select u.nome from usuarios u where u.id = s.alterado_por) as alterado_por`;
  const [insumos, custoHora, forno, taxas, imposto, precos] = await Promise.all([
    db.execute<Row<{ id: number; vigente_desde: string; alterado_por: string | null; insumo_id: number; preco: string }>>(sql`
      select s.id, s.vigente_desde, ${autor}, s.insumo_id, s.preco from insumo_precos s where s.vigente_desde <= now()`),
    db.execute<Row<{ id: number; vigente_desde: string; alterado_por: string | null; valor: string }>>(sql`
      select s.id, s.vigente_desde, ${autor}, s.valor from custo_hora s where s.vigente_desde <= now()`),
    db.execute<Row<{ id: number; vigente_desde: string; alterado_por: string | null; preco_botijao: string; horas_por_botijao: string }>>(sql`
      select s.id, s.vigente_desde, ${autor}, s.preco_botijao, s.horas_por_botijao from forno_custos s where s.vigente_desde <= now()`),
    db.execute<Row<{ id: number; vigente_desde: string; alterado_por: string | null; forma_id: number; taxa_pct: string }>>(sql`
      select s.id, s.vigente_desde, ${autor}, s.forma_id, s.taxa_pct from forma_pagamento_taxas s where s.vigente_desde <= now()`),
    db.execute<Row<{ id: number; vigente_desde: string; alterado_por: string | null; valor: string }>>(sql`
      select s.id, s.vigente_desde, ${autor}, s.valor from configuracao_valores s
      where s.chave = 'imposto_pct' and s.vigente_desde <= now()`),
    db.execute<Row<{ id: number; vigente_desde: string; alterado_por: string | null; produto_id: number; canal_id: number | null; preco: string }>>(sql`
      select s.id, s.vigente_desde, ${autor}, s.produto_id, s.canal_id, s.preco from produto_precos s where s.vigente_desde <= now()`),
  ]);
  const registro = (r: { id: number; vigente_desde: string; alterado_por: string | null }) =>
    ({ id: n(r.id), vigenteDesde: ms(r.vigente_desde), alteradoPor: r.alterado_por ?? null });
  return {
    insumos: Array.from(insumos).map((r) => ({ ...registro(r), insumoId: n(r.insumo_id), preco: n(r.preco) })),
    custoHora: Array.from(custoHora).map((r) => ({ ...registro(r), valor: n(r.valor) })),
    forno: Array.from(forno).map((r) => ({ ...registro(r), precoBotijao: n(r.preco_botijao), horasPorBotijao: n(r.horas_por_botijao) })),
    taxas: Array.from(taxas).map((r) => ({ ...registro(r), formaId: n(r.forma_id), taxaPct: n(r.taxa_pct) })),
    imposto: Array.from(imposto).map((r) => ({ ...registro(r), valor: n(r.valor) })),
    precos: Array.from(precos).map((r) => ({ ...registro(r), produtoId: n(r.produto_id), canalId: r.canal_id === null ? null : n(r.canal_id), preco: n(r.preco) })),
  };
}

/** Receita e catálogos de hoje, pelas mesmas leituras de `carregarPainel()`. */
export async function carregarBase(db: LeitorDb): Promise<BaseCusto> {
  const [produtos, insumos, canais, formas] = await Promise.all([
    carregarProdutos(db), carregarInsumos(db), carregarCanais(db),
    db.execute<Row<{ id: number; nome: string }>>(sql`select id, nome from formas_pagamento`),
  ]);
  return {
    produtos,
    insumos: insumos.map(({ preco: _preco, ...i }) => i),
    canais,
    formas: Array.from(formas).map((f) => ({ id: n(f.id), nome: f.nome })),
  };
}

/** Uma visão consistente (séries, base e o relógio do banco) por leitura. */
async function comHistorico<T>(fn: (dados: { series: SeriesCusto; base: BaseCusto; agora: number; db: LeitorDb }) => Promise<T> | T): Promise<T> {
  return getDb().transaction(async (tx) => {
    const [[relogio], series, base] = await Promise.all([
      tx.execute<Row<{ agora: string }>>(sql`select now() as agora`).then((r) => Array.from(r)),
      carregarSeries(tx), carregarBase(tx),
    ]);
    return fn({ series, base, agora: ms(relogio.agora), db: tx });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

/** Alertas de 90 dias: o mais recente por produto × canal, não dispensado e ainda abaixo da meta hoje. */
export async function carregarAlertas(): Promise<AlertaMargem[]> {
  return comHistorico(async ({ series, base, agora, db }) => {
    const dispensados = new Set(Array.from(await db.execute<Row<{ chave: string }>>(sql`select chave from alertas_dispensados`)).map((r) => r.chave));
    const alertas = alertasMargem(series, base, diasAtras(agora, JANELA_ALERTAS_DIAS), agora);
    return alertasAtivos(alertas, painelEm(series, base, agora), dispensados);
  });
}

/** 12 meses do preço de um insumo (inclusive arquivado). null se o insumo não existe. */
export async function carregarHistoricoInsumo(id: number): Promise<HistoricoInsumo | null> {
  return comHistorico(async ({ series, base, agora, db }) => {
    const [insumo] = Array.from(await db.execute<Row<{ id: number; nome: string; tipo: "ingrediente" | "embalagem"; embalagem: string; qtd: string; unidade: string }>>(sql`
      select id, nome, tipo, embalagem, qtd, unidade from insumos where id = ${id}`));
    if (!insumo) return null;
    const info = { id: n(insumo.id), nome: insumo.nome, tipo: insumo.tipo, embalagem: insumo.embalagem, qtd: n(insumo.qtd), unidade: insumo.unidade };
    // Arquivado não está na base: entra só para dar a quantidade da embalagem.
    const comInsumo: BaseCusto = base.insumos.some((i) => i.id === id) ? base : { ...base, insumos: [...base.insumos, info] };
    return { insumo: info, pontos: serieInsumo(id, series, comInsumo, diasAtras(agora, JANELA_HISTORICO_DIAS), agora) };
  });
}

/** 12 meses de custo/un e margem por canal de um produto ativo. null se não existe ou está arquivado. */
export async function carregarHistoricoProduto(id: number): Promise<HistoricoProduto | null> {
  return comHistorico(({ series, base, agora }) => {
    const produto = base.produtos.find((p) => p.id === id);
    if (!produto) return null;
    return {
      produto: { id: produto.id, nome: produto.nome },
      pontos: serieProduto(id, series, base, diasAtras(agora, JANELA_HISTORICO_DIAS), agora),
      canais: base.canais.map((c) => ({ id: c.id, nome: c.nome, margemAlvoPct: c.margemAlvoPct })),
    };
  });
}

/** Top 3 altas % de insumo ativo nos últimos 90 dias. */
export async function carregarMaisSubiram(): Promise<InsumoQueSubiu[]> {
  return comHistorico(({ series, base, agora }) => maisSubiram(series, base, diasAtras(agora, JANELA_SUBIRAM_DIAS), 3, agora));
}
