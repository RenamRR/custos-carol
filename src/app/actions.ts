"use server";

import { and, eq, desc, isNull, isNotNull, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import {
  custoHora,
  insumoPrecos,
  insumos,
  produtoEmbalagens,
  produtoPrecos,
  produtos,
  receitaLinhas,
} from "@/db/schema";
import { num, parseNumeroBR } from "@/lib/calc";

import { exigirUsuario } from "@/lib/auth";
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
const falha = (erro: string): Resultado => ({ ok: false, erro });

/** Preço só vira registro novo se mudou de fato — senão o histórico enche de ruído. */
const MUDOU = (a: number, b: number) => Math.abs(a - b) > 0.00005;

function texto(valor: unknown, campo: string, max = 200): string | Resultado {
  if (typeof valor !== "string") return falha(`${campo} inválido.`);
  const t = valor.trim();
  if (t.length === 0) return falha(`${campo} não pode ficar vazio.`);
  if (t.length > max) return falha(`${campo} passou de ${max} caracteres.`);
  return t;
}

function positivo(valor: unknown, campo: string): number | Resultado {
  const n = typeof valor === "string" || typeof valor === "number" ? parseNumeroBR(valor) : NaN;
  if (!Number.isFinite(n) || n <= 0) return falha(`${campo} tem que ser maior que zero.`);
  return n;
}

function naoNegativo(valor: unknown, campo: string): number | Resultado {
  const n = typeof valor === "string" || typeof valor === "number" ? parseNumeroBR(valor) : NaN;
  if (!Number.isFinite(n) || n < 0) return falha(`${campo} não pode ser negativo.`);
  return n;
}

const ehFalha = (v: unknown): v is Resultado =>
  typeof v === "object" && v !== null && "ok" in v && (v as Resultado).ok === false;

function atualizar() {
  revalidatePath("/", "layout");
}

/* ---------------- insumos (catálogo) ---------------- */

export async function salvarInsumo(
  id: number,
  campos: { nome: string; embalagem: string; qtd: string; unidade: string },
): Promise<Resultado> {
  await exigirUsuario();
  const nome = texto(campos.nome, "Nome");
  if (ehFalha(nome)) return nome;
  const unidade = texto(campos.unidade, "Unidade", 20);
  if (ehFalha(unidade)) return unidade;
  const qtd = positivo(campos.qtd, "Quantidade da embalagem");
  if (ehFalha(qtd)) return qtd;

  const db = getDb();
  const [linha] = await db
    .update(insumos)
    .set({
      nome,
      embalagem: String(campos.embalagem ?? "").trim().slice(0, 200),
      qtd: String(qtd),
      unidade,
    })
    .where(eq(insumos.id, id))
    .returning({ id: insumos.id });

  if (!linha) return falha("Insumo não encontrado.");
  atualizar();
  return OK;
}

export async function salvarPrecoInsumo(id: number, preco: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const valor = naoNegativo(preco, "Preço");
  if (ehFalha(valor)) return valor;

  const db = getDb();
  const [atual] = await db
    .select({ preco: insumoPrecos.preco })
    .from(insumoPrecos)
    .where(eq(insumoPrecos.insumoId, id))
    .orderBy(desc(insumoPrecos.vigenteDesde), desc(insumoPrecos.id))
    .limit(1);

  if (atual && !MUDOU(num(atual.preco), valor)) return OK;

  await db.insert(insumoPrecos).values({ alteradoPor: usuario.id, insumoId: id, preco: String(valor) });
  atualizar();
  return OK;
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

export async function removerInsumo(id: number): Promise<Resultado> {
  await exigirUsuario();
  const db = getDb();

  // As FKs são `on delete restrict`: sem estas checagens o Postgres devolveria um
  // erro cru de constraint em vez de dizer onde o insumo está sendo usado.
  const emReceitas = await db
    .select({ produto: produtos.nome })
    .from(receitaLinhas)
    .innerJoin(produtos, eq(produtos.id, receitaLinhas.produtoId))
    .where(eq(receitaLinhas.insumoId, id));

  const emEmbalagens = await db
    .select({ produto: produtos.nome })
    .from(produtoEmbalagens)
    .innerJoin(produtos, eq(produtos.id, produtoEmbalagens.produtoId))
    .where(eq(produtoEmbalagens.insumoId, id));

  const usos = [...emReceitas, ...emEmbalagens];
  if (usos.length > 0) {
    const nomes = Array.from(new Set(usos.map((u) => u.produto))).join(", ");
    return falha(`Está sendo usado em: ${nomes}. Remova de lá primeiro.`);
  }

  await db.delete(insumos).where(eq(insumos.id, id));
  atualizar();
  return OK;
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
  await exigirUsuario();
  const nome = texto(campos.nome, "Nome");
  if (ehFalha(nome)) return nome;
  const rendimento = positivo(campos.rendimento, "Rendimento");
  if (ehFalha(rendimento)) return rendimento;
  const markupAlvo = campos.markupAlvo === undefined ? undefined : naoNegativo(campos.markupAlvo, "Markup alvo");
  if (ehFalha(markupAlvo)) return markupAlvo;
  const minutosPreparo = naoNegativo(campos.minutosPreparo, "Tempo de preparo");
  if (ehFalha(minutosPreparo)) return minutosPreparo;
  const minutosAcabamentoUn = naoNegativo(campos.minutosAcabamentoUn, "Tempo de acabamento");
  if (ehFalha(minutosAcabamentoUn)) return minutosAcabamentoUn;

  const db = getDb();
  const [linha] = await db
    .update(produtos)
    .set({
      nome,
      rendimento: String(rendimento),
      ...(markupAlvo === undefined ? {} : { markupAlvo: String(markupAlvo) }),
      minutosPreparo: String(minutosPreparo),
      minutosAcabamentoUn: String(minutosAcabamentoUn),
    })
    .where(eq(produtos.id, id))
    .returning({ id: produtos.id });

  if (!linha) return falha("Produto não encontrado.");
  atualizar();
  return OK;
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
  const db = getDb();
  await db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(produtos)
      .values({ nome: "Novo produto", rendimento: "12", markupAlvo: "3.50" })
      .returning({ id: produtos.id });
    await tx.insert(produtoPrecos).values({ alteradoPor: usuario.id, produtoId: linha.id, preco: "0" });
  });
  atualizar();
  return OK;
}

/**
 * Copia receita, embalagem, tempos, forno, perda, o preço geral vigente e o preço vigente de cada
 * canal que tem preço próprio. O histórico não é copiado.
 */
export async function duplicarProduto(id: number): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const db = getDb();

  const [original] = await db.select().from(produtos).where(eq(produtos.id, id)).limit(1);
  if (!original) return falha("Produto não encontrado.");

  await db.transaction(async (tx) => {
    const [novo] = await tx
      .insert(produtos)
      .values({
        nome: `${original.nome} (cópia)`.slice(0, 200),
        rendimento: original.rendimento,
        markupAlvo: original.markupAlvo,
        minutosPreparo: original.minutosPreparo,
        minutosAcabamentoUn: original.minutosAcabamentoUn,
        minutosForno: original.minutosForno,
        perdaPct: original.perdaPct,
      })
      .returning({ id: produtos.id });

    const [preco] = await tx
      .select({ preco: produtoPrecos.preco })
      .from(produtoPrecos)
      .where(and(
        eq(produtoPrecos.produtoId, id),
        isNull(produtoPrecos.canalId),
        lte(produtoPrecos.vigenteDesde, sql`now()`),
      ))
      .orderBy(desc(produtoPrecos.vigenteDesde), desc(produtoPrecos.id))
      .limit(1);

    await tx.insert(produtoPrecos).values({
      alteradoPor: usuario.id,
      produtoId: novo.id,
      preco: preco?.preco ?? "0",
      nota: `Copiado de ${original.nome}`,
    });

    // Preço próprio de cada canal: a linha vigente mais recente por canal_id.
    const porCanal = await tx
      .selectDistinctOn([produtoPrecos.canalId], {
        canalId: produtoPrecos.canalId,
        preco: produtoPrecos.preco,
      })
      .from(produtoPrecos)
      .where(and(
        eq(produtoPrecos.produtoId, id),
        isNotNull(produtoPrecos.canalId),
        lte(produtoPrecos.vigenteDesde, sql`now()`),
      ))
      .orderBy(produtoPrecos.canalId, desc(produtoPrecos.vigenteDesde), desc(produtoPrecos.id));

    if (porCanal.length > 0) {
      await tx.insert(produtoPrecos).values(
        porCanal.map((p) => ({
          alteradoPor: usuario.id,
          produtoId: novo.id,
          canalId: p.canalId,
          preco: p.preco,
          nota: `Copiado de ${original.nome}`,
        })),
      );
    }

    const linhas = await tx
      .select()
      .from(receitaLinhas)
      .where(eq(receitaLinhas.produtoId, id))
      .orderBy(receitaLinhas.ordem, receitaLinhas.id);

    if (linhas.length > 0) {
      await tx.insert(receitaLinhas).values(
        linhas.map((l, i) => ({
          produtoId: novo.id,
          insumoId: l.insumoId,
          qtd: l.qtd,
          alerta: l.alerta,
          ordem: i,
        })),
      );
    }

    const embalagens = await tx
      .select()
      .from(produtoEmbalagens)
      .where(eq(produtoEmbalagens.produtoId, id))
      .orderBy(produtoEmbalagens.ordem, produtoEmbalagens.id);

    if (embalagens.length > 0) {
      await tx.insert(produtoEmbalagens).values(
        embalagens.map((e, i) => ({
          produtoId: novo.id,
          insumoId: e.insumoId,
          qtdPorUnidade: e.qtdPorUnidade,
          ordem: i,
        })),
      );
    }
  });

  atualizar();
  return OK;
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
  await exigirUsuario();
  const qtd = naoNegativo(campos.qtd, "Quantidade");
  if (ehFalha(qtd)) return qtd;

  const db = getDb();
  const [insumo] = await db
    .select({ tipo: insumos.tipo })
    .from(insumos)
    .where(eq(insumos.id, campos.insumoId))
    .limit(1);

  if (!insumo) return falha("Insumo não encontrado.");
  if (insumo.tipo === "embalagem") {
    return falha("Material de embalagem entra na seção de embalagem, não na receita.");
  }

  const [linha] = await db
    .update(receitaLinhas)
    .set({ insumoId: campos.insumoId, qtd: String(qtd) })
    .where(eq(receitaLinhas.id, id))
    .returning({ id: receitaLinhas.id });

  if (!linha) return falha("Linha não encontrada.");
  atualizar();
  return OK;
}

export async function criarLinha(produtoId: number): Promise<Resultado> {
  await exigirUsuario();
  const db = getDb();
  const [primeiro] = await db
    .select({ id: insumos.id })
    .from(insumos)
    .where(and(eq(insumos.tipo, "ingrediente"), eq(insumos.ativo, true)))
    .orderBy(insumos.nome)
    .limit(1);

  if (!primeiro) return falha("Cadastre um ingrediente antes.");

  const [{ proxima }] = await db
    .select({ proxima: sql<number>`coalesce(max(${receitaLinhas.ordem}), -1) + 1` })
    .from(receitaLinhas)
    .where(eq(receitaLinhas.produtoId, produtoId));

  await db
    .insert(receitaLinhas)
    .values({ produtoId, insumoId: primeiro.id, qtd: "0", ordem: proxima });

  atualizar();
  return OK;
}

export async function removerLinha(id: number): Promise<Resultado> {
  await exigirUsuario();
  const db = getDb();
  await db.delete(receitaLinhas).where(eq(receitaLinhas.id, id));
  atualizar();
  return OK;
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
  await exigirUsuario();
  const qtd = naoNegativo(campos.qtdPorUnidade, "Quantidade por unidade");
  if (ehFalha(qtd)) return qtd;

  const db = getDb();
  const [insumo] = await db
    .select({ tipo: insumos.tipo })
    .from(insumos)
    .where(eq(insumos.id, campos.insumoId))
    .limit(1);

  if (!insumo) return falha("Material não encontrado.");
  if (insumo.tipo !== "embalagem") {
    return falha("Só material de embalagem entra aqui. Ingrediente vai na receita.");
  }

  try {
    const [linha] = await db
      .update(produtoEmbalagens)
      .set({ insumoId: campos.insumoId, qtdPorUnidade: String(qtd) })
      .where(eq(produtoEmbalagens.id, id))
      .returning({ id: produtoEmbalagens.id });

    if (!linha) return falha("Linha não encontrada.");
  } catch {
    return falha("Esse material já está nessa receita. Ajuste a quantidade da linha existente.");
  }

  atualizar();
  return OK;
}

export async function criarEmbalagemProduto(produtoId: number): Promise<Resultado> {
  await exigirUsuario();
  const db = getDb();

  const usados = await db
    .select({ insumoId: produtoEmbalagens.insumoId })
    .from(produtoEmbalagens)
    .where(eq(produtoEmbalagens.produtoId, produtoId));
  const jaUsados = new Set(usados.map((u) => u.insumoId));

  const catalogo = await db
    .select({ id: insumos.id })
    .from(insumos)
    .where(and(eq(insumos.tipo, "embalagem"), eq(insumos.ativo, true)))
    .orderBy(insumos.nome);

  const livre = catalogo.find((c) => !jaUsados.has(c.id));
  if (!livre) {
    return falha(
      catalogo.length === 0
        ? "Cadastre um material na aba Embalagem antes."
        : "Todos os materiais do catálogo já estão nesta receita.",
    );
  }

  const [{ proxima }] = await db
    .select({ proxima: sql<number>`coalesce(max(${produtoEmbalagens.ordem}), -1) + 1` })
    .from(produtoEmbalagens)
    .where(eq(produtoEmbalagens.produtoId, produtoId));

  await db
    .insert(produtoEmbalagens)
    .values({ produtoId, insumoId: livre.id, qtdPorUnidade: "1", ordem: proxima });

  atualizar();
  return OK;
}

export async function removerEmbalagemProduto(id: number): Promise<Resultado> {
  await exigirUsuario();
  const db = getDb();
  await db.delete(produtoEmbalagens).where(eq(produtoEmbalagens.id, id));
  atualizar();
  return OK;
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
