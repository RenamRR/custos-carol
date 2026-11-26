import type { Canal, PrecoCanal } from "./custo-completo";

export interface ItemVenda {
  id: number; produtoId: number; produtoNome: string;
  quantidade: number; precoUn: number; custoUn: number;
}
export interface Venda {
  id: number; vendidaEm: string; canalId: number; canalNome: string;
  formaId: number; formaNome: string; eventoId: number | null;
  taxaPct: number | null; impostoPct: number; nota: string | null;
  criadoPor: number | null; criadoEm: string; canceladaEm: string | null; canceladaPor: number | null;
  itens: ItemVenda[];
}
export interface Evento {
  id: number; nome: string; data: string; custoFixo: number; nota: string | null;
  criadoPor: number | null; criadoEm: string; alteradoPor: number | null; alteradoEm: string | null;
  canceladoEm: string | null; canceladoPor: number | null;
}
export interface TotaisVenda {
  faturamento: number; custo: number; taxas: number; custoFeiras: number;
  lucro: number; unidades: number; vendas: number; vendasSemTaxa: number; margemPct: number;
}
export interface GrupoVenda extends TotaisVenda { id: number; nome: string }
export interface ResumoMes {
  totais: TotaisVenda; porProduto: GrupoVenda[]; porCanal: GrupoVenda[];
  feiras: (Evento & TotaisVenda)[]; custoFeiraSemVenda: number;
}
export interface VendaDetalhada extends Venda { resultado: TotaisVenda }
export interface DadosVender {
  hoje: string;
  produtos: { id: number; nome: string; custoUn: number; precosPorCanal: PrecoCanal[] }[];
  canais: Canal[]; eventos: Evento[]; impostoPct: number;
}
export interface DadosMes { ano: number; mes: number; resumo: ResumoMes; vendas: VendaDetalhada[]; eventos: Evento[] }
export interface DadosHoje { hoje: string; ano: number; mes: number; totais: TotaisVenda; porCanal: GrupoVenda[]; vendas: VendaDetalhada[] }
export interface EntradaVenda {
  canalId: number; formaId: number; eventoId?: number | null;
  /** ISO com offset, ou YYYY-MM-DD (hoje = agora; passado = meio-dia SP). Ausente = agora. */
  vendidaEm?: string; nota?: string;
  itens: { produtoId: number; quantidade: number; precoUn: string }[];
}
export interface EntradaEvento { nome: string; data: string; custoFixo: string; nota?: string }
export type ResultadoVenda = { ok: true; vendaId: number; custoUnMedio: number; itensComCusto: { produtoId: number; quantidade: number; custoUn: number }[] } | { ok: false; erro: string };
export type ResultadoEvento = { ok: true; eventoId: number } | { ok: false; erro: string };

export const FUSO_VENDAS = "America/Sao_Paulo";
export const CANAL_FEIRA = "Feira";
export function diaSaoPaulo(data: Date | string = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_VENDAS, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(data));
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}
export function dataCivilValida(data: unknown): data is string {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const instante = new Date(`${data}T12:00:00Z`);
  return Number.isFinite(instante.getTime()) && instante.toISOString().slice(0, 10) === data;
}
export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
/** Só-dia: hoje = agora, passado = meio-dia SP (ADR-003). Instantes precisam trazer offset. */
export function instanteVenda(valor?: string, agora = new Date()): Date | null {
  if (valor === undefined) return agora;
  if (typeof valor !== "string") return null;
  const soDia = dataCivilValida(valor);
  if (soDia && valor === diaSaoPaulo(agora)) return agora;
  if (!soDia && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(valor)) return null;
  if (!dataCivilValida(valor.slice(0, 10))) return null;
  // SP está em UTC-03 desde 2019; a janela aceita de 60 dias não alcança o antigo horário de verão.
  const d = new Date(soDia ? `${valor}T12:00:00-03:00` : valor);
  if (!Number.isFinite(d.getTime())) return null;
  if (d > agora || diaSaoPaulo(d) < somarDias(diaSaoPaulo(agora), -60)) return null;
  return d;
}
export function limitesMes(ano: number, mes: number) {
  if (!Number.isInteger(ano) || ano < 2000 || ano > 9998 || !Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error("Mês inválido.");
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = `${mes === 12 ? ano + 1 : ano}-${String(mes === 12 ? 1 : mes + 1).padStart(2, "0")}-01`;
  return { inicio, fim };
}
export function resultadoItem(item: Pick<ItemVenda, "quantidade" | "precoUn" | "custoUn">, taxaPct: number | null, impostoPct: number) {
  const faturamento = item.quantidade * item.precoUn;
  const custo = item.quantidade * item.custoUn;
  const taxas = faturamento * ((taxaPct ?? 0) + impostoPct) / 100;
  return { faturamento, custo, taxas, margem: faturamento - custo - taxas };
}
/** Rateio em centavos; o último item recebe o resto, sem perder centavos. */
export function rateioEvento(custoFixo: number, itens: readonly Pick<ItemVenda, "quantidade">[]): number[] {
  if (!itens.length) return [];
  const unidades = itens.reduce((s, i) => s + i.quantidade, 0);
  const centavos = Math.round(custoFixo * 100);
  let usados = 0;
  return itens.map((item, indice) => {
    const valor = indice === itens.length - 1 ? centavos - usados : Math.floor(centavos * item.quantidade / unidades);
    usados += valor;
    return valor / 100;
  });
}
const vazio = (): TotaisVenda => ({ faturamento: 0, custo: 0, taxas: 0, custoFeiras: 0, lucro: 0, unidades: 0, vendas: 0, vendasSemTaxa: 0, margemPct: 0 });
function finalizar(t: TotaisVenda) {
  t.lucro = t.faturamento - t.custo - t.taxas - t.custoFeiras;
  t.margemPct = t.faturamento ? 100 * t.lucro / t.faturamento : 0;
}
function acumular(t: TotaisVenda, item: ItemVenda, venda: Venda, custoFeira: number) {
  const r = resultadoItem(item, venda.taxaPct, venda.impostoPct);
  t.faturamento += r.faturamento; t.custo += r.custo; t.taxas += r.taxas;
  t.unidades += item.quantidade; t.custoFeiras += custoFeira;
}
/** As entradas já pertencem ao mês desejado; canceladas são excluídas aqui, inclusive eventos. */
export function resumoMes(vendas: readonly Venda[], eventos: readonly Evento[], canalFeiraId = vendas.find((v) => v.canalNome === CANAL_FEIRA)?.canalId ?? 0): ResumoMes {
  const ativas = vendas.filter((v) => !v.canceladaEm);
  const feiras = eventos.filter((e) => !e.canceladoEm).map((e) => ({ ...e, ...vazio() }));
  const rateios = new Map<number, number>();
  for (const feira of feiras) {
    const itens = ativas.filter((v) => v.eventoId === feira.id).flatMap((v) => v.itens);
    const custos = rateioEvento(feira.custoFixo, itens);
    itens.forEach((i, n) => rateios.set(i.id, custos[n]));
  }
  const totais = vazio();
  const produtos = new Map<number, GrupoVenda>();
  const canais = new Map<number, GrupoVenda>();
  const grupo = (mapa: Map<number, GrupoVenda>, id: number, nome: string) => {
    if (!mapa.has(id)) mapa.set(id, { id, nome, ...vazio() });
    return mapa.get(id)!;
  };
  for (const venda of ativas) {
    const canal = grupo(canais, venda.canalId, venda.canalNome);
    const feira = feiras.find((f) => f.id === venda.eventoId);
    const produtosNaVenda = new Set<number>();
    for (const item of venda.itens) {
      const custoFeira = rateios.get(item.id) ?? 0;
      const produto = grupo(produtos, item.produtoId, item.produtoNome);
      for (const t of [totais, canal, produto, ...(feira ? [feira] : [])]) acumular(t, item, venda, custoFeira);
      if (!produtosNaVenda.has(item.produtoId)) {
        produto.vendas++; produto.vendasSemTaxa += Number(venda.taxaPct === null);
        produtosNaVenda.add(item.produtoId);
      }
    }
    for (const t of [totais, canal, ...(feira ? [feira] : [])]) { t.vendas++; t.vendasSemTaxa += Number(venda.taxaPct === null); }
  }
  let custoFeiraSemVenda = 0;
  for (const feira of feiras) {
    // Fato do evento; inclui integralmente o custo mesmo sem venda.
    feira.custoFeiras = feira.custoFixo;
    if (!feira.unidades) {
      custoFeiraSemVenda += feira.custoFixo;
      grupo(canais, canalFeiraId, CANAL_FEIRA).custoFeiras += feira.custoFixo;
    }
  }
  totais.custoFeiras = feiras.reduce((s, e) => s + e.custoFixo, 0);
  for (const t of [totais, ...produtos.values(), ...canais.values(), ...feiras]) finalizar(t);
  return { totais, porProduto: [...produtos.values()], porCanal: [...canais.values()], feiras, custoFeiraSemVenda };
}
/** Lista preserva canceladas para auditoria; o resultado delas é informativo e não entra no mês. */
export function detalharVendas(vendas: Venda[], eventos: Evento[]): VendaDetalhada[] {
  const rateios = new Map<number, number>();
  for (const evento of eventos.filter((e) => !e.canceladoEm)) {
    const itens = vendas.filter((v) => !v.canceladaEm && v.eventoId === evento.id).flatMap((v) => v.itens);
    rateioEvento(evento.custoFixo, itens).forEach((c, n) => rateios.set(itens[n].id, c));
  }
  return vendas.map((venda) => {
    const resultado = vazio();
    venda.itens.forEach((item) => acumular(resultado, item, venda, rateios.get(item.id) ?? 0));
    resultado.vendas = 1; resultado.vendasSemTaxa = Number(venda.taxaPct === null);
    finalizar(resultado);
    return { ...venda, resultado };
  });
}
