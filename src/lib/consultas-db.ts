import "server-only";
// Sem auth: acesso interno usado somente por queries.ts e scripts CLI administrativos.
// Telas devem importar queries.ts, que exige sessão antes de acessar o banco.
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { calcularProduto, faltaPreencher, resumoCanais, num, type Insumo, type Produto, type TipoInsumo } from "@/lib/calc";
import type { Canal, Config, FormaPagamento, Forno, Painel, ProdutoCompleto } from "./custo-completo";

/**
 * Preço vigente = registro mais recente do histórico. O desempate por `id desc`
 * importa: duas alterações no mesmo instante (seed, importação em lote) teriam o
 * mesmo `vigente_desde`, e sem ele a "atual" seria arbitrária.
 */

/** `db.execute<T>` do Drizzle exige um tipo indexável; isso mantém as interfaces limpas. */
type Row<T> = T & Record<string, unknown>;
export type LeitorDb = Pick<ReturnType<typeof getDb>, "execute">;

interface LinhaInsumo {
  id: number;
  nome: string;
  tipo: string;
  embalagem: string;
  qtd: string;
  unidade: string;
  preco: string | null;
}

export async function carregarInsumos(db: LeitorDb = getDb()): Promise<Insumo[]> {
  const rows = await db.execute<Row<LinhaInsumo>>(sql`
    select
      i.id, i.nome, i.tipo, i.embalagem, i.qtd, i.unidade,
      p.preco
    from insumos i
    left join lateral (
      select ip.preco
      from insumo_precos ip
      where ip.insumo_id = i.id and ip.vigente_desde <= now()
      order by ip.vigente_desde desc, ip.id desc
      limit 1
    ) p on true
    where i.ativo
    order by (i.tipo = 'embalagem'), i.nome
  `);

  return Array.from(rows).map((r) => ({
    id: r.id,
    nome: r.nome,
    tipo: r.tipo as TipoInsumo,
    embalagem: r.embalagem,
    qtd: num(r.qtd),
    unidade: r.unidade,
    preco: num(r.preco),
  }));
}

/** Valor da hora vigente. Zero significa "ainda não definido" — mão de obra não entra. */
export async function carregarCustoHora(db: LeitorDb = getDb()): Promise<number> {
  const rows = await db.execute<Row<{ valor: string }>>(sql`
    select valor from custo_hora where vigente_desde <= now() order by vigente_desde desc, id desc limit 1
  `);
  const [linha] = Array.from(rows);
  return linha ? num(linha.valor) : 0;
}

interface LinhaProduto {
  id: number;
  nome: string;
  rendimento: string;
  markup_alvo: string;
  minutos_preparo: string;
  minutos_acabamento_un: string;
  minutos_forno: string;
  perda_pct: string;
  preco_venda: string | null;
}

interface LinhaReceitaRow {
  id: number;
  produto_id: number;
  insumo_id: number;
  qtd: string;
  alerta: string | null;
}

interface LinhaEmbalagemRow {
  id: number;
  produto_id: number;
  insumo_id: number;
  qtd_por_unidade: string;
}

export async function carregarProdutos(db: LeitorDb = getDb()): Promise<ProdutoCompleto[]> {

  const produtosRows = await db.execute<Row<LinhaProduto>>(sql`
    select
      pr.id, pr.nome, pr.rendimento, pr.markup_alvo,
      pr.minutos_preparo, pr.minutos_acabamento_un, pr.minutos_forno, pr.perda_pct,
      pv.preco as preco_venda
    from produtos pr
    left join lateral (
      select pp.preco
      from produto_precos pp
      where pp.produto_id = pr.id and pp.canal_id is null and pp.vigente_desde <= now()
      order by pp.vigente_desde desc, pp.id desc
      limit 1
    ) pv on true
    where pr.ativo
    order by pr.id
  `);

  const precosCanal = await db.execute<Row<{ produto_id: number; canal_id: number; preco: string | null; herdado: boolean }>>(sql`
    select p.id as produto_id, c.id as canal_id, coalesce(pc.preco, pg.preco) as preco,
      pc.id is null as herdado
    from produtos p cross join canais c
    left join lateral (
      select pp.id, pp.preco from produto_precos pp
      where pp.produto_id = p.id and pp.canal_id = c.id and pp.vigente_desde <= now()
      order by pp.vigente_desde desc, pp.id desc limit 1
    ) pc on true
    left join lateral (
      select pp.preco from produto_precos pp
      where pp.produto_id = p.id and pp.canal_id is null and pp.vigente_desde <= now()
      order by pp.vigente_desde desc, pp.id desc limit 1
    ) pg on true
    where p.ativo and c.ativo order by p.id, c.ordem, c.id
  `);

  const linhasRows = await db.execute<Row<LinhaReceitaRow>>(sql`
    select rl.id, rl.produto_id, rl.insumo_id, rl.qtd, rl.alerta
    from receita_linhas rl
    join produtos pr on pr.id = rl.produto_id
    where pr.ativo
    order by rl.produto_id, rl.ordem, rl.id
  `);

  const embalagensRows = await db.execute<Row<LinhaEmbalagemRow>>(sql`
    select pe.id, pe.produto_id, pe.insumo_id, pe.qtd_por_unidade
    from produto_embalagens pe
    join produtos pr on pr.id = pe.produto_id
    where pr.ativo
    order by pe.produto_id, pe.ordem, pe.id
  `);

  const linhasPorProduto = new Map<number, Produto["linhas"]>();
  for (const l of Array.from(linhasRows)) {
    const lista = linhasPorProduto.get(l.produto_id) ?? [];
    lista.push({ id: l.id, insumoId: l.insumo_id, qtd: num(l.qtd), alerta: l.alerta });
    linhasPorProduto.set(l.produto_id, lista);
  }

  const embalagensPorProduto = new Map<number, Produto["embalagens"]>();
  for (const e of Array.from(embalagensRows)) {
    const lista = embalagensPorProduto.get(e.produto_id) ?? [];
    lista.push({ id: e.id, insumoId: e.insumo_id, qtdPorUnidade: num(e.qtd_por_unidade) });
    embalagensPorProduto.set(e.produto_id, lista);
  }

  return Array.from(produtosRows).map((p) => ({
    id: p.id,
    nome: p.nome,
    rendimento: num(p.rendimento),
    markupAlvo: num(p.markup_alvo),
    minutosPreparo: num(p.minutos_preparo),
    minutosAcabamentoUn: num(p.minutos_acabamento_un),
    minutosForno: num(p.minutos_forno),
    perdaPct: num(p.perda_pct),
    precosPorCanal: Array.from(precosCanal).filter((c) => c.produto_id === p.id)
      .map((c) => ({ canalId: c.canal_id, preco: num(c.preco), herdado: c.herdado })),
    precoVenda: num(p.preco_venda),
    linhas: linhasPorProduto.get(p.id) ?? [],
    embalagens: embalagensPorProduto.get(p.id) ?? [],
  }));
}

export async function carregarForno(db: LeitorDb = getDb()): Promise<Forno> {
  const rows = await db.execute<Row<{ preco_botijao: string; horas_por_botijao: string }>>(sql`
    select preco_botijao, horas_por_botijao from forno_custos
    where vigente_desde <= now() order by vigente_desde desc, id desc limit 1
  `);
  const precoBotijao = num(rows[0]?.preco_botijao);
  const horasPorBotijao = num(rows[0]?.horas_por_botijao);
  const custoHora = horasPorBotijao > 0 ? precoBotijao / horasPorBotijao : 0;
  return { precoBotijao, horasPorBotijao, custoHora, custoMinuto: custoHora / 60, informado: rows.length > 0 };
}

export async function carregarFormasPagamento(db: LeitorDb = getDb()): Promise<FormaPagamento[]> {
  const rows = await db.execute<Row<{ id: number; nome: string; ativo: boolean; ordem: number; taxa_pct: string | null }>>(sql`
    select f.id, f.nome, f.ativo, f.ordem, t.taxa_pct from formas_pagamento f
    left join lateral (
      select taxa_pct from forma_pagamento_taxas t where t.forma_id = f.id and t.vigente_desde <= now()
      order by vigente_desde desc, id desc limit 1
    ) t on true where f.ativo order by f.ordem, f.id
  `);
  return Array.from(rows).map((r) => ({ id: r.id, nome: r.nome, ativo: r.ativo, ordem: r.ordem, taxaPct: r.taxa_pct === null ? null : num(r.taxa_pct) }));
}

export async function carregarCanais(db: LeitorDb = getDb()): Promise<Canal[]> {
  const [formas, rows, vinculos] = await Promise.all([
    carregarFormasPagamento(db),
    db.execute<Row<{ id: number; nome: string; margem_alvo_pct: string; ativo: boolean; ordem: number }>>(sql`
      select id, nome, margem_alvo_pct, ativo, ordem from canais where ativo order by ordem, id`),
    db.execute<Row<{ canal_id: number; forma_id: number }>>(sql`select canal_id, forma_id from canal_formas`),
  ]);
  return Array.from(rows).map((r) => ({
    id: r.id, nome: r.nome, margemAlvoPct: num(r.margem_alvo_pct), ativo: r.ativo, ordem: r.ordem,
    formas: formas.filter((f) => vinculos.some((v) => v.canal_id === r.id && v.forma_id === f.id)),
  }));
}

export async function carregarConfig(db: LeitorDb = getDb()): Promise<Config> {
  const rows = await db.execute<Row<{ valor: string }>>(sql`
    select valor from configuracao_valores where chave = 'imposto_pct' and vigente_desde <= now()
    order by vigente_desde desc, id desc limit 1
  `);
  return { impostoPct: num(rows[0]?.valor) };
}

export async function carregarPainel(db: LeitorDb = getDb()): Promise<Painel> {
  const [produtos, insumos, custoHora, forno, canais, formasPagamento, config] = await Promise.all([
    carregarProdutos(db), carregarInsumos(db), carregarCustoHora(db), carregarForno(db),
    carregarCanais(db), carregarFormasPagamento(db), carregarConfig(db),
  ]);
  return {
    produtos: produtos.map((produto) => {
      const resultado = calcularProduto(produto, insumos, custoHora, forno.custoMinuto);
      return { produto, resultado, canais: resumoCanais(produto, resultado.custoUnitario, canais, config.impostoPct) };
    }),
    insumos, custoHora, forno, canais, formasPagamento, config,
    faltaPreencher: faltaPreencher(produtos, custoHora, forno, canais),
  };
}

export interface PontoHistorico {
  insumoId: number;
  nome: string;
  preco: number;
  vigenteDesde: Date;
  alteradoPor: string | null;
}

/** Usado no stage 3 (série de custo no tempo). Já disponível porque o schema guarda tudo. */
export async function carregarHistoricoPrecos(desde?: Date): Promise<PontoHistorico[]> {
  const db = getDb();
  const corte = desde ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const rows = await db.execute<
    Row<{ insumo_id: number; nome: string; preco: string; vigente_desde: string; alterado_por: string | null }>
  >(sql`
    select ip.insumo_id, i.nome, ip.preco, ip.vigente_desde, u.nome as alterado_por
    from insumo_precos ip
    join insumos i on i.id = ip.insumo_id
    left join usuarios u on u.id = ip.alterado_por
    where ip.vigente_desde >= ${corte.toISOString()}::timestamptz
    order by ip.insumo_id, ip.vigente_desde
  `);

  return Array.from(rows).map((r) => ({
    insumoId: r.insumo_id,
    nome: r.nome,
    preco: num(r.preco),
    vigenteDesde: new Date(r.vigente_desde),
    alteradoPor: r.alterado_por,
  }));
}
