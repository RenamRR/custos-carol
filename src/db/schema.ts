import { sql } from "drizzle-orm";
import {
  check,
  date,
  pgTable,
  primaryKey,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  boolean,
  index,
  unique,
  jsonb,
  bigint,
} from "drizzle-orm/pg-core";

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  login: text("login").notNull().unique(),
  nome: text("nome").notNull(),
  senhaHash: text("senha_hash").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  falhasLogin: integer("falhas_login").notNull().default(0),
  bloqueadoAte: timestamp("bloqueado_ate", { withTimezone: true }),
}, (t) => [
  check("usuarios_falhas_login_check", sql`${t.falhasLogin} >= 0`),
  check("usuarios_login_normalizado", sql`${t.login} = lower(btrim(${t.login})) and length(${t.login}) between 1 and 100`),
]);

export const sessoes = pgTable("sessoes", {
  id: text("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_sessoes_usuario").on(t.usuarioId)]);

/**
 * Regra do schema: preço NUNCA é coluna mutável.
 *
 * Preço vive só nas tabelas de histórico (`insumo_precos`, `produto_precos`) e o
 * valor "atual" é sempre o registro mais recente. Isso dá a série temporal de graça
 * e evita o cenário em que atualizar o cacau em dezembro reescreve a margem de junho.
 */

/**
 * Catálogo de ingredientes e de materiais de embalagem. Guarda só o que é do
 * material em si: o que vem na embalagem de compra e por quanto.
 *
 * Quanto entra em cada produto é da relação, não do catálogo — ver `receitaLinhas`
 * (ingrediente, por receita) e `produtoEmbalagens` (embalagem, por unidade produzida).
 */
export const insumos = pgTable("insumos", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  /** 'ingrediente' | 'embalagem' */
  tipo: text("tipo").notNull().default("ingrediente"),
  /** Descrição da embalagem de compra, ex. "Pacote 500g". */
  embalagem: text("embalagem").notNull().default(""),
  /** Quanto vem na embalagem de compra. */
  qtd: numeric("qtd", { precision: 14, scale: 4 }).notNull(),
  unidade: text("unidade").notNull().default("g"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const insumoPrecos = pgTable(
  "insumo_precos",
  {
    id: serial("id").primaryKey(),
    insumoId: integer("insumo_id")
      .notNull()
      .references(() => insumos.id, { onDelete: "cascade" }),
    preco: numeric("preco", { precision: 14, scale: 4 }).notNull(),
    /**
     * Etapa 6: o preço é "R$ X por esta qtd". O app nunca informa: o trigger BEFORE INSERT copia
     * `insumos.qtd` (o `default null` aqui só deixa o campo opcional no insert do Drizzle).
     */
    qtdEmbalagem: numeric("qtd_embalagem", { precision: 14, scale: 4 }).notNull().default(sql`null`),
    /** 'preco' (action) | 'embalagem' (trigger de `insumos.qtd`, que repete o preço vigente). */
    origem: text("origem").notNull().default("preco"),
    vigenteDesde: timestamp("vigente_desde", { withTimezone: true }).notNull().defaultNow(),
    nota: text("nota"),
    alteradoPor: integer("alterado_por").references(() => usuarios.id, { onDelete: "set null" }),
  },
  (t) => [index("idx_insumo_precos_lookup").on(t.insumoId, t.vigenteDesde),
    check("insumo_precos_qtd_embalagem_check", sql`${t.qtdEmbalagem} > 0`),
    check("insumo_precos_origem_check", sql`${t.origem} in ('preco', 'embalagem')`)],
);

/**
 * Etapa 6: versões da receita (foto jsonb). Só os triggers da 0007 escrevem aqui
 * (`registrar_versao_receita`); o app só lê.
 */
export const receitaVersoes = pgTable("receita_versoes", {
  id: serial("id").primaryKey(),
  produtoId: integer("produto_id").notNull().references(() => produtos.id, { onDelete: "cascade" }),
  vigenteDesde: timestamp("vigente_desde", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }),
  alteradoPor: integer("alterado_por").references(() => usuarios.id, { onDelete: "set null" }),
  receita: jsonb("receita").notNull(),
  txid: bigint("txid", { mode: "number" }).notNull().default(sql`txid_current()`),
}, (t) => [index("idx_receita_versoes_lookup").on(t.produtoId, t.vigenteDesde.desc(), t.id.desc())]);

export const produtos = pgTable("produtos", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  arquivadoEm: timestamp("arquivado_em", { withTimezone: true }),
  arquivadoPor: integer("arquivado_por").references(() => usuarios.id, { onDelete: "set null" }),
  /** Quantas unidades a receita rende. */
  rendimento: numeric("rendimento", { precision: 14, scale: 4 }).notNull().default("12"),
  markupAlvo: numeric("markup_alvo", { precision: 8, scale: 2 }).notNull().default("3.50"),
  minutosForno: numeric("minutos_forno", { precision: 14, scale: 2 }).notNull().default("0"),
  perdaPct: numeric("perda_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  /** Não vai ao forno: forno vale 0 e não fica pendente (etapa 5). */
  semForno: boolean("sem_forno").notNull().default(false),
  /** Tempo do lote inteiro: bater, assar, esfriar. Não cresce com o rendimento. */
  minutosPreparo: numeric("minutos_preparo", { precision: 14, scale: 2 }).notNull().default("0"),
  /** Tempo por unidade: cortar, embalar, etiquetar. Cresce com o rendimento. */
  minutosAcabamentoUn: numeric("minutos_acabamento_un", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("produtos_minutos_forno_check", sql`${t.minutosForno} >= 0`),
  check("produtos_perda_pct_check", sql`${t.perdaPct} >= 0 and ${t.perdaPct} < 90`),
]);

/**
 * Quanto vale uma hora de trabalho. Histórico pela mesma razão dos preços:
 * reajustar a hora não pode reescrever o custo do passado.
 */
export const custoHora = pgTable(
  "custo_hora",
  {
    id: serial("id").primaryKey(),
    valor: numeric("valor", { precision: 14, scale: 4 }).notNull(),
    vigenteDesde: timestamp("vigente_desde", { withTimezone: true }).notNull().defaultNow(),
    nota: text("nota"),
    alteradoPor: integer("alterado_por").references(() => usuarios.id, { onDelete: "set null" }),
  },
  (t) => [index("idx_custo_hora_lookup").on(t.vigenteDesde)],
);

export const produtoPrecos = pgTable(
  "produto_precos",
  {
    id: serial("id").primaryKey(),
    produtoId: integer("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    canalId: integer("canal_id").references(() => canais.id, { onDelete: "restrict" }),
    preco: numeric("preco", { precision: 14, scale: 4 }).notNull(),
    vigenteDesde: timestamp("vigente_desde", { withTimezone: true }).notNull().defaultNow(),
    nota: text("nota"),
    alteradoPor: integer("alterado_por").references(() => usuarios.id, { onDelete: "set null" }),
  },
  (t) => [
    index("idx_produto_precos_lookup").on(t.produtoId, t.vigenteDesde),
    index("idx_produto_precos_canal").on(t.produtoId, t.canalId, t.vigenteDesde.desc(), t.id.desc()),
  ],
);

export const fornoCustos = pgTable("forno_custos", {
  id: serial("id").primaryKey(),
  precoBotijao: numeric("preco_botijao", { precision: 14, scale: 4 }).notNull(),
  horasPorBotijao: numeric("horas_por_botijao", { precision: 14, scale: 4 }).notNull(),
  vigenteDesde: timestamp("vigente_desde", { withTimezone: true }).notNull().defaultNow(),
  nota: text("nota"),
  alteradoPor: integer("alterado_por").references(() => usuarios.id, { onDelete: "set null" }),
}, (t) => [
  index("idx_forno_custos_vigente").on(t.vigenteDesde.desc(), t.id.desc()),
  check("forno_custos_preco_botijao_check", sql`${t.precoBotijao} >= 0`),
  check("forno_custos_horas_por_botijao_check", sql`${t.horasPorBotijao} > 0`),
]);

export const canais = pgTable("canais", {
  id: serial("id").primaryKey(), nome: text("nome").notNull().unique(),
  margemAlvoPct: numeric("margem_alvo_pct", { precision: 5, scale: 2 }).notNull().default("50"),
  ativo: boolean("ativo").notNull().default(true), ordem: integer("ordem").notNull().default(0),
  alteradoEm: timestamp("alterado_em", { withTimezone: true }).notNull().defaultNow(),
  alteradoPor: integer("alterado_por").references(() => usuarios.id, { onDelete: "set null" }),
}, (t) => [check("canais_margem_alvo_pct_check", sql`${t.margemAlvoPct} between 0 and 95`)]);

export const formasPagamento = pgTable("formas_pagamento", {
  id: serial("id").primaryKey(), nome: text("nome").notNull().unique(),
  ativo: boolean("ativo").notNull().default(true), ordem: integer("ordem").notNull().default(0),
});

export const formaPagamentoTaxas = pgTable("forma_pagamento_taxas", {
  id: serial("id").primaryKey(),
  formaId: integer("forma_id").notNull().references(() => formasPagamento.id, { onDelete: "restrict" }),
  taxaPct: numeric("taxa_pct", { precision: 5, scale: 2 }).notNull(),
  vigenteDesde: timestamp("vigente_desde", { withTimezone: true }).notNull().defaultNow(),
  alteradoPor: integer("alterado_por").references(() => usuarios.id, { onDelete: "set null" }),
}, (t) => [
  index("idx_forma_taxas_vigente").on(t.formaId, t.vigenteDesde.desc(), t.id.desc()),
  check("forma_pagamento_taxas_taxa_pct_check", sql`${t.taxaPct} between 0 and 30`),
]);

export const canalFormas = pgTable("canal_formas", {
  canalId: integer("canal_id").notNull().references(() => canais.id, { onDelete: "cascade" }),
  formaId: integer("forma_id").notNull().references(() => formasPagamento.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.canalId, t.formaId] })]);

export const configuracaoValores = pgTable("configuracao_valores", {
  id: serial("id").primaryKey(), chave: text("chave").notNull(),
  valor: numeric("valor", { precision: 14, scale: 4 }).notNull(),
  vigenteDesde: timestamp("vigente_desde", { withTimezone: true }).notNull().defaultNow(),
  alteradoPor: integer("alterado_por").references(() => usuarios.id, { onDelete: "set null" }),
}, (t) => [
  index("idx_configuracao_valores_vigente").on(t.chave, t.vigenteDesde.desc(), t.id.desc()),
  check("configuracao_imposto_check", sql`${t.chave} <> 'imposto_pct' or ${t.valor} between 0 and 50`),
  check("configuracao_valores_chave_check", sql`${t.chave} in ('imposto_pct')`),
]);

/** Ingrediente na receita. Quantidade é **por receita inteira**. */
export const receitaLinhas = pgTable(
  "receita_linhas",
  {
    id: serial("id").primaryKey(),
    produtoId: integer("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    insumoId: integer("insumo_id")
      .notNull()
      .references(() => insumos.id, { onDelete: "restrict" }),
    qtd: numeric("qtd", { precision: 14, scale: 4 }).notNull(),
    /** Marca uma linha como "conferir" na interface, com o motivo. */
    alerta: text("alerta"),
    ordem: integer("ordem").notNull().default(0),
  },
  (t) => [index("idx_receita_linhas_produto").on(t.produtoId, t.ordem)],
);

/**
 * Material de embalagem usado por um produto. Quantidade é **por unidade produzida**,
 * não por receita — uma marmita leva 1 pote, independente de a receita render 12 ou 16.
 */
export const produtoEmbalagens = pgTable(
  "produto_embalagens",
  {
    id: serial("id").primaryKey(),
    produtoId: integer("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    insumoId: integer("insumo_id")
      .notNull()
      .references(() => insumos.id, { onDelete: "restrict" }),
    qtdPorUnidade: numeric("qtd_por_unidade", { precision: 14, scale: 4 })
      .notNull()
      .default("1"),
    ordem: integer("ordem").notNull().default(0),
  },
  (t) => [
    index("idx_produto_embalagens_produto").on(t.produtoId, t.ordem),
    unique("produto_embalagens_unico").on(t.produtoId, t.insumoId),
  ],
);

export const eventos = pgTable("eventos", {
  id: serial("id").primaryKey(), nome: text("nome").notNull(), data: date("data").notNull(),
  custoFixo: numeric("custo_fixo").notNull().default("0"), nota: text("nota"),
  criadoPor: integer("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  alteradoPor: integer("alterado_por").references(() => usuarios.id, { onDelete: "set null" }),
  alteradoEm: timestamp("alterado_em", { withTimezone: true }),
  canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
  canceladoPor: integer("cancelado_por").references(() => usuarios.id, { onDelete: "set null" }),
}, (t) => [check("eventos_custo_fixo_check", sql`${t.custoFixo} >= 0`)]);

export const vendas = pgTable("vendas", {
  id: serial("id").primaryKey(),
  vendidaEm: timestamp("vendida_em", { withTimezone: true }).notNull().defaultNow(),
  canalId: integer("canal_id").notNull().references(() => canais.id, { onDelete: "restrict" }),
  formaId: integer("forma_id").notNull().references(() => formasPagamento.id, { onDelete: "restrict" }),
  eventoId: integer("evento_id").references(() => eventos.id, { onDelete: "restrict" }),
  taxaPct: numeric("taxa_pct"), impostoPct: numeric("imposto_pct").notNull(), nota: text("nota"),
  criadoPor: integer("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
  canceladaPor: integer("cancelada_por").references(() => usuarios.id, { onDelete: "set null" }),
}, (t) => [
  index("idx_vendas_vendida_em").on(t.vendidaEm).where(sql`${t.canceladaEm} is null`),
  index("idx_vendas_evento").on(t.eventoId),
  check("vendas_taxa_pct_check", sql`${t.taxaPct} between 0 and 30`),
  check("vendas_imposto_pct_check", sql`${t.impostoPct} between 0 and 50`),
]);

export const vendaItens = pgTable("venda_itens", {
  id: serial("id").primaryKey(),
  vendaId: integer("venda_id").notNull().references(() => vendas.id, { onDelete: "cascade" }),
  produtoId: integer("produto_id").notNull().references(() => produtos.id, { onDelete: "restrict" }),
  quantidade: integer("quantidade").notNull(), precoUn: numeric("preco_un").notNull(),
  custoUn: numeric("custo_un").notNull(), produtoNome: text("produto_nome").notNull(),
}, (t) => [
  index("idx_venda_itens_venda").on(t.vendaId),
  index("idx_venda_itens_produto").on(t.produtoId),
  check("venda_itens_quantidade_check", sql`${t.quantidade} between 1 and 999`),
  check("venda_itens_preco_un_check", sql`${t.precoUn} >= 0`),
  check("venda_itens_custo_un_check", sql`${t.custoUn} >= 0`),
]);

/** Etapa 5: alerta de margem é calculado; só o "dispensar" é gravado. */
export const alertasDispensados = pgTable("alertas_dispensados", {
  chave: text("chave").primaryKey(),
  dispensadoPor: integer("dispensado_por").references(() => usuarios.id, { onDelete: "set null" }),
  dispensadoEm: timestamp("dispensado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("alertas_dispensados_chave_check", sql`length(${t.chave}) <= 60`)]);
