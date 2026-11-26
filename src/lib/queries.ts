import "server-only";
import { exigirUsuario } from "./auth";
import * as consultas from "./consultas-db";
export type { PontoHistorico } from "./consultas-db";

export async function carregarInsumos() {
  await exigirUsuario();
  return consultas.carregarInsumos();
}

export async function carregarProdutos() {
  await exigirUsuario();
  return consultas.carregarProdutos();
}

export async function carregarCustoHora() {
  await exigirUsuario();
  return consultas.carregarCustoHora();
}

export async function carregarHistoricoPrecos(desde?: Date) {
  await exigirUsuario();
  return consultas.carregarHistoricoPrecos(desde);
}
