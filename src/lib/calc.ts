/**
 * Motor de cálculo de custo. Funções puras sobre números — sem banco, sem React.
 * `calc.test.ts` confere a saída contra os números da planilha da Carol.
 *
 * Três escalas convivem e é o ponto onde é fácil errar:
 *   - ingrediente        → por RECEITA INTEIRA   (135g de cacau para 12 unidades)
 *   - embalagem          → por UNIDADE PRODUZIDA (1 saquinho por brownie)
 *   - mão de obra        → preparo por LOTE + acabamento por UNIDADE
 */

import type { Canal, Forno, Pendencia, ProdutoCompleto, ResumoCanal } from "./custo-completo";
import { PERDA_MAXIMA_PCT, pontoEhMilhar } from "./validacao-custo";

export type TipoInsumo = "ingrediente" | "embalagem";

export interface Insumo {
  id: number;
  nome: string;
  tipo: TipoInsumo;
  embalagem: string;
  /** Quanto vem na embalagem de compra. */
  qtd: number;
  unidade: string;
  /** Preço vigente da embalagem de compra. */
  preco: number;
}

export interface LinhaReceita {
  id: number;
  insumoId: number;
  /** Por receita inteira. */
  qtd: number;
  alerta: string | null;
}

export interface LinhaEmbalagem {
  id: number;
  insumoId: number;
  /** Por unidade produzida. */
  qtdPorUnidade: number;
}

export interface Produto {
  id: number;
  nome: string;
  rendimento: number;
  markupAlvo: number;
  /** Preço de venda vigente. */
  precoVenda: number;
  /** Minutos do lote inteiro — não cresce com o rendimento. */
  minutosPreparo: number;
  /** Minutos por unidade — cresce com o rendimento. */
  minutosAcabamentoUn: number;
  /** Opcionais só para compatibilidade com fixtures/consumidores da etapa 1. */
  minutosForno?: number;
  perdaPct?: number;
  /** Não vai ao forno: forno vale 0 e não entra em "falta preencher" (etapa 5). */
  semForno?: boolean;
  linhas: LinhaReceita[];
  embalagens: LinhaEmbalagem[];
}

export type TipoSegmento = "ingrediente" | "embalagem" | "mao-de-obra" | "forno" | "perda";

export interface Segmento {
  nome: string;
  valor: number;
  tipo: TipoSegmento;
}

export interface ResultadoProduto {
  produtoId: number;
  nome: string;
  segmentos: Segmento[];
  custoInsumos: number;
  custoEmbalagem: number;
  custoEmbalagemPorUnidade: number;
  custoMaoDeObra: number;
  custoForno: number;
  /** Parcela do lote realocada ao segmento Perda; não é somada novamente ao total. */
  custoPerda: number;
  custoPerdaPorUnidade: number;
  unidadesBoas: number;
  minutosLote: number;
  /** Insumo + embalagem, sem mão de obra. */
  custoDireto: number;
  custoTotal: number;
  rendimento: number;
  custoUnitario: number;
  precoVenda: number;
  margem: number;
  margemPct: number;
  /** Sobre insumo + embalagem apenas — comparável com a época sem mão de obra. */
  markup: number;
  precoSugerido: number;
}

export type Nivel = "good" | "warn" | "crit";

/** Custo de uma unidade de medida do insumo (por grama, por unidade, por metro). */
export function custoPorUnidadeDeMedida(insumo: Pick<Insumo, "qtd" | "preco">): number {
  return insumo.qtd > 0 ? insumo.preco / insumo.qtd : 0;
}

/**
 * Custo de embalagem de UM produto, por unidade produzida.
 *
 * Só entra o que o produto declarou usar. Antes isto somava o catálogo inteiro e
 * aplicava a todos os produtos, o que fazia uma marmita pagar tag, saquinho e sizal.
 */
export function embalagemPorUnidade(produto: Produto, insumos: Insumo[]): number {
  const porId = new Map(insumos.map((i) => [i.id, i]));
  return produto.embalagens.reduce((acc, e) => {
    const insumo = porId.get(e.insumoId);
    return insumo ? acc + custoPorUnidadeDeMedida(insumo) * e.qtdPorUnidade : acc;
  }, 0);
}

/** Minutos totais do lote: preparo (fixo) + acabamento × rendimento (variável). */
export function minutosDoLote(produto: Produto, rendimento: number): number {
  return produto.minutosPreparo + produto.minutosAcabamentoUn * rendimento;
}

/**
 * Margem de contribuição: quanto sobra do preço depois de insumo, embalagem e mão de obra.
 *
 * O corte é exigente porque o que sobra ainda precisa pagar o que este sistema não
 * custeia, como o rateio do custo fixo do evento (etapa 3).
 */
export function nivelMargem(margemPct: number): Nivel {
  if (margemPct >= 50) return "good";
  if (margemPct >= 35) return "warn";
  return "crit";
}

/** Mantido para leitura secundária: markup sobre custo direto, sem mão de obra. */
export function nivelMarkup(markup: number): Nivel {
  if (markup >= 3.5) return "good";
  if (markup >= 2.5) return "warn";
  return "crit";
}

export function calcularProduto(
  produto: Produto,
  insumos: Insumo[],
  custoHora = 0,
  custoMinutoForno = 0,
): ResultadoProduto {
  const porId = new Map(insumos.map((i) => [i.id, i]));
  const segmentos: Segmento[] = [];
  let custoInsumos = 0;

  for (const linha of produto.linhas) {
    const insumo = porId.get(linha.insumoId);
    const valor = insumo ? custoPorUnidadeDeMedida(insumo) * linha.qtd : 0;
    custoInsumos += valor;
    segmentos.push({ nome: insumo?.nome ?? "—", valor, tipo: "ingrediente" });
  }

  const rendimento = produto.rendimento > 0 ? produto.rendimento : 1;
  const perdaPct = produto.perdaPct ?? 0;
  if (!Number.isFinite(perdaPct) || perdaPct < 0 || perdaPct > PERDA_MAXIMA_PCT) throw new RangeError("Perda inválida.");
  const fracaoBoa = 1 - perdaPct / 100;
  const unidadesBoas = rendimento * fracaoBoa;
  const custoEmbalagemPorUnidade = embalagemPorUnidade(produto, insumos);
  const custoEmbalagem = custoEmbalagemPorUnidade * unidadesBoas;

  const minutosLote = minutosDoLote(produto, unidadesBoas);
  const custoMaoDeObra = (minutosLote / 60) * custoHora;
  const custoPreparo = (produto.minutosPreparo / 60) * custoHora;
  const custoForno = produto.semForno ? 0 : (produto.minutosForno ?? 0) * custoMinutoForno;
  const custoPerda = (custoInsumos + custoPreparo + custoForno) * (perdaPct / 100);
  // ADR-002: decompõe o mesmo lote, sem cobrar a perda duas vezes.
  for (const segmento of segmentos) segmento.valor *= fracaoBoa;

  const custoDireto = custoInsumos + custoEmbalagem;
  const custoTotal = custoDireto + custoMaoDeObra + custoForno;
  const custoUnitario = custoTotal / unidadesBoas;
  const precoVenda = produto.precoVenda;

  if (custoEmbalagem > 0) {
    segmentos.push({ nome: "Embalagem", valor: custoEmbalagem, tipo: "embalagem" });
  }
  if (custoMaoDeObra > 0) {
    segmentos.push({ nome: "Mão de obra", valor: custoMaoDeObra - custoPreparo * (perdaPct / 100), tipo: "mao-de-obra" });
  }
  if (custoForno > 0) segmentos.push({ nome: "Forno", valor: custoForno * fracaoBoa, tipo: "forno" });
  if (custoPerda > 0) segmentos.push({ nome: "Perda", valor: custoPerda, tipo: "perda" });

  const custoDiretoUnitario = custoDireto / unidadesBoas;

  return {
    produtoId: produto.id,
    nome: produto.nome,
    segmentos,
    custoInsumos,
    custoEmbalagem,
    custoEmbalagemPorUnidade,
    custoMaoDeObra,
    custoForno,
    custoPerda,
    custoPerdaPorUnidade: custoPerda / unidadesBoas,
    unidadesBoas,
    minutosLote,
    custoDireto,
    custoTotal,
    rendimento,
    custoUnitario,
    precoVenda,
    margem: precoVenda - custoUnitario,
    margemPct: precoVenda > 0 ? ((precoVenda - custoUnitario) / precoVenda) * 100 : 0,
    markup: custoDiretoUnitario > 0 ? precoVenda / custoDiretoUnitario : 0,
    precoSugerido: custoUnitario * produto.markupAlvo,
  };
}

export function margemNoCanal(custoUn: number, preco: number, taxaPct: number, impostoPct: number) {
  const margem = preco - custoUn - preco * (taxaPct + impostoPct) / 100;
  const margemPct = preco > 0 ? margem / preco * 100 : 0;
  return { margem, margemPct, nivel: nivelMargem(margemPct) };
}

export function precoSugerido(custoUn: number, margemAlvoPct: number, taxaPct: number, impostoPct: number): number | null {
  if (![custoUn, margemAlvoPct, taxaPct, impostoPct].every((v) => Number.isFinite(v) && v >= 0)) return null;
  const divisor = 1 - (margemAlvoPct + taxaPct + impostoPct) / 100;
  return divisor > 0 ? custoUn / divisor : null;
}

export function resumoCanais(produto: ProdutoCompleto, custoUn: number, canais: Canal[], impostoPct: number): ResumoCanal[] {
  return canais.filter((c) => c.ativo).map((canal) => {
    const formas = canal.formas.filter((f) => f.ativo);
    // Só taxas informadas disputam o "pior caso". Forma sem taxa não vira "Pix 0%": vai para
    // formasSemTaxa, e a tela avisa que a margem ainda não a considera.
    const conhecidas = formas.filter((f): f is typeof f & { taxaPct: number } => f.taxaPct !== null);
    const maisCara = conhecidas.reduce<(typeof conhecidas)[number] | null>((atual, forma) =>
      !atual || forma.taxaPct > atual.taxaPct ? forma : atual, null);
    const taxaPct = maisCara?.taxaPct ?? 0;
    const formasSemTaxa = formas.filter((f) => f.taxaPct === null).map((f) => f.nome);
    const preco = produto.precosPorCanal.find((p) => p.canalId === canal.id);
    const valor = preco?.preco ?? produto.precoVenda;
    return {
      canalId: canal.id, nome: canal.nome, preco: valor, precoHerdado: preco?.herdado ?? true,
      taxaPct, formaMaisCara: maisCara?.nome ?? null, formasSemTaxa,
      ...margemNoCanal(custoUn, valor, taxaPct, impostoPct),
      precoSugerido: precoSugerido(custoUn, canal.margemAlvoPct, taxaPct, impostoPct),
    };
  });
}

export function faltaPreencher(produtos: ProdutoCompleto[], custoHora: number, forno: Forno, canais: Canal[]): Pendencia[] {
  const itens: Pendencia[] = [];
  if (custoHora === 0) itens.push({ id: "hora", mensagem: "Informe o valor da hora de trabalho", href: "/mais#mao-de-obra" });
  if (!forno.informado) itens.push({ id: "forno", mensagem: "Informe o preço e a duração do botijão", href: "/mais#forno" });
  for (const produto of produtos) {
    if (!produto.semForno && produto.minutosForno === 0) itens.push({ id: `forno-${produto.id}`, mensagem: `Informe os minutos de forno de ${produto.nome}`, href: `/produtos/${produto.id}#forno` });
  }
  const desconhecidas = new Map<number, string>();
  for (const canal of canais.filter((c) => c.ativo)) {
    if (!canal.formas.some((f) => f.ativo)) itens.push({ id: `formas-${canal.id}`, mensagem: `Selecione uma forma de pagamento para ${canal.nome}`, href: "/mais#canais" });
    for (const forma of canal.formas.filter((f) => f.ativo)) {
      if (forma.taxaPct === null) desconhecidas.set(forma.id, forma.nome);
    }
  }
  for (const [id, nome] of desconhecidas) itens.push({ id: `taxa-${id}`, mensagem: `Informe a taxa de ${nome}`, href: "/mais#formas-pagamento" });
  return itens;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL4 = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export const brl = (n: number): string => BRL.format(n);
export const brl4 = (n: number): string => BRL4.format(n);

/** "95" → "1h35". Minutos com fração viram o inteiro mais próximo. */
export function formatarMinutos(min: number): string {
  const total = Math.round(min);
  if (total < 60) return `${total}min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Aceita "30,00", "30.00", "R$ 1.234,56". */
export function parseNumeroBR(valor: string | number): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  let s = valor.replace(/[R$\s]/g, "").trim();
  if (!s) return 0;
  if (s.includes(",") || pontoEhMilhar(s)) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** `numeric` do Postgres chega como string no driver — converte sem perder precisão de leitura. */
export function num(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  const n = typeof valor === "number" ? valor : Number.parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
}
