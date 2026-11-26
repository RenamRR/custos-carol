import type { Insumo, Produto } from "./calc";
import { PERDA_MAXIMA_PCT } from "./validacao-custo";

export interface ItemPlano { produtoId: number; fornadas: number }
export type ProdutoProducao = Pick<Produto, "id" | "nome" | "rendimento" | "linhas" | "embalagens"> & { perdaPct: number };
/** Ausência de preço não equivale a um preço explicitamente zero (ADR-004). */
export type InsumoProducao = Omit<Insumo, "preco"> & { preco: number | null };
export interface DadosProduzir { produtos: ProdutoProducao[]; insumos: InsumoProducao[] }
export interface ItemCompra {
  insumoId: number; nome: string; unidade: string; embalagem: string; qtdEmbalagem: number;
  necessario: number; jaTenho: number; comprar: number; pacotes: number | null;
  sobra: number | null; gasto: number | null; custoConsumido: number | null; usadoPor: string[];
}
export interface ProdutoPlanejado {
  produtoId: number; nome: string; fornadas: number; unidadesBoas: number;
  /** Soma das parcelas conhecidas, ingredientes + embalagens. */
  custoConsumido: number; incompleto: boolean;
}
export interface PendenciaProducao { id: string; mensagem: string; href: string; produtoId?: number; insumoId?: number }
export interface ListaCompras {
  produtos: ProdutoPlanejado[]; ingredientes: ItemCompra[]; embalagens: ItemCompra[];
  totais: { gastoMercado: number; custoConsumido: number; unidadesBoas: number; pacotes: number; incompleto: boolean };
  pendencias: PendenciaProducao[];
}

const LIMITE_PRODUTOS = 20;
const idValido = (id: number) => Number.isSafeInteger(id) && id > 0;
const fornadasValidas = (n: number) => Number.isFinite(n) && n >= 0.5 && n <= 50 && Number.isInteger(n * 2);

/** A precisão das quantidades do banco é 4 casas; quando possível, some inteiros. */
function somar(valores: readonly number[], escala = 10000): number {
  const inteiros = valores.map((v) => Math.round(v * escala));
  const total = inteiros.reduce((s, v) => s + v, 0);
  if (Number.isSafeInteger(total) && valores.every((v) => Number.isSafeInteger(v * escala))) return total / escala;
  // Quantidades derivadas podem ter mais casas: soma compensada, sem arredondar a receita.
  let soma = 0, erro = 0;
  for (const v of valores) {
    const parcela = v - erro;
    const proxima = soma + parcela;
    erro = (proxima - soma) - parcela;
    soma = proxima;
  }
  return soma;
}

function agruparPlano(plano: readonly ItemPlano[]): ItemPlano[] {
  const porId = new Map<number, number[]>();
  for (const item of plano) {
    if (!item || !idValido(item.produtoId) || !Number.isFinite(item.fornadas)) continue;
    if (!porId.has(item.produtoId)) {
      if (porId.size === LIMITE_PRODUTOS) continue;
      porId.set(item.produtoId, []);
    }
    porId.get(item.produtoId)!.push(item.fornadas);
  }
  return [...porId].map(([produtoId, valores]) => ({ produtoId, fornadas: somar(valores, 2) }));
}

/** Recebe o valor de searchParams.p já decodificado. Faixa/passo são validados na lista. */
export function parsePlano(query: string): ItemPlano[] {
  if (typeof query !== "string") return [];
  const plano: ItemPlano[] = [];
  for (const trecho of query.split(",")) {
    const match = /^\s*(\d+)\s*:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*$/i.exec(trecho);
    if (match) plano.push({ produtoId: Number(match[1]), fornadas: Number(match[2]) });
  }
  return agruparPlano(plano);
}

/** Forma canônica: IDs ordenados, duplicados somados, zero omitido e ponto decimal. */
export function serializarPlano(plano: readonly ItemPlano[]): string {
  return agruparPlano(plano).filter((p) => p.fornadas !== 0)
    .sort((a, b) => a.produtoId - b.produtoId).map((p) => `${p.produtoId}:${p.fornadas}`).join(",");
}

// ADR-004: micro-unidades inteiras eliminam resíduos em "já tenho" e no ceil.
// Banco (4 casas) × meia fornada precisa de no máximo 5 casas. Custos não são arredondados.
const ESCALA_QTD = 1_000_000;
function quantidadeInteira(valor: number, permitirNegativo = false): number | null {
  if (!Number.isFinite(valor) || (!permitirNegativo && valor < 0)) return null;
  const inteiro = Math.round(valor * ESCALA_QTD);
  return Number.isSafeInteger(inteiro) ? inteiro : null;
}
function somarInteiros(valores: readonly number[]): number | null {
  let total = 0;
  for (const valor of valores) {
    total += valor;
    if (!Number.isSafeInteger(valor) || !Number.isSafeInteger(total)) return null;
  }
  return total;
}

export function listaCompras(plano: readonly ItemPlano[], produtos: readonly ProdutoProducao[], insumos: readonly InsumoProducao[], jaTenho: Readonly<Record<number, number>> = {}): ListaCompras {
  const pendencias: PendenciaProducao[] = [];
  const avisar = (p: PendenciaProducao) => { if (!pendencias.some((a) => a.id === p.id)) pendencias.push(p); };
  const catalogoProdutos = new Map(produtos.map((p) => [p.id, p]));
  const catalogoInsumos = new Map(insumos.map((i) => [i.id, i]));
  const planejados: ProdutoPlanejado[] = [];
  const necessidades = new Map<number, { tipo: Insumo["tipo"]; valores: number[]; usadoPor: Set<string> }>();
  const planoAgrupado = agruparPlano(plano);
  if (new Set(plano.filter((p) => p && idValido(p.produtoId)).map((p) => p.produtoId)).size > LIMITE_PRODUTOS) {
    avisar({ id: "limite-plano", mensagem: "Planeje até 20 produtos por vez.", href: "/produzir" });
  }
  if (plano.some((p) => !p || !idValido(p.produtoId) || !Number.isFinite(p.fornadas))) {
    avisar({ id: "plano-invalido", mensagem: "Há um item inválido no plano.", href: "/produzir" });
  }
  for (const { produtoId, fornadas } of planoAgrupado) {
    const produto = catalogoProdutos.get(produtoId);
    if (!produto) {
      avisar({ id: `produto-${produtoId}`, produtoId, mensagem: `O produto ${produtoId} não está disponível para planejar.`, href: "/produtos" });
      continue;
    }
    if (!fornadasValidas(fornadas)) {
      avisar({ id: `fornadas-${produtoId}`, produtoId, mensagem: `${produto.nome}: use de 0,5 a 50 fornadas, em passos de 0,5.`, href: "/produzir" });
      continue;
    }
    if (!Number.isFinite(produto.rendimento) || produto.rendimento <= 0 || !Number.isFinite(produto.perdaPct) || produto.perdaPct < 0 || produto.perdaPct > PERDA_MAXIMA_PCT) {
      avisar({ id: `receita-${produtoId}`, produtoId, mensagem: `Confira rendimento e perda de ${produto.nome}.`, href: `/produtos/${produtoId}` });
      continue;
    }
    // ADR-004: ingredientes usam receitas inteiras. Embalagens só para unidades inteiras
    // boas; com perda fracionária, ficam abaixo da quantidade teórica de calc.ts.
    const teoricas = produto.rendimento * fornadas * (1 - produto.perdaPct / 100);
    // Corrige apenas erro da representação binária próximo de inteiro, sem mudar a regra floor.
    const unidadesBoas = Math.floor(teoricas + Number.EPSILON * Math.max(1, teoricas) * 4);
    if (!Number.isSafeInteger(unidadesBoas)) {
      avisar({ id: `rendimento-${produtoId}`, produtoId, mensagem: `O rendimento de ${produto.nome} ultrapassa o limite de precisão.`, href: `/produtos/${produtoId}` });
      continue;
    }
    const planejado: ProdutoPlanejado = { produtoId, nome: produto.nome, fornadas, unidadesBoas, custoConsumido: 0, incompleto: false };
    const custos: number[] = [];
    const adicionar = (insumoId: number, qtd: number, tipo: Insumo["tipo"]) => {
      const inteiro = quantidadeInteira(qtd);
      if (inteiro === null) {
        planejado.incompleto = true;
        avisar({ id: `quantidade-${produtoId}-${insumoId}`, produtoId, insumoId, mensagem: `Confira a quantidade do insumo ${insumoId} em ${produto.nome}.`, href: `/produtos/${produtoId}` });
        return;
      }
      if (inteiro === 0) return;
      if (!necessidades.has(insumoId)) necessidades.set(insumoId, { tipo, valores: [], usadoPor: new Set() });
      const necessidade = necessidades.get(insumoId)!;
      necessidade.valores.push(inteiro); necessidade.usadoPor.add(produto.nome);
      const insumo = catalogoInsumos.get(insumoId);
      if (insumo && precoConhecido(insumo)) custos.push(inteiro / quantidadeInteira(insumo.qtd)! * insumo.preco!);
      else planejado.incompleto = true;
    };
    produto.linhas.forEach((l) => adicionar(l.insumoId, l.qtd * fornadas, "ingrediente"));
    produto.embalagens.forEach((e) => adicionar(e.insumoId, e.qtdPorUnidade * unidadesBoas, "embalagem"));
    planejado.custoConsumido = somar(custos);
    planejados.push(planejado);
  }
  const ingredientes: ItemCompra[] = [], embalagens: ItemCompra[] = [];
  for (const [insumoId, necessidade] of necessidades) {
    const insumo = catalogoInsumos.get(insumoId);
    const conhecido = !!insumo && precoConhecido(insumo);
    const necessario = somarInteiros(necessidade.valores);
    const informado = Object.hasOwn(jaTenho, insumoId) ? jaTenho[insumoId] : 0;
    const estoqueInformado = quantidadeInteira(informado);
    const tenho = estoqueInformado ?? 0;
    const tamanho = insumo ? quantidadeInteira(insumo.qtd, true) : null;
    const avisarQuantidade = () => avisar({ id: `quantidade-insumo-${insumoId}`, insumoId, mensagem: `Confira as quantidades de ${insumo?.nome ?? `insumo ${insumoId}`}: valor inválido ou acima do limite de precisão.`, href: "/produzir" });
    // Um erro no campo "já tenho" mantém o insumo visível e considera a compra inteira.
    if (estoqueInformado === null) avisarQuantidade();
    if (necessario === null || (insumo && tamanho === null)) { avisarQuantidade(); continue; }
    const comprar = Math.max(0, necessario - tenho);
    // Ambos inteiros; ceil exato pela divisão inteira, sem aproximação do quociente.
    const pacotes = conhecido ? Math.floor(comprar / tamanho!) + Number(comprar % tamanho! !== 0) : null;
    const comprado = pacotes === null ? null : pacotes * tamanho!;
    if (!Number.isSafeInteger(comprar) || (pacotes !== null && (!Number.isSafeInteger(pacotes) || !Number.isSafeInteger(comprado)))) { avisarQuantidade(); continue; }
    const item: ItemCompra = {
      insumoId, nome: insumo?.nome ?? `Insumo ${insumoId} indisponível`, unidade: insumo?.unidade ?? "",
      embalagem: insumo?.embalagem ?? "", qtdEmbalagem: (tamanho ?? 0) / ESCALA_QTD,
      necessario: necessario / ESCALA_QTD, jaTenho: tenho / ESCALA_QTD, comprar: comprar / ESCALA_QTD, pacotes,
      sobra: comprado === null ? null : (comprado - comprar) / ESCALA_QTD,
      gasto: pacotes === null ? null : pacotes * insumo!.preco!,
      custoConsumido: conhecido ? necessario / tamanho! * insumo.preco! : null,
      usadoPor: [...necessidade.usadoPor],
    };
    if (!conhecido) avisar({ id: `insumo-${insumoId}`, insumoId, mensagem: `Confira preço e tamanho da embalagem de ${item.nome}.`, href: "/insumos" });
    ((insumo?.tipo ?? necessidade.tipo) === "embalagem" ? embalagens : ingredientes).push(item);
  }
  const ordenar = (a: ItemCompra, b: ItemCompra) => a.nome.localeCompare(b.nome, "pt-BR") || a.insumoId - b.insumoId;
  ingredientes.sort(ordenar); embalagens.sort(ordenar);
  const itens = [...ingredientes, ...embalagens];
  const unidadesBoas = somarInteiros(planejados.map((p) => p.unidadesBoas));
  const pacotes = somarInteiros(itens.map((i) => i.pacotes ?? 0));
  if (unidadesBoas === null || pacotes === null) avisar({ id: "totais-precisao", mensagem: "Reduza o plano: a quantidade total ultrapassa o limite de precisão.", href: "/produzir" });
  return {
    produtos: planejados, ingredientes, embalagens, pendencias,
    totais: {
      gastoMercado: somar(itens.map((i) => i.gasto ?? 0)),
      custoConsumido: somar(itens.map((i) => i.custoConsumido ?? 0)),
      unidadesBoas: unidadesBoas ?? 0,
      pacotes: pacotes ?? 0,
      incompleto: pendencias.length > 0 || planejados.some((p) => p.incompleto),
    },
  };
}

function precoConhecido(insumo: InsumoProducao): boolean {
  const tamanho = quantidadeInteira(insumo.qtd);
  return tamanho !== null && tamanho > 0 && insumo.preco !== null && Number.isFinite(insumo.preco) && insumo.preco >= 0;
}
