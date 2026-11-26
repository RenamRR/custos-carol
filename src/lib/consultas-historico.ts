import "server-only";
// Interno; as entradas públicas em queries.ts exigem sessão antes de chamar estas leituras.
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { carregarCanais, carregarProdutos, type LeitorDb } from "./consultas-db";
import { num, type TipoInsumo } from "./calc";
import {
  alertasAtivos, alertasMargem, diasAtras, historicoReceita, maisSubiram, painelEm, serieInsumo, serieProduto,
  type AlertaMargem, type BaseCusto, type FotoReceita, type HistoricoInsumo, type HistoricoProduto, type InsumoQueSubiu,
  type SeriesCusto, type VersaoReceita,
} from "./linha-do-tempo";

type Row<T> = T & Record<string, unknown>;
const ms = (v: unknown) => new Date(v as string | Date).getTime();
const n = (v: unknown) => Number(v);

export const JANELA_ALERTAS_DIAS = 90;
export const JANELA_HISTORICO_DIAS = 365;
export const JANELA_SUBIRAM_DIAS = 90;

/**
 * Lê a foto gravada pelo banco no formato do contrato, com as chaves na ordem de `FotoReceita`.
 * O jsonb guarda numeric com escala ("12.0000"): aqui vira número.
 */
export function lerFoto(valor: unknown): FotoReceita {
  const r = (typeof valor === "string" ? JSON.parse(valor) : valor) as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  const x = (v: unknown) => num(v as string | number | null | undefined);
  return {
    rendimento: x(r.rendimento), minutosPreparo: x(r.minutosPreparo), minutosAcabamentoUn: x(r.minutosAcabamentoUn),
    minutosForno: x(r.minutosForno), perdaPct: x(r.perdaPct), semForno: r.semForno === true,
    linhas: lista(r.linhas).map((l) => ({ insumoId: x(l.insumoId), qtd: x(l.qtd) })),
    embalagens: lista(r.embalagens).map((e) => ({ insumoId: x(e.insumoId), qtdPorUnidade: x(e.qtdPorUnidade) })),
  };
}

/** Todas as séries até agora (a vigência em `desde` precisa do que veio antes da janela). */
export async function carregarSeries(db: LeitorDb): Promise<SeriesCusto> {
  const autor = sql`(select u.nome from usuarios u where u.id = s.alterado_por) as alterado_por`;
  const [insumos, custoHora, forno, taxas, imposto, precos, receitas] = await Promise.all([
    db.execute<Row<{ id: number; vigente_desde: string; alterado_por: string | null; insumo_id: number; preco: string; qtd_embalagem: string }>>(sql`
      select s.id, s.vigente_desde, ${autor}, s.insumo_id, s.preco, s.qtd_embalagem from insumo_precos s where s.vigente_desde <= now()`),
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
    db.execute<Row<{ id: number; vigente_desde: string; alterado_por: string | null; produto_id: number; receita: unknown }>>(sql`
      select s.id, s.vigente_desde, ${autor}, s.produto_id, s.receita from receita_versoes s where s.vigente_desde <= now()`),
  ]);
  const registro = (r: { id: number; vigente_desde: string; alterado_por: string | null }) =>
    ({ id: n(r.id), vigenteDesde: ms(r.vigente_desde), alteradoPor: r.alterado_por ?? null });
  return {
    insumos: Array.from(insumos).map((r) => ({ ...registro(r), insumoId: n(r.insumo_id), preco: n(r.preco), qtdEmbalagem: n(r.qtd_embalagem) })),
    custoHora: Array.from(custoHora).map((r) => ({ ...registro(r), valor: n(r.valor) })),
    forno: Array.from(forno).map((r) => ({ ...registro(r), precoBotijao: n(r.preco_botijao), horasPorBotijao: n(r.horas_por_botijao) })),
    taxas: Array.from(taxas).map((r) => ({ ...registro(r), formaId: n(r.forma_id), taxaPct: n(r.taxa_pct) })),
    imposto: Array.from(imposto).map((r) => ({ ...registro(r), valor: n(r.valor) })),
    precos: Array.from(precos).map((r) => ({ ...registro(r), produtoId: n(r.produto_id), canalId: r.canal_id === null ? null : n(r.canal_id), preco: n(r.preco) })),
    receitas: Array.from(receitas).map((r) => ({ ...registro(r), produtoId: n(r.produto_id), receita: lerFoto(r.receita) })),
  };
}

/**
 * Produtos ativos e canais pelas mesmas leituras de `carregarPainel()`; insumos TODOS (inclusive
 * arquivados: a receita do passado pode usá-los), na ordem de `carregarInsumos()`.
 */
export async function carregarBase(db: LeitorDb): Promise<BaseCusto> {
  const [produtos, insumos, canais, formas] = await Promise.all([
    carregarProdutos(db),
    db.execute<Row<{ id: number; nome: string; tipo: string; embalagem: string; qtd: string; unidade: string; ativo: boolean }>>(sql`
      select id, nome, tipo, embalagem, qtd, unidade, ativo from insumos order by (tipo = 'embalagem'), nome, id`),
    carregarCanais(db),
    db.execute<Row<{ id: number; nome: string }>>(sql`select id, nome from formas_pagamento`),
  ]);
  return {
    produtos,
    insumos: Array.from(insumos).map((i) => ({
      id: n(i.id), nome: i.nome, tipo: i.tipo as TipoInsumo, embalagem: i.embalagem, qtd: num(i.qtd), unidade: i.unidade, ativo: i.ativo === true,
    })),
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
  return comHistorico(({ series, base, agora }) => {
    const insumo = base.insumos.find((i) => i.id === id);
    if (!insumo) return null;
    const { ativo: _ativo, ...info } = insumo;
    return { insumo: info, pontos: serieInsumo(id, series, base, diasAtras(agora, JANELA_HISTORICO_DIAS), agora) };
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

/** Versões da receita de um produto ativo, da mais recente para a mais antiga. null se não existe ou está arquivado. */
export async function carregarHistoricoReceita(id: number): Promise<VersaoReceita[] | null> {
  return comHistorico(({ series, base }) => historicoReceita(id, series, base));
}

/**
 * Check do db:verify: para cada produto (inclusive arquivado), a última versão da receita tem que
 * ser igual à foto montada AQUI, em TypeScript, das tabelas (não pela função do banco, para o
 * check não conferir o trigger com ele mesmo). Devolve os que divergem.
 */
export async function receitasDivergentes(db: LeitorDb = getDb()): Promise<{ produtoId: number; nome: string; motivo: string }[]> {
  const [produtos, linhas, embalagens, ultimas] = await Promise.all([
    db.execute<Row<{ id: number; nome: string; rendimento: string; minutos_preparo: string; minutos_acabamento_un: string; minutos_forno: string; perda_pct: string; sem_forno: boolean }>>(sql`
      select id, nome, rendimento, minutos_preparo, minutos_acabamento_un, minutos_forno, perda_pct, sem_forno from produtos order by id`),
    db.execute<Row<{ produto_id: number; insumo_id: number; qtd: string }>>(sql`
      select produto_id, insumo_id, qtd from receita_linhas order by produto_id, insumo_id, id`),
    db.execute<Row<{ produto_id: number; insumo_id: number; qtd_por_unidade: string }>>(sql`
      select produto_id, insumo_id, qtd_por_unidade from produto_embalagens order by produto_id, insumo_id, id`),
    db.execute<Row<{ produto_id: number; receita: unknown }>>(sql`
      select distinct on (produto_id) produto_id, receita from receita_versoes order by produto_id, vigente_desde desc, id desc`),
  ]);
  const ultima = new Map(Array.from(ultimas).map((u) => [n(u.produto_id), lerFoto(u.receita)]));
  const divergentes: { produtoId: number; nome: string; motivo: string }[] = [];
  for (const p of Array.from(produtos)) {
    const id = n(p.id);
    const foto: FotoReceita = {
      rendimento: num(p.rendimento), minutosPreparo: num(p.minutos_preparo), minutosAcabamentoUn: num(p.minutos_acabamento_un),
      minutosForno: num(p.minutos_forno), perdaPct: num(p.perda_pct), semForno: p.sem_forno === true,
      linhas: Array.from(linhas).filter((l) => n(l.produto_id) === id).map((l) => ({ insumoId: n(l.insumo_id), qtd: num(l.qtd) })),
      embalagens: Array.from(embalagens).filter((e) => n(e.produto_id) === id).map((e) => ({ insumoId: n(e.insumo_id), qtdPorUnidade: num(e.qtd_por_unidade) })),
    };
    const gravada = ultima.get(id);
    if (!gravada) divergentes.push({ produtoId: id, nome: p.nome, motivo: "sem nenhuma versão da receita" });
    else if (JSON.stringify(gravada) !== JSON.stringify(foto)) divergentes.push({ produtoId: id, nome: p.nome, motivo: "última versão difere das tabelas" });
  }
  return divergentes;
}
