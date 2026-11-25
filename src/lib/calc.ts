/**
 * Motor de cálculo de custo. Funções puras sobre números — sem banco, sem React.
 * `calc.test.ts` confere a saída contra os números da planilha da Carol.
 *
 * Três escalas convivem e é o ponto onde é fácil errar:
 *   - ingrediente        → por RECEITA INTEIRA   (135g de cacau para 12 unidades)
 *   - embalagem          → por UNIDADE PRODUZIDA (1 saquinho por brownie)
 *   - mão de obra        → preparo por LOTE + acabamento por UNIDADE
 */

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
  linhas: LinhaReceita[];
  embalagens: LinhaEmbalagem[];
}

export type TipoSegmento = "ingrediente" | "embalagem" | "mao-de-obra";

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
 * custeia: energia, perda, taxa de cartão, imposto e rateio de custo fixo.
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
  const custoEmbalagemPorUnidade = embalagemPorUnidade(produto, insumos);
  const custoEmbalagem = custoEmbalagemPorUnidade * rendimento;

  const minutosLote = minutosDoLote(produto, rendimento);
  const custoMaoDeObra = (minutosLote / 60) * custoHora;

  const custoDireto = custoInsumos + custoEmbalagem;
  const custoTotal = custoDireto + custoMaoDeObra;
  const custoUnitario = custoTotal / rendimento;
  const precoVenda = produto.precoVenda;

  if (custoEmbalagem > 0) {
    segmentos.push({ nome: "Embalagem", valor: custoEmbalagem, tipo: "embalagem" });
  }
  if (custoMaoDeObra > 0) {
    segmentos.push({ nome: "Mão de obra", valor: custoMaoDeObra, tipo: "mao-de-obra" });
  }

  const custoDiretoUnitario = custoDireto / rendimento;

  return {
    produtoId: produto.id,
    nome: produto.nome,
    segmentos,
    custoInsumos,
    custoEmbalagem,
    custoEmbalagemPorUnidade,
    custoMaoDeObra,
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
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** `numeric` do Postgres chega como string no driver — converte sem perder precisão de leitura. */
export function num(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  const n = typeof valor === "number" ? valor : Number.parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
}
