import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";

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
    vigenteDesde: timestamp("vigente_desde", { withTimezone: true }).notNull().defaultNow(),
    nota: text("nota"),
  },
  (t) => [index("idx_insumo_precos_lookup").on(t.insumoId, t.vigenteDesde)],
);

export const produtos = pgTable("produtos", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  /** Quantas unidades a receita rende. */
  rendimento: numeric("rendimento", { precision: 14, scale: 4 }).notNull().default("12"),
  markupAlvo: numeric("markup_alvo", { precision: 8, scale: 2 }).notNull().default("3.50"),
  /** Tempo do lote inteiro: bater, assar, esfriar. Não cresce com o rendimento. */
  minutosPreparo: numeric("minutos_preparo", { precision: 14, scale: 2 }).notNull().default("0"),
  /** Tempo por unidade: cortar, embalar, etiquetar. Cresce com o rendimento. */
  minutosAcabamentoUn: numeric("minutos_acabamento_un", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

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
    preco: numeric("preco", { precision: 14, scale: 4 }).notNull(),
    vigenteDesde: timestamp("vigente_desde", { withTimezone: true }).notNull().defaultNow(),
    nota: text("nota"),
  },
  (t) => [index("idx_produto_precos_lookup").on(t.produtoId, t.vigenteDesde)],
);

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
