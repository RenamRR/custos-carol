/**
 * Linha do tempo do custo (etapas 5 e 6). Funções puras: sem banco, sem React.
 *
 * Custo no passado = receita vigente naquela data (versões em `receita_versoes`) × valores das
 * séries vigentes naquela data. Produto sem versão em T não existe em T. A embalagem de compra
 * também tem histórico: cada preço de insumo é "R$ X por `qtdEmbalagem`".
 *
 * Nada de fórmula nova: `painelEm` monta o mesmo formato que `carregarPainel()` monta e
 * passa por `calcularProduto` + `resumoCanais`. Vigente = maior `vigenteDesde ≤ T`, com
 * desempate pelo maior `id`, a mesma regra das queries.
 */
import { calcularProduto, resumoCanais, type Insumo } from "./calc";
import type { Canal, Forno, ProdutoCompleto, ProdutoPainel } from "./custo-completo";

/* ---------------- contrato ---------------- */

export type TipoCausa = "insumo" | "hora" | "forno" | "taxa" | "imposto" | "preco" | "receita";

/**
 * Uma série que mudou num instante.
 * - insumo: preço da embalagem de compra (R$), com `qtdDe`/`qtdPara` (tamanho da embalagem);
 *   entra se o preço OU a embalagem mudou;
 * - receita: custo/un do produto antes/depois, com `mudancas` (o diff) e `preenchimento`;
 * - hora: valor da hora de trabalho (R$);
 * - forno: custo por hora de forno (R$/h = botijão ÷ horas);
 * - taxa: % da forma de pagamento;
 * - imposto: % sobre a venda;
 * - preco: preço de venda (R$) do produto no canal; `canalId` null = preço geral.
 * `de` null = a série não tinha valor antes (primeiro preenchimento).
 */
export interface CausaMudanca {
  tipo: TipoCausa;
  nome: string;
  de: number | null;
  para: number;
  alteradoPor: string | null;
  insumoId?: number;
  formaId?: number;
  produtoId?: number;
  canalId?: number | null;
  /** Só em `insumo`: unidade de medida do insumo (g, ml, un…), para "500 g → 1.000 g". */
  unidade?: string;
  /** Só em `insumo`: embalagem de compra antes (ausente se `de` é null) e depois. */
  qtdDe?: number;
  qtdPara?: number;
  /** Só em `receita`. */
  mudancas?: MudancaReceita[];
  /** Só em `receita`: as únicas diferenças são números que estavam em 0 e passaram a ter valor. */
  preenchimento?: boolean;
}
export interface InstanteMudanca { instante: string; causas: CausaMudanca[] }

export interface PontoInsumo { instante: string; preco: number; precoPorUnidade: number; qtdEmbalagem: number; alteradoPor: string | null }
export interface PontoCanalProduto { canalId: number; preco: number; margemPct: number }
/** Série em degrau: o valor vale do `instante` até o próximo ponto. */
export interface PontoProduto { instante: string; custoUn: number; canais: PontoCanalProduto[]; causas: CausaMudanca[] }

export interface AlertaMargem {
  /** `<instante ISO>|<produtoId>|<canalId>`: é o que `dispensarAlerta` recebe. */
  chave: string;
  instante: string;
  produtoId: number; produto: string;
  canalId: number; canal: string;
  /** Margem % antes (T − 1 ms) e depois (T). */
  de: number; para: number;
  /** `margem_alvo_pct` atual do canal. */
  meta: number;
  causas: CausaMudanca[];
}

export interface InsumoQueSubiu { insumoId: number; nome: string; unidade: string; de: number; para: number; qtdDe: number; qtdPara: number; variacaoPct: number }

/** Foto da receita gravada pelo banco (`foto_receita()`): linhas e embalagens por (insumo, id). */
export interface FotoReceita {
  rendimento: number; minutosPreparo: number; minutosAcabamentoUn: number; minutosForno: number;
  perdaPct: number; semForno: boolean;
  linhas: { insumoId: number; qtd: number }[];
  embalagens: { insumoId: number; qtdPorUnidade: number }[];
}
/** Diff entre duas fotos. Em ingrediente/embalagem, null = adicionado ou removido; insumo repetido soma. */
export type MudancaReceita =
  | { campo: "rendimento" | "minutosPreparo" | "minutosAcabamentoUn" | "minutosForno" | "perdaPct" | "semForno"; de: number | boolean; para: number | boolean }
  | { campo: "ingrediente" | "embalagem"; insumoId: number; nome: string; unidade: string; de: number | null; para: number | null };
/** Uma versão do "Histórico da receita". `custoUn` = custo/un com esta receita em `vigenteDesde`. */
export interface VersaoReceita {
  id: number; vigenteDesde: string; alteradoPor: string | null; receita: FotoReceita;
  linhas: (FotoReceita["linhas"][number] & { nome: string; unidade: string })[];
  embalagens: (FotoReceita["embalagens"][number] & { nome: string; unidade: string })[];
  custoUn: number;
  /**
   * Custo/un com a versão ANTERIOR no mesmo instante desta (mesmos preços): `custoAntes → custoUn`
   * é só o efeito da mudança na receita. null na linha de base.
   */
  custoAntes: number | null;
  mudancas: MudancaReceita[]; preenchimento: boolean;
}

export interface HistoricoInsumo {
  insumo: { id: number; nome: string; tipo: Insumo["tipo"]; embalagem: string; qtd: number; unidade: string };
  pontos: PontoInsumo[];
}
export interface HistoricoProduto {
  produto: { id: number; nome: string };
  pontos: PontoProduto[];
  canais: { id: number; nome: string; margemAlvoPct: number }[];
}

/* ---------------- séries cruas ---------------- */

/** `vigenteDesde` em ms desde a época; `alteradoPor` é o nome do usuário. */
interface Registro { id: number; vigenteDesde: number; alteradoPor: string | null }
export interface SeriesCusto {
  insumos: (Registro & { insumoId: number; preco: number; qtdEmbalagem: number })[];
  custoHora: (Registro & { valor: number })[];
  forno: (Registro & { precoBotijao: number; horasPorBotijao: number })[];
  taxas: (Registro & { formaId: number; taxaPct: number })[];
  imposto: (Registro & { valor: number })[];
  /** `canalId` null = preço geral. */
  precos: (Registro & { produtoId: number; canalId: number | null; preco: number })[];
  receitas: (Registro & { produtoId: number; receita: FotoReceita })[];
}

/**
 * O que não muda no tempo: produtos ativos (id, nome, markup) e catálogos. A receita, os preços,
 * as taxas e os valores que vierem aqui são ignorados: `estadoEm` os troca pelos vigentes em T.
 */
export interface BaseCusto {
  produtos: ProdutoCompleto[];
  /** Todos os insumos, inclusive arquivados (a receita do passado pode usá-los). */
  insumos: (Omit<Insumo, "preco"> & { ativo: boolean })[];
  /** Canais ativos com as formas aceitas e ativas, e a meta atual. */
  canais: Canal[];
  /** Nomes das formas de pagamento (inclusive as que nenhum canal aceita). */
  formas: { id: number; nome: string }[];
}

export interface EstadoCusto {
  produtos: ProdutoCompleto[];
  insumos: Insumo[];
  custoHora: number;
  forno: Forno;
  canais: Canal[];
  impostoPct: number;
}

/* ---------------- vigência ---------------- */

const DIA_MS = 24 * 60 * 60 * 1000;
const posterior = (a: Registro, b: Registro) => a.vigenteDesde > b.vigenteDesde || (a.vigenteDesde === b.vigenteDesde && a.id > b.id);

/** Registro vigente em T: maior vigenteDesde ≤ T, desempate pelo maior id. */
function vigente<R extends Registro>(registros: readonly R[], t: number, filtro?: (r: R) => boolean): R | null {
  let melhor: R | null = null;
  for (const r of registros) {
    if (r.vigenteDesde > t || (filtro && !filtro(r))) continue;
    if (!melhor || posterior(r, melhor)) melhor = r;
  }
  return melhor;
}

function fornoDe(r: SeriesCusto["forno"][number] | null): Forno {
  const precoBotijao = r?.precoBotijao ?? 0;
  const horasPorBotijao = r?.horasPorBotijao ?? 0;
  const custoHora = horasPorBotijao > 0 ? precoBotijao / horasPorBotijao : 0;
  return { precoBotijao, horasPorBotijao, custoHora, custoMinuto: custoHora / 60, informado: r !== null };
}

/** A receita da foto sobre o produto base (id, nome, markup e preços continuam do produto). */
export function aplicarReceita(produto: ProdutoCompleto, r: FotoReceita): ProdutoCompleto {
  return {
    ...produto,
    rendimento: r.rendimento, minutosPreparo: r.minutosPreparo, minutosAcabamentoUn: r.minutosAcabamentoUn,
    minutosForno: r.minutosForno, perdaPct: r.perdaPct, semForno: r.semForno,
    linhas: r.linhas.map((l, i) => ({ id: i + 1, insumoId: l.insumoId, qtd: l.qtd, alerta: null })),
    embalagens: r.embalagens.map((e, i) => ({ id: i + 1, insumoId: e.insumoId, qtdPorUnidade: e.qtdPorUnidade })),
  };
}

const receitaEm = (series: SeriesCusto, produtoId: number, t: number) => vigente(series.receitas, t, (r) => r.produtoId === produtoId);

/**
 * Mesmo formato e mesmos defaults das queries de hoje ("não informado" = 0, taxa = null).
 * Receita = versão vigente em T; produto sem versão em T fica fora. Embalagem de compra = a do
 * preço vigente (sem preço, a do catálogo).
 */
export function estadoEm(series: SeriesCusto, base: BaseCusto, t: number): EstadoCusto {
  const insumos: Insumo[] = base.insumos.map(({ ativo: _ativo, ...i }) => {
    const preco = vigente(series.insumos, t, (r) => r.insumoId === i.id);
    return { ...i, qtd: preco?.qtdEmbalagem ?? i.qtd, preco: preco?.preco ?? 0 };
  });
  const canais: Canal[] = base.canais.map((c) => ({
    ...c,
    formas: c.formas.map((f) => ({ ...f, taxaPct: vigente(series.taxas, t, (r) => r.formaId === f.id)?.taxaPct ?? null })),
  }));
  const produtos: ProdutoCompleto[] = base.produtos.flatMap((baseProduto) => {
    const versao = receitaEm(series, baseProduto.id, t);
    if (!versao) return [];
    const p = aplicarReceita(baseProduto, versao.receita);
    const geral = vigente(series.precos, t, (r) => r.produtoId === p.id && r.canalId === null);
    return [{
      ...p,
      precoVenda: geral?.preco ?? 0,
      precosPorCanal: base.canais.map((c) => {
        const proprio = vigente(series.precos, t, (r) => r.produtoId === p.id && r.canalId === c.id);
        return { canalId: c.id, preco: (proprio ?? geral)?.preco ?? 0, herdado: proprio === null };
      }),
    }];
  });
  return {
    produtos, insumos, canais,
    custoHora: vigente(series.custoHora, t)?.valor ?? 0,
    forno: fornoDe(vigente(series.forno, t)),
    impostoPct: vigente(series.imposto, t)?.valor ?? 0,
  };
}

/** O que `carregarPainel()` daria em T (só a parte por produto). */
export function painelEm(series: SeriesCusto, base: BaseCusto, t: number): ProdutoPainel[] {
  const e = estadoEm(series, base, t);
  return e.produtos.map((produto) => {
    const resultado = calcularProduto(produto, e.insumos, e.custoHora, e.forno.custoMinuto);
    return { produto, resultado, canais: resumoCanais(produto, resultado.custoUnitario, e.canais, e.impostoPct) };
  });
}

/** Custo/un de um produto ativo em T com uma receita dada (a vigente, se omitida). null se não existe em T. */
function custoUnEm(series: SeriesCusto, base: BaseCusto, produtoId: number, t: number, receita?: FotoReceita): number | null {
  const produto = base.produtos.find((p) => p.id === produtoId);
  const foto = receita ?? receitaEm(series, produtoId, t)?.receita;
  if (!produto || !foto) return null;
  const e = estadoEm(series, { ...base, produtos: [] }, t);
  return calcularProduto(aplicarReceita(produto, foto), e.insumos, e.custoHora, e.forno.custoMinuto).custoUnitario;
}

/* ---------------- diff da receita ---------------- */

const CAMPOS_RECEITA = ["rendimento", "minutosPreparo", "minutosAcabamentoUn", "minutosForno", "perdaPct", "semForno"] as const;
const diferente = (a: number, b: number) => Math.abs(a - b) > 1e-9;

/** Campos na ordem fixa; depois ingredientes e embalagens por nome (e id). Insumo repetido soma. */
export function diffReceita(de: FotoReceita, para: FotoReceita, insumos: BaseCusto["insumos"]): MudancaReceita[] {
  const mudancas: MudancaReceita[] = [];
  for (const campo of CAMPOS_RECEITA) {
    const a = de[campo], b = para[campo];
    if (typeof a === "number" && typeof b === "number" ? diferente(a, b) : a !== b) mudancas.push({ campo, de: a, para: b });
  }
  const info = new Map(insumos.map((i) => [i.id, i]));
  const somar = (itens: { insumoId: number; qtd: number }[]) => {
    const m = new Map<number, number>();
    for (const i of itens) m.set(i.insumoId, (m.get(i.insumoId) ?? 0) + i.qtd);
    return m;
  };
  const comparar = (campo: "ingrediente" | "embalagem", antes: Map<number, number>, depois: Map<number, number>) => {
    const ids = [...new Set([...antes.keys(), ...depois.keys()])].sort((x, y) =>
      (info.get(x)?.nome ?? "").localeCompare(info.get(y)?.nome ?? "", "pt-BR") || x - y);
    for (const insumoId of ids) {
      const a = antes.get(insumoId) ?? null, b = depois.get(insumoId) ?? null;
      if (a !== null && b !== null && !diferente(a, b)) continue;
      const i = info.get(insumoId);
      mudancas.push({ campo, insumoId, nome: i?.nome ?? `Insumo ${insumoId}`, unidade: i?.unidade ?? "", de: a, para: b });
    }
  };
  comparar("ingrediente", somar(de.linhas), somar(para.linhas));
  const embalagens = (f: FotoReceita) => somar(f.embalagens.map((e) => ({ insumoId: e.insumoId, qtd: e.qtdPorUnidade })));
  comparar("embalagem", embalagens(de), embalagens(para));
  return mudancas;
}

/** Preencher não é mudar: só números (campo, ou qtd de item que já estava na receita) que estavam em 0 e passaram a ter valor. */
export function ehPreenchimento(mudancas: readonly MudancaReceita[]): boolean {
  return mudancas.length > 0 && mudancas.every((m) => m.campo !== "semForno" && m.de === 0 && typeof m.para === "number" && m.para > 0);
}

/* ---------------- mudanças ---------------- */

const iso = (t: number) => new Date(t).toISOString();

/**
 * Instantes T com desde < T ≤ ate em que alguma série mudou, em ordem cronológica. Registros
 * no mesmo instante exato viram um instante só; a mesma série com dois registros em T conta
 * uma vez, com o vencedor do desempate. `de` = valor efetivo em T − 1 ms.
 */
export function instantesDeMudanca(series: SeriesCusto, base: BaseCusto, desde: number, ate = Number.POSITIVE_INFINITY): InstanteMudanca[] {
  const infoInsumo = new Map(base.insumos.map((i) => [i.id, i]));
  const nomeForma = new Map(base.formas.map((f) => [f.id, f.nome]));
  const nomeProduto = new Map(base.produtos.map((p) => [p.id, p.nome]));
  const nomeCanal = new Map(base.canais.map((c) => [c.id, c.nome]));
  const dentro = (r: Registro) => r.vigenteDesde > desde && r.vigenteDesde <= ate;
  const instantes = new Set<number>();
  for (const lista of [series.insumos, series.custoHora, series.forno, series.taxas, series.imposto, series.precos, series.receitas] as Registro[][]) {
    for (const r of lista) if (dentro(r)) instantes.add(r.vigenteDesde);
  }
  const resultado: InstanteMudanca[] = [];
  for (const t of [...instantes].sort((a, b) => a - b)) {
    const causas: CausaMudanca[] = [];
    const chaves = new Set<string>();
    const nova = (chave: string) => (chaves.has(chave) ? false : (chaves.add(chave), true));

    for (const r of series.insumos) {
      if (r.vigenteDesde !== t || !nova(`i${r.insumoId}`)) continue;
      const para = vigente(series.insumos, t, (x) => x.insumoId === r.insumoId)!;
      const de = vigente(series.insumos, t - 1, (x) => x.insumoId === r.insumoId);
      if (de && de.preco === para.preco && de.qtdEmbalagem === para.qtdEmbalagem) continue;
      causas.push({
        tipo: "insumo", nome: infoInsumo.get(r.insumoId)?.nome ?? `Insumo ${r.insumoId}`, unidade: infoInsumo.get(r.insumoId)?.unidade ?? "",
        de: de?.preco ?? null, para: para.preco,
        alteradoPor: para.alteradoPor, insumoId: r.insumoId, ...(de ? { qtdDe: de.qtdEmbalagem } : {}), qtdPara: para.qtdEmbalagem,
      });
    }
    if (series.custoHora.some((r) => r.vigenteDesde === t)) {
      const para = vigente(series.custoHora, t)!;
      causas.push({ tipo: "hora", nome: "Valor da hora de trabalho", de: vigente(series.custoHora, t - 1)?.valor ?? null, para: para.valor, alteradoPor: para.alteradoPor });
    }
    if (series.forno.some((r) => r.vigenteDesde === t)) {
      const para = vigente(series.forno, t)!;
      const de = vigente(series.forno, t - 1);
      causas.push({ tipo: "forno", nome: "Gás do forno (por hora)", de: de ? fornoDe(de).custoHora : null, para: fornoDe(para).custoHora, alteradoPor: para.alteradoPor });
    }
    for (const r of series.taxas) {
      if (r.vigenteDesde !== t || !nova(`t${r.formaId}`)) continue;
      const para = vigente(series.taxas, t, (x) => x.formaId === r.formaId)!;
      const de = vigente(series.taxas, t - 1, (x) => x.formaId === r.formaId);
      causas.push({ tipo: "taxa", nome: nomeForma.get(r.formaId) ?? `Forma ${r.formaId}`, de: de?.taxaPct ?? null, para: para.taxaPct, alteradoPor: para.alteradoPor, formaId: r.formaId });
    }
    if (series.imposto.some((r) => r.vigenteDesde === t)) {
      const para = vigente(series.imposto, t)!;
      causas.push({ tipo: "imposto", nome: "Imposto", de: vigente(series.imposto, t - 1)?.valor ?? null, para: para.valor, alteradoPor: para.alteradoPor });
    }
    for (const r of series.precos) {
      if (r.vigenteDesde !== t || !nova(`p${r.produtoId}:${r.canalId ?? "g"}`)) continue;
      const doCanal = (x: (typeof series.precos)[number]) => x.produtoId === r.produtoId && x.canalId === r.canalId;
      const geral = (x: (typeof series.precos)[number]) => x.produtoId === r.produtoId && x.canalId === null;
      const para = vigente(series.precos, t, doCanal)!;
      // Preço de canal: o "antes" é o preço efetivo no canal, herdado do geral se não havia próprio.
      const de = vigente(series.precos, t - 1, doCanal) ?? (r.canalId === null ? null : vigente(series.precos, t - 1, geral));
      const produto = nomeProduto.get(r.produtoId) ?? `Produto ${r.produtoId}`;
      const canal = r.canalId === null ? "preço geral" : nomeCanal.get(r.canalId) ?? `canal ${r.canalId}`;
      causas.push({ tipo: "preco", nome: `${produto} (${canal})`, de: de?.preco ?? null, para: para.preco, alteradoPor: para.alteradoPor, produtoId: r.produtoId, canalId: r.canalId });
    }
    for (const r of series.receitas) {
      if (r.vigenteDesde !== t || !nova(`r${r.produtoId}`) || !nomeProduto.has(r.produtoId)) continue;
      const para = receitaEm(series, r.produtoId, t)!;
      const de = receitaEm(series, r.produtoId, t - 1);
      const mudancas = de ? diffReceita(de.receita, para.receita, base.insumos) : [];
      if (de && mudancas.length === 0) continue;
      causas.push({
        tipo: "receita", nome: nomeProduto.get(r.produtoId)!,
        de: de ? custoUnEm(series, base, r.produtoId, t - 1) : null, para: custoUnEm(series, base, r.produtoId, t)!,
        alteradoPor: para.alteradoPor, produtoId: r.produtoId, mudancas, preenchimento: de ? ehPreenchimento(mudancas) : false,
      });
    }
    // Registro que empatou e perdeu no mesmo T não muda nada: some se de === para. Insumo e receita
    // já entram só se mudaram (a embalagem ou a receita podem mudar com o mesmo valor em R$).
    const efetivas = causas.filter((c) => c.tipo === "insumo" || c.tipo === "receita" || c.de === null || c.de !== c.para);
    if (efetivas.length) resultado.push({ instante: iso(t), causas: efetivas });
  }
  return resultado;
}

/**
 * A causa mexe no produto, olhando a receita antes E depois de T (basta uma)? Receita e preço só
 * no próprio produto; hora e forno em quem usa; taxa e imposto em todos.
 */
function afeta(causa: CausaMudanca, ...estados: (ProdutoCompleto | undefined)[]): boolean {
  return estados.some((produto) => {
    if (!produto) return false;
    if (causa.tipo === "insumo") return produto.linhas.some((l) => l.insumoId === causa.insumoId) || produto.embalagens.some((e) => e.insumoId === causa.insumoId);
    if (causa.tipo === "preco" || causa.tipo === "receita") return causa.produtoId === produto.id;
    if (causa.tipo === "forno") return !produto.semForno && (produto.minutosForno ?? 0) > 0;
    if (causa.tipo === "hora") return produto.minutosPreparo > 0 || produto.minutosAcabamentoUn > 0;
    return true;
  });
}

/* ---------------- séries para gráfico ---------------- */

/** `precoPorUnidade` usa a embalagem do próprio registro. Um ponto por mudança de preço ou de embalagem. */
export function serieInsumo(insumoId: number, series: SeriesCusto, base: BaseCusto, desde: number, ate = Number.POSITIVE_INFINITY): PontoInsumo[] {
  const ponto = (t: number, r: SeriesCusto["insumos"][number]): PontoInsumo =>
    ({ instante: iso(t), preco: r.preco, qtdEmbalagem: r.qtdEmbalagem, precoPorUnidade: r.qtdEmbalagem > 0 ? r.preco / r.qtdEmbalagem : 0, alteradoPor: r.alteradoPor });
  const doInsumo = (r: SeriesCusto["insumos"][number]) => r.insumoId === insumoId;
  const pontos: PontoInsumo[] = [];
  const inicial = vigente(series.insumos, desde, doInsumo);
  if (inicial) pontos.push(ponto(desde, inicial));
  const instantes = [...new Set(series.insumos.filter((r) => doInsumo(r) && r.vigenteDesde > desde && r.vigenteDesde <= ate).map((r) => r.vigenteDesde))].sort((a, b) => a - b);
  for (const t of instantes) {
    const r = vigente(series.insumos, t, doInsumo)!;
    if (pontos.length && pontos[pontos.length - 1].preco === r.preco && pontos[pontos.length - 1].qtdEmbalagem === r.qtdEmbalagem) continue;
    pontos.push(ponto(t, r));
  }
  return pontos;
}

const mesmoPonto = (a: Omit<PontoProduto, "instante" | "causas">, b: Omit<PontoProduto, "instante" | "causas">) =>
  Math.abs(a.custoUn - b.custoUn) <= 1e-9 && a.canais.length === b.canais.length &&
  a.canais.every((c, i) => c.canalId === b.canais[i].canalId && Math.abs(c.preco - b.canais[i].preco) <= 1e-9 && Math.abs(c.margemPct - b.canais[i].margemPct) <= 1e-9);

/**
 * Ponto inicial em `desde` ou no nascimento do produto (1ª versão da receita), o que vier depois,
 * + um ponto por instante que mudou custo/un, preço ou margem do produto.
 */
export function serieProduto(produtoId: number, series: SeriesCusto, base: BaseCusto, desde: number, ate = Number.POSITIVE_INFINITY): PontoProduto[] {
  if (!base.produtos.some((p) => p.id === produtoId)) return [];
  const nascimento = Math.min(...series.receitas.filter((r) => r.produtoId === produtoId).map((r) => r.vigenteDesde));
  const inicio = Math.max(desde, nascimento);
  if (!Number.isFinite(inicio) || inicio > ate) return [];
  const doProduto = (t: number) => painelEm(series, base, t).find((x) => x.produto.id === produtoId);
  const valores = (p: ProdutoPainel) =>
    ({ custoUn: p.resultado.custoUnitario, canais: p.canais.map((c) => ({ canalId: c.canalId, preco: c.preco, margemPct: c.margemPct })) });
  const pontos: PontoProduto[] = [{ instante: iso(inicio), ...valores(doProduto(inicio)!), causas: [] }];
  for (const { instante, causas } of instantesDeMudanca(series, base, inicio, ate)) {
    const t = Date.parse(instante);
    const depois = doProduto(t)!;
    const v = valores(depois);
    if (mesmoPonto(v, pontos[pontos.length - 1])) continue;
    const antes = doProduto(t - 1);
    pontos.push({ instante, ...v, causas: causas.filter((c) => afeta(c, antes?.produto, depois.produto)) });
  }
  return pontos;
}

/**
 * Versões da receita de um produto ativo, da mais recente para a mais antiga. `mudancas` = diff com
 * a versão anterior (vazio na primeira, a linha de base). null se o produto não está na base.
 */
export function historicoReceita(produtoId: number, series: SeriesCusto, base: BaseCusto): VersaoReceita[] | null {
  if (!base.produtos.some((p) => p.id === produtoId)) return null;
  const info = new Map(base.insumos.map((i) => [i.id, i]));
  const nomeado = <T extends { insumoId: number }>(item: T) =>
    ({ ...item, nome: info.get(item.insumoId)?.nome ?? `Insumo ${item.insumoId}`, unidade: info.get(item.insumoId)?.unidade ?? "" });
  const versoes = series.receitas.filter((r) => r.produtoId === produtoId).sort((a, b) => (posterior(a, b) ? 1 : -1));
  return versoes.map((v, i): VersaoReceita => {
    const anterior = i > 0 ? versoes[i - 1] : null;
    const mudancas = anterior ? diffReceita(anterior.receita, v.receita, base.insumos) : [];
    return {
      id: v.id, vigenteDesde: iso(v.vigenteDesde), alteradoPor: v.alteradoPor, receita: v.receita,
      linhas: v.receita.linhas.map(nomeado), embalagens: v.receita.embalagens.map(nomeado),
      custoUn: custoUnEm(series, base, produtoId, v.vigenteDesde, v.receita)!,
      custoAntes: anterior ? custoUnEm(series, base, produtoId, v.vigenteDesde, anterior.receita) : null,
      mudancas, preenchimento: anterior ? ehPreenchimento(mudancas) : false,
    };
  }).reverse();
}

/* ---------------- alertas ---------------- */

/** Queda mínima, já abaixo da meta, para alertar (p.p.). A folga absorve o ruído do float. */
const QUEDA_MINIMA_PP = 2;
const FOLGA = 1e-9;

/**
 * Para cada instante T de mudança em (desde, agora] e cada produto ativo × canal ativo:
 * alerta se m1 < meta e (m0 ≥ meta ou m0 − m1 ≥ 2 p.p.), com m0 em T − 1 ms e m1 em T.
 * Não alerta: primeiro valor de uma série (de = null), preenchimento de receita (0 → valor), produto
 * nascendo (sem versão em T − 1), nem produto cujas causas em T são só desses tipos.
 * Ordenado pelo estrago (m0 − m1), do maior para o menor.
 */
export function alertasMargem(series: SeriesCusto, base: BaseCusto, desde: number, agora: number): AlertaMargem[] {
  const alertas: (AlertaMargem & { estrago: number })[] = [];
  for (const { instante, causas } of instantesDeMudanca(series, base, desde, agora)) {
    const soPreencheu = (lista: CausaMudanca[]) => lista.every((c) => c.de === null || c.preenchimento === true);
    if (soPreencheu(causas)) continue;
    const t = Date.parse(instante);
    const antes = painelEm(series, base, t - 1);
    const depois = painelEm(series, base, t);
    for (const p1 of depois) {
      const p0 = antes.find((p) => p.produto.id === p1.produto.id);
      if (!p0) continue;
      const relevantes = causas.filter((c) => afeta(c, p0.produto, p1.produto));
      if (relevantes.length && soPreencheu(relevantes)) continue;
      for (const c1 of p1.canais) {
        const canal = base.canais.find((c) => c.id === c1.canalId);
        const c0 = p0.canais.find((c) => c.canalId === c1.canalId);
        if (!canal || !c0) continue;
        const meta = canal.margemAlvoPct, m0 = c0.margemPct, m1 = c1.margemPct;
        if (!(m1 < meta - FOLGA && (m0 >= meta - FOLGA || m0 - m1 >= QUEDA_MINIMA_PP - FOLGA))) continue;
        alertas.push({
          chave: chaveAlerta(instante, p1.produto.id, canal.id), instante,
          produtoId: p1.produto.id, produto: p1.produto.nome, canalId: canal.id, canal: canal.nome,
          de: m0, para: m1, meta, causas: relevantes.length ? relevantes : causas, estrago: m0 - m1,
        });
      }
    }
  }
  return alertas.sort((a, b) => b.estrago - a.estrago || a.chave.localeCompare(b.chave)).map(({ estrago: _, ...a }) => a);
}

/**
 * O que o Início mostra, mantendo a ordem por estrago de `alertas`:
 * 1) só o alerta MAIS RECENTE de cada produto × canal (dois golpes seguidos = um cartão, o do último);
 * 2) sem os dispensados. A escolha do mais recente vem antes: se a Carol dispensou o último, o
 *    anterior do mesmo produto × canal não pode reaparecer;
 * 3) só se o produto × canal HOJE ainda está abaixo da meta (se ela já corrigiu, some).
 * Produto ou canal que não está mais em `painelAgora` (arquivado, inativo) também some.
 */
export function alertasAtivos(alertas: readonly AlertaMargem[], painelAgora: readonly ProdutoPainel[], dispensados: ReadonlySet<string>): AlertaMargem[] {
  const par = (a: AlertaMargem) => `${a.produtoId}|${a.canalId}`;
  const ultimo = new Map<string, number>();
  for (const a of alertas) ultimo.set(par(a), Math.max(ultimo.get(par(a)) ?? Number.NEGATIVE_INFINITY, Date.parse(a.instante)));
  return alertas.filter((a) => {
    if (Date.parse(a.instante) !== ultimo.get(par(a)) || dispensados.has(a.chave)) return false;
    const hoje = painelAgora.find((p) => p.produto.id === a.produtoId)?.canais.find((c) => c.canalId === a.canalId);
    return hoje !== undefined && hoje.margemPct < a.meta - FOLGA;
  });
}

export const chaveAlerta = (instante: string, produtoId: number, canalId: number) => `${instante}|${produtoId}|${canalId}`;

const FORMATO_CHAVE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([1-9]\d{0,9})\|([1-9]\d{0,9})$/;
/** Valida o formato e devolve as partes; null se não for uma chave que `alertasMargem` geraria. */
export function lerChaveAlerta(chave: unknown): { instante: string; produtoId: number; canalId: number } | null {
  if (typeof chave !== "string" || chave.length > 60) return null;
  const m = FORMATO_CHAVE.exec(chave);
  if (!m) return null;
  const t = Date.parse(m[1]);
  const produtoId = Number(m[2]), canalId = Number(m[3]);
  if (!Number.isFinite(t) || iso(t) !== m[1] || produtoId > 2147483647 || canalId > 2147483647) return null;
  return { instante: m[1], produtoId, canalId };
}

/* ---------------- o que mais subiu ---------------- */

/**
 * Maior alta % do PREÇO POR UNIDADE entre o vigente em `desde` e o de `agora`, só insumos ativos.
 * `de`/`para` = preço da embalagem; `qtdDe`/`qtdPara` = embalagem. Ignora sem valor (ou zero) em `desde`.
 */
export function maisSubiram(series: SeriesCusto, base: BaseCusto, desde: number, n: number, agora = Number.POSITIVE_INFINITY): InsumoQueSubiu[] {
  const lista: InsumoQueSubiu[] = [];
  for (const insumo of base.insumos) {
    if (!insumo.ativo) continue;
    const doInsumo = (r: SeriesCusto["insumos"][number]) => r.insumoId === insumo.id;
    const antes = vigente(series.insumos, desde, doInsumo);
    const depois = vigente(series.insumos, agora, doInsumo);
    if (!antes || !depois || antes.preco <= 0) continue;
    // (para/qtdPara) ÷ (de/qtdDe) sem dividir antes: com a mesma embalagem fica para ÷ de, sem ruído.
    const razao = (depois.preco * antes.qtdEmbalagem) / (antes.preco * depois.qtdEmbalagem);
    if (!(razao > 1)) continue;
    lista.push({
      insumoId: insumo.id, nome: insumo.nome, unidade: insumo.unidade, de: antes.preco, para: depois.preco,
      qtdDe: antes.qtdEmbalagem, qtdPara: depois.qtdEmbalagem, variacaoPct: (razao - 1) * 100,
    });
  }
  return lista.sort((a, b) => b.variacaoPct - a.variacaoPct || a.insumoId - b.insumoId).slice(0, Math.max(0, n));
}

export const diasAtras = (agora: number, dias: number) => agora - dias * DIA_MS;
