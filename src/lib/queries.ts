import "server-only";
import { exigirUsuario } from "./auth";
import * as consultas from "./consultas-db";
import * as consultasVendas from "./consultas-vendas";
import * as consultasProducao from "./consultas-producao";
import * as consultasHistorico from "./consultas-historico";
import { idValido } from "./validacao-custo";
import type { Canal, Config, FormaPagamento, Forno, Painel, ProdutoCompleto } from "./custo-completo";
export type { Canal, Config, FormaPagamento, Forno, Painel, ProdutoCompleto, ProdutoPainel, ResumoCanal, Pendencia } from "./custo-completo";
export type { PontoHistorico } from "./consultas-db";

export async function carregarInsumos() {
  await exigirUsuario();
  return consultas.carregarInsumos();
}

export async function carregarProdutos(): Promise<ProdutoCompleto[]> {
  await exigirUsuario();
  return consultas.carregarProdutos();
}

export async function carregarForno(): Promise<Forno> {
  await exigirUsuario();
  return consultas.carregarForno();
}

export async function carregarCanais(): Promise<Canal[]> {
  await exigirUsuario();
  return consultas.carregarCanais();
}

export async function carregarFormasPagamento(): Promise<FormaPagamento[]> {
  await exigirUsuario();
  return consultas.carregarFormasPagamento();
}

export async function carregarConfig(): Promise<Config> {
  await exigirUsuario();
  return consultas.carregarConfig();
}

export async function carregarPainel(): Promise<Painel> {
  await exigirUsuario();
  return consultas.carregarPainel();
}

export async function carregarCustoHora() {
  await exigirUsuario();
  return consultas.carregarCustoHora();
}

export async function carregarHistoricoPrecos(desde?: Date) {
  await exigirUsuario();
  return consultas.carregarHistoricoPrecos(desde);
}

// Contrato etapa 3.
export type { DadosVender, DadosMes, DadosHoje, Venda, VendaDetalhada, Evento, ResumoMes, TotaisVenda } from "./vendas";
export async function carregarVender(): Promise<import("./vendas").DadosVender> {
  await exigirUsuario();
  return consultasVendas.carregarVender();
}
export async function carregarMes(ano: number, mes: number): Promise<import("./vendas").DadosMes> {
  await exigirUsuario();
  return consultasVendas.carregarMes(ano, mes);
}
export async function carregarHoje(): Promise<import("./vendas").DadosHoje> {
  await exigirUsuario();
  return consultasVendas.carregarHoje();
}

export type { DadosProduzir, ProdutoProducao, InsumoProducao } from "./producao";
export async function carregarProduzir(): Promise<import("./producao").DadosProduzir> {
  await exigirUsuario();
  return consultasProducao.carregarProduzir();
}

// Contrato etapa 5. Datas em ISO (string); margens em %.
export type { AlertaMargem, CausaMudanca, HistoricoInsumo, HistoricoProduto, InsumoQueSubiu, PontoInsumo, PontoProduto, TipoCausa } from "./linha-do-tempo";
export async function carregarAlertas(): Promise<import("./linha-do-tempo").AlertaMargem[]> {
  await exigirUsuario();
  return consultasHistorico.carregarAlertas();
}
/** null quando o id não existe: a página responde notFound(). */
export async function carregarHistoricoInsumo(id: number): Promise<import("./linha-do-tempo").HistoricoInsumo | null> {
  await exigirUsuario();
  return idValido(id) ? consultasHistorico.carregarHistoricoInsumo(id) : null;
}
/** null quando o produto não existe ou está arquivado. */
export async function carregarHistoricoProduto(id: number): Promise<import("./linha-do-tempo").HistoricoProduto | null> {
  await exigirUsuario();
  return idValido(id) ? consultasHistorico.carregarHistoricoProduto(id) : null;
}
export async function carregarMaisSubiram(): Promise<import("./linha-do-tempo").InsumoQueSubiu[]> {
  await exigirUsuario();
  return consultasHistorico.carregarMaisSubiram();
}
