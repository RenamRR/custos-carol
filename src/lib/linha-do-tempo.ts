/**
 * Linha do tempo do custo (etapa 5). Funções puras: sem banco, sem React.
 *
 * Custo no passado = receita de HOJE × valores das séries vigentes naquela data. A receita
 * não tem histórico, então a tela avisa "calculado com a receita atual".
 *
 * Nada de fórmula nova: `painelEm` monta o mesmo formato que `carregarPainel()` monta e
 * passa por `calcularProduto` + `resumoCanais`. Vigente = maior `vigenteDesde ≤ T`, com
 * desempate pelo maior `id`, a mesma regra das queries.
 */
import { calcularProduto, resumoCanais, type Insumo } from "./calc";
import type { Canal, Forno, ProdutoCompleto, ProdutoPainel } from "./custo-completo";

/* ---------------- contrato ---------------- */

export type TipoCausa = "insumo" | "hora" | "forno" | "taxa" | "imposto" | "preco";

/**
 * Uma série que mudou num instante.
 * - insumo: preço da embalagem de compra (R$);
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
}
export interface InstanteMudanca { instante: string; causas: CausaMudanca[] }

export interface PontoInsumo { instante: string; preco: number; precoPorUnidade: number; alteradoPor: string | null }
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

export interface InsumoQueSubiu { insumoId: number; nome: string; unidade: string; de: number; para: number; variacaoPct: number }

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
  insumos: (Registro & { insumoId: number; preco: number })[];
  custoHora: (Registro & { valor: number })[];
  forno: (Registro & { precoBotijao: number; horasPorBotijao: number })[];
  taxas: (Registro & { formaId: number; taxaPct: number })[];
  imposto: (Registro & { valor: number })[];
  /** `canalId` null = preço geral. */
  precos: (Registro & { produtoId: number; canalId: number | null; preco: number })[];
}

/**
 * O que não muda no tempo: a receita de hoje e os catálogos. Os preços, taxas e valores que
 * vierem aqui são ignorados: `estadoEm` os substitui pelos vigentes em T.
 */
export interface BaseCusto {
  produtos: ProdutoCompleto[];
  insumos: Omit<Insumo, "preco">[];
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

/** Mesmo formato e mesmos defaults das queries de hoje ("não informado" = 0, taxa = null). */
export function estadoEm(series: SeriesCusto, base: BaseCusto, t: number): EstadoCusto {
  const insumos: Insumo[] = base.insumos.map((i) => ({ ...i, preco: vigente(series.insumos, t, (r) => r.insumoId === i.id)?.preco ?? 0 }));
  const canais: Canal[] = base.canais.map((c) => ({
    ...c,
    formas: c.formas.map((f) => ({ ...f, taxaPct: vigente(series.taxas, t, (r) => r.formaId === f.id)?.taxaPct ?? null })),
  }));
  const produtos: ProdutoCompleto[] = base.produtos.map((p) => {
    const geral = vigente(series.precos, t, (r) => r.produtoId === p.id && r.canalId === null);
    return {
      ...p,
      precoVenda: geral?.preco ?? 0,
      precosPorCanal: base.canais.map((c) => {
        const proprio = vigente(series.precos, t, (r) => r.produtoId === p.id && r.canalId === c.id);
        return { canalId: c.id, preco: (proprio ?? geral)?.preco ?? 0, herdado: proprio === null };
      }),
    };
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

/* ---------------- mudanças ---------------- */

const iso = (t: number) => new Date(t).toISOString();

/**
 * Instantes T com desde < T ≤ ate em que alguma série mudou, em ordem cronológica. Registros
 * no mesmo instante exato viram um instante só; a mesma série com dois registros em T conta
 * uma vez, com o vencedor do desempate. `de` = valor efetivo em T − 1 ms.
 */
export function instantesDeMudanca(series: SeriesCusto, base: BaseCusto, desde: number, ate = Number.POSITIVE_INFINITY): InstanteMudanca[] {
  const nomeInsumo = new Map(base.insumos.map((i) => [i.id, i.nome]));
  const nomeForma = new Map(base.formas.map((f) => [f.id, f.nome]));
  const nomeProduto = new Map(base.produtos.map((p) => [p.id, p.nome]));
  const nomeCanal = new Map(base.canais.map((c) => [c.id, c.nome]));
  const dentro = (r: Registro) => r.vigenteDesde > desde && r.vigenteDesde <= ate;
  const instantes = new Set<number>();
  for (const lista of [series.insumos, series.custoHora, series.forno, series.taxas, series.imposto, series.precos]) {
    for (const r of lista as Registro[]) if (dentro(r)) instantes.add(r.vigenteDesde);
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
      causas.push({ tipo: "insumo", nome: nomeInsumo.get(r.insumoId) ?? `Insumo ${r.insumoId}`, de: de?.preco ?? null, para: para.preco, alteradoPor: para.alteradoPor, insumoId: r.insumoId });
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
    // Registro que empatou e perdeu no mesmo T não muda nada: some se de === para.
    const efetivas = causas.filter((c) => c.de === null || c.de !== c.para);
    if (efetivas.length) resultado.push({ instante: iso(t), causas: efetivas });
  }
  return resultado;
}

/** A causa mexe neste produto? Hora, forno, taxa e imposto valem para todos. */
function afeta(causa: CausaMudanca, produto: ProdutoCompleto): boolean {
  if (causa.tipo === "insumo") return produto.linhas.some((l) => l.insumoId === causa.insumoId) || produto.embalagens.some((e) => e.insumoId === causa.insumoId);
  if (causa.tipo === "preco") return causa.produtoId === produto.id;
  if (causa.tipo === "forno") return !produto.semForno && (produto.minutosForno ?? 0) > 0;
  if (causa.tipo === "hora") return produto.minutosPreparo > 0 || produto.minutosAcabamentoUn > 0;
  return true;
}

/* ---------------- séries para gráfico ---------------- */

export function serieInsumo(insumoId: number, series: SeriesCusto, base: BaseCusto, desde: number, ate = Number.POSITIVE_INFINITY): PontoInsumo[] {
  const qtd = base.insumos.find((i) => i.id === insumoId)?.qtd ?? 0;
  const ponto = (t: number, r: SeriesCusto["insumos"][number]): PontoInsumo =>
    ({ instante: iso(t), preco: r.preco, precoPorUnidade: qtd > 0 ? r.preco / qtd : 0, alteradoPor: r.alteradoPor });
  const doInsumo = (r: SeriesCusto["insumos"][number]) => r.insumoId === insumoId;
  const pontos: PontoInsumo[] = [];
  const inicial = vigente(series.insumos, desde, doInsumo);
  if (inicial) pontos.push(ponto(desde, inicial));
  const instantes = [...new Set(series.insumos.filter((r) => doInsumo(r) && r.vigenteDesde > desde && r.vigenteDesde <= ate).map((r) => r.vigenteDesde))].sort((a, b) => a - b);
  for (const t of instantes) {
    const r = vigente(series.insumos, t, doInsumo)!;
    if (pontos.length && pontos[pontos.length - 1].preco === r.preco) continue;
    pontos.push(ponto(t, r));
  }
  return pontos;
}

const mesmoPonto = (a: Omit<PontoProduto, "instante" | "causas">, b: Omit<PontoProduto, "instante" | "causas">) =>
  Math.abs(a.custoUn - b.custoUn) <= 1e-9 && a.canais.length === b.canais.length &&
  a.canais.every((c, i) => c.canalId === b.canais[i].canalId && Math.abs(c.preco - b.canais[i].preco) <= 1e-9 && Math.abs(c.margemPct - b.canais[i].margemPct) <= 1e-9);

/** Ponto inicial em `desde` + um ponto por instante que mudou custo/un, preço ou margem do produto. */
export function serieProduto(produtoId: number, series: SeriesCusto, base: BaseCusto, desde: number, ate = Number.POSITIVE_INFINITY): PontoProduto[] {
  const produto = base.produtos.find((p) => p.id === produtoId);
  if (!produto) return [];
  const valores = (t: number) => {
    const p = painelEm(series, base, t).find((x) => x.produto.id === produtoId)!;
    return { custoUn: p.resultado.custoUnitario, canais: p.canais.map((c) => ({ canalId: c.canalId, preco: c.preco, margemPct: c.margemPct })) };
  };
  const pontos: PontoProduto[] = [{ instante: iso(desde), ...valores(desde), causas: [] }];
  for (const { instante, causas } of instantesDeMudanca(series, base, desde, ate)) {
    const v = valores(Date.parse(instante));
    if (mesmoPonto(v, pontos[pontos.length - 1])) continue;
    pontos.push({ instante, ...v, causas: causas.filter((c) => afeta(c, produto)) });
  }
  return pontos;
}

/* ---------------- alertas ---------------- */

/** Queda mínima, já abaixo da meta, para alertar (p.p.). A folga absorve o ruído do float. */
const QUEDA_MINIMA_PP = 2;
const FOLGA = 1e-9;

/**
 * Para cada instante T de mudança em (desde, agora] e cada produto ativo × canal ativo:
 * alerta se m1 < meta e (m0 ≥ meta ou m0 − m1 ≥ 2 p.p.), com m0 em T − 1 ms e m1 em T.
 * Primeiro preenchimento (todas as séries que mudaram em T não tinham valor antes) não alerta.
 * Ordenado pelo estrago (m0 − m1), do maior para o menor.
 */
export function alertasMargem(series: SeriesCusto, base: BaseCusto, desde: number, agora: number): AlertaMargem[] {
  const alertas: (AlertaMargem & { estrago: number })[] = [];
  for (const { instante, causas } of instantesDeMudanca(series, base, desde, agora)) {
    if (causas.every((c) => c.de === null)) continue;
    const t = Date.parse(instante);
    const antes = painelEm(series, base, t - 1);
    const depois = painelEm(series, base, t);
    for (const p1 of depois) {
      const p0 = antes.find((p) => p.produto.id === p1.produto.id)!;
      for (const c1 of p1.canais) {
        const canal = base.canais.find((c) => c.id === c1.canalId);
        const c0 = p0.canais.find((c) => c.canalId === c1.canalId);
        if (!canal || !c0) continue;
        const meta = canal.margemAlvoPct, m0 = c0.margemPct, m1 = c1.margemPct;
        if (!(m1 < meta - FOLGA && (m0 >= meta - FOLGA || m0 - m1 >= QUEDA_MINIMA_PP - FOLGA))) continue;
        const relevantes = causas.filter((c) => afeta(c, p1.produto));
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

/** Maior alta % entre o vigente em `desde` e o de `agora`. Ignora insumo sem valor (ou zero) em `desde`. */
export function maisSubiram(series: SeriesCusto, base: BaseCusto, desde: number, n: number, agora = Number.POSITIVE_INFINITY): InsumoQueSubiu[] {
  const lista: InsumoQueSubiu[] = [];
  for (const insumo of base.insumos) {
    const doInsumo = (r: SeriesCusto["insumos"][number]) => r.insumoId === insumo.id;
    const de = vigente(series.insumos, desde, doInsumo)?.preco;
    const para = vigente(series.insumos, agora, doInsumo)?.preco;
    if (de === undefined || para === undefined || de <= 0 || para <= de) continue;
    lista.push({ insumoId: insumo.id, nome: insumo.nome, unidade: insumo.unidade, de, para, variacaoPct: (para / de - 1) * 100 });
  }
  return lista.sort((a, b) => b.variacaoPct - a.variacaoPct || a.insumoId - b.insumoId).slice(0, Math.max(0, n));
}

export const diasAtras = (agora: number, dias: number) => agora - dias * DIA_MS;
