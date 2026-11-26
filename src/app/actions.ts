"use server";

import { and, eq, desc, isNull, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { custoHora, insumoPrecos, insumos, produtoPrecos, receitaLinhas } from "@/db/schema";
import { num } from "@/lib/calc";

import { exigirUsuario } from "@/lib/auth";
import { ehFalha, MUDOU, naoNegativo } from "@/lib/gravacoes-receita";
import * as receita from "@/lib/gravacoes-receita";
import * as custos from "@/lib/gravacoes-custo";
import * as gravacoesVendas from "@/lib/gravacoes-vendas";

export type Resultado = { ok: true } | { ok: false; erro: string };

const OK: Resultado = { ok: true };

export async function salvarForno(precoBotijao: string, horasPorBotijao: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await custos.salvarForno(usuario.id, precoBotijao, horasPorBotijao);
  if (resultado.ok) atualizar();
  return resultado;
}
export async function salvarPrecoCanal(produtoId: number, canalId: number, preco: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await custos.salvarPrecoCanal(usuario.id, produtoId, canalId, preco);
  if (resultado.ok) atualizar();
  return resultado;
}
export async function salvarMargemAlvoCanal(canalId: number, pct: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await custos.salvarMargemAlvoCanal(usuario.id, canalId, pct);
  if (resultado.ok) atualizar();
  return resultado;
}
export async function salvarTaxaForma(formaId: number, pct: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await custos.salvarTaxaForma(usuario.id, formaId, pct);
  if (resultado.ok) atualizar();
  return resultado;
}
export async function alternarFormaCanal(canalId: number, formaId: number, aceita: boolean): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await custos.alternarFormaCanal(usuario.id, canalId, formaId, aceita);
  if (resultado.ok) atualizar();
  return resultado;
}
export async function salvarImposto(pct: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await custos.salvarImposto(usuario.id, pct);
  if (resultado.ok) atualizar();
  return resultado;
}
export async function salvarCustoProduto(id: number, campos: { minutosForno: string; perdaPct: string; semForno?: boolean }): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await custos.salvarCustoProduto(usuario.id, id, campos);
  if (resultado.ok) atualizar();
  return resultado;
}
function atualizar() {
  revalidatePath("/", "layout");
}

/* ---------------- insumos (catálogo) ---------------- */

export async function salvarInsumo(
  id: number,
  campos: { nome: string; embalagem: string; qtd: string; unidade: string },
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await receita.salvarInsumo(usuario.id, id, campos);
  if (resultado.ok) atualizar();
  return resultado;
}

export async function salvarPrecoInsumo(id: number, preco: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const { mudou, ...resultado } = await receita.salvarPrecoInsumo(usuario.id, id, preco);
  if (mudou) atualizar();
  return resultado as Resultado;
}

export async function criarInsumo(tipo: "ingrediente" | "embalagem"): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const db = getDb();
  await db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(insumos)
      .values({
        nome: tipo === "embalagem" ? "Novo material" : "Novo insumo",
        tipo,
        embalagem: "",
        qtd: tipo === "embalagem" ? "100" : "1000",
        unidade: tipo === "embalagem" ? "un" : "g",
      })
      .returning({ id: insumos.id });
    await tx.insert(insumoPrecos).values({ alteradoPor: usuario.id, insumoId: linha.id, preco: "0" });
  });
  atualizar();
  return OK;
}

/** Em uso hoje: recusa. Com história em alguma versão de receita: arquiva. Senão: apaga. */
export async function removerInsumo(id: number): Promise<Resultado> {
  await exigirUsuario();
  const resultado = await receita.removerInsumo(id);
  if (resultado.ok) atualizar();
  return resultado;
}

/* ---------------- produtos ---------------- */

export async function salvarProduto(
  id: number,
  campos: {
    nome: string;
    rendimento: string;
    /** Opcional desde a etapa 5: a tela não edita mais; ausente mantém o valor gravado. */
    markupAlvo?: string;
    minutosPreparo: string;
    minutosAcabamentoUn: string;
  },
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await receita.salvarProduto(usuario.id, id, campos);
  if (resultado.ok) atualizar();
  return resultado;
}

export async function salvarPrecoProduto(id: number, preco: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const valor = naoNegativo(preco, "Preço de venda");
  if (ehFalha(valor)) return valor;

  const db = getDb();
  // Só o preço GERAL (canal_id null): um preço de canal mais recente não pode fazer o geral
  // parecer "igual" e a gravação ser pulada.
  const [atual] = await db
    .select({ preco: produtoPrecos.preco })
    .from(produtoPrecos)
    .where(and(
      eq(produtoPrecos.produtoId, id),
      isNull(produtoPrecos.canalId),
      lte(produtoPrecos.vigenteDesde, sql`now()`),
    ))
    .orderBy(desc(produtoPrecos.vigenteDesde), desc(produtoPrecos.id))
    .limit(1);

  if (atual && !MUDOU(num(atual.preco), valor)) return OK;

  await db.insert(produtoPrecos).values({ alteradoPor: usuario.id, produtoId: id, preco: String(valor) });
  atualizar();
  return OK;
}

/** Nasce sem nenhuma embalagem: nada entra no custo sem alguém mandar entrar. */
export async function criarProduto(): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await receita.criarProduto(usuario.id);
  if (resultado.ok) atualizar();
  return resultado;
}

/**
 * Copia receita, embalagem, tempos, forno, perda, o preço geral vigente e o preço vigente de cada
 * canal que tem preço próprio. O histórico não é copiado.
 */
export async function duplicarProduto(id: number): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await receita.duplicarProduto(usuario.id, id);
  if (resultado.ok) atualizar();
  return resultado;
}

export async function removerProduto(id: number): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await gravacoesVendas.removerProduto(usuario.id, id);
  if (resultado.ok) atualizar();
  return resultado;
}

/* ---------------- linhas de receita (ingrediente, por receita) ---------------- */

export async function salvarLinha(
  id: number,
  campos: { insumoId: number; qtd: string },
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await receita.salvarLinha(usuario.id, id, campos);
  if (resultado.ok) atualizar();
  return resultado;
}

export async function criarLinha(produtoId: number): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await receita.criarLinha(usuario.id, produtoId);
  if (resultado.ok) atualizar();
  return resultado;
}

export async function removerLinha(id: number): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await receita.removerLinha(usuario.id, id);
  if (resultado.ok) atualizar();
  return resultado;
}

/** Tira o alerta "conferir" de uma linha, depois que a dúvida foi resolvida. */
export async function limparAlerta(id: number): Promise<Resultado> {
  await exigirUsuario();
  const db = getDb();
  await db.update(receitaLinhas).set({ alerta: null }).where(eq(receitaLinhas.id, id));
  atualizar();
  return OK;
}

/* ---------------- embalagem do produto (por unidade produzida) ---------------- */

export async function salvarEmbalagemProduto(
  id: number,
  campos: { insumoId: number; qtdPorUnidade: string },
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await receita.salvarEmbalagemProduto(usuario.id, id, campos);
  if (resultado.ok) atualizar();
  return resultado;
}

export async function criarEmbalagemProduto(produtoId: number): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await receita.criarEmbalagemProduto(usuario.id, produtoId);
  if (resultado.ok) atualizar();
  return resultado;
}

export async function removerEmbalagemProduto(id: number): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await receita.removerEmbalagemProduto(usuario.id, id);
  if (resultado.ok) atualizar();
  return resultado;
}

/* ---------------- mão de obra ---------------- */

/** Igual aos outros preços: não sobrescreve, grava registro novo com data. */
export async function salvarCustoHora(valor: string, nota?: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const v = naoNegativo(valor, "Custo da hora");
  if (ehFalha(v)) return v;

  const db = getDb();
  const [atual] = await db
    .select({ valor: custoHora.valor })
    .from(custoHora)
    .orderBy(desc(custoHora.vigenteDesde), desc(custoHora.id))
    .limit(1);

  if (atual && !MUDOU(num(atual.valor), v)) return OK;

  await db.insert(custoHora).values({ alteradoPor: usuario.id, valor: String(v), nota: nota?.slice(0, 200) ?? null });
  atualizar();
  return OK;
}

export type { EntradaVenda, EntradaEvento, ResultadoVenda, ResultadoEvento } from "@/lib/vendas";
export async function registrarVenda(entrada: import("@/lib/vendas").EntradaVenda): Promise<import("@/lib/vendas").ResultadoVenda> {
  const usuario = await exigirUsuario();
  const resultado = await gravacoesVendas.registrarVenda(usuario.id, entrada);
  if (resultado.ok) atualizar();
  return resultado;
}
export async function cancelarVenda(vendaId: number): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await gravacoesVendas.cancelarVenda(usuario.id, vendaId);
  if (resultado.ok) atualizar();
  return resultado;
}
export async function criarEvento(entrada: import("@/lib/vendas").EntradaEvento): Promise<import("@/lib/vendas").ResultadoEvento> {
  const usuario = await exigirUsuario();
  const resultado = await gravacoesVendas.criarEvento(usuario.id, entrada);
  if (resultado.ok) atualizar();
  return resultado;
}
export async function salvarEvento(id: number, entrada: import("@/lib/vendas").EntradaEvento): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await gravacoesVendas.salvarEvento(usuario.id, id, entrada);
  if (resultado.ok) atualizar();
  return resultado;
}
export async function cancelarEvento(id: number): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await gravacoesVendas.cancelarEvento(usuario.id, id);
  if (resultado.ok) atualizar();
  return resultado;
}

/** Etapa 5: "Entendi" no alerta de margem. */
export async function dispensarAlerta(chave: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const resultado = await custos.dispensarAlerta(usuario.id, chave);
  if (resultado.ok) atualizar();
  return resultado;
}
