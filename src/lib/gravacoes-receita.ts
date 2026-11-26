import "server-only";
// Interno: só actions.ts chama, com usuarioId vindo de exigirUsuario(). Nunca usar "use server" aqui.
//
// Etapa 6: tudo que mexe em receita, produto ou `insumos.qtd` roda em comAutor, para os triggers
// da 0007 gravarem a versão da receita / a troca de embalagem com o autor certo. As mensagens são
// as mesmas que estas funções tinham em actions.ts.
import { and, desc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { insumoPrecos, insumos, produtoEmbalagens, produtoPrecos, produtos, receitaLinhas, receitaVersoes } from "../db/schema";
import type { Resultado } from "../app/actions";
import { num, parseNumeroBR } from "./calc";
import { comAutor } from "./autoria";
import { idValido } from "./validacao-custo";

const OK: Resultado = { ok: true };
const falha = (erro: string): Resultado => ({ ok: false, erro });

/** Preço só vira registro novo se mudou de fato — senão o histórico enche de ruído. */
export const MUDOU = (a: number, b: number) => Math.abs(a - b) > 0.00005;

export function texto(valor: unknown, campo: string, max = 200): string | Resultado {
  if (typeof valor !== "string") return falha(`${campo} inválido.`);
  const t = valor.trim();
  if (t.length === 0) return falha(`${campo} não pode ficar vazio.`);
  if (t.length > max) return falha(`${campo} passou de ${max} caracteres.`);
  return t;
}

export function positivo(valor: unknown, campo: string): number | Resultado {
  const n = typeof valor === "string" || typeof valor === "number" ? parseNumeroBR(valor) : NaN;
  if (!Number.isFinite(n) || n <= 0) return falha(`${campo} tem que ser maior que zero.`);
  return n;
}

export function naoNegativo(valor: unknown, campo: string): number | Resultado {
  const n = typeof valor === "string" || typeof valor === "number" ? parseNumeroBR(valor) : NaN;
  if (!Number.isFinite(n) || n < 0) return falha(`${campo} não pode ser negativo.`);
  return n;
}

export const ehFalha = (v: unknown): v is Resultado =>
  typeof v === "object" && v !== null && "ok" in v && (v as Resultado).ok === false;

/* ---------------- insumos (catálogo) ---------------- */

export async function salvarInsumo(
  usuarioId: number,
  id: number,
  campos: { nome: string; embalagem: string; qtd: string; unidade: string },
): Promise<Resultado> {
  const nome = texto(campos.nome, "Nome");
  if (ehFalha(nome)) return nome;
  const unidade = texto(campos.unidade, "Unidade", 20);
  if (ehFalha(unidade)) return unidade;
  const qtd = positivo(campos.qtd, "Quantidade da embalagem");
  if (ehFalha(qtd)) return qtd;

  // Se `qtd` mudar, o trigger grava o preço vigente com a embalagem nova, com o autor.
  const [linha] = await comAutor(usuarioId, (tx) => tx
    .update(insumos)
    .set({
      nome,
      embalagem: String(campos.embalagem ?? "").trim().slice(0, 200),
      qtd: String(qtd),
      unidade,
    })
    .where(eq(insumos.id, id))
    .returning({ id: insumos.id }));

  return linha ? OK : falha("Insumo não encontrado.");
}

/** Janela em que "troquei o pacote e o preço" vira uma mudança só (a mesma da sessão da receita). */
const JANELA_SESSAO = sql`interval '10 minutes'`;

/** `mudou` = gravou algo (a action só revalida a tela nesse caso). */
export async function salvarPrecoInsumo(usuarioId: number, id: number, preco: string): Promise<Resultado & { mudou?: boolean }> {
  const valor = naoNegativo(preco, "Preço");
  if (ehFalha(valor)) return valor;

  const mudou = await comAutor(usuarioId, async (tx) => {
    const [atual] = await tx
      .select({
        id: insumoPrecos.id,
        preco: insumoPrecos.preco,
        origem: insumoPrecos.origem,
        alteradoPor: insumoPrecos.alteradoPor,
        recente: sql<boolean>`${insumoPrecos.vigenteDesde} > now() - ${JANELA_SESSAO}`,
      })
      .from(insumoPrecos)
      .where(and(eq(insumoPrecos.insumoId, id), lte(insumoPrecos.vigenteDesde, sql`now()`)))
      .orderBy(desc(insumoPrecos.vigenteDesde), desc(insumoPrecos.id))
      .limit(1)
      .for("update");

    if (atual && !MUDOU(num(atual.preco), valor)) return false;

    // A mais recente é a que o trigger gravou quando ela mesma trocou a embalagem, há pouco:
    // o preço novo entra nela, sem o degrau falso "preço antigo ÷ embalagem nova" no meio.
    if (atual && atual.origem === "embalagem" && atual.alteradoPor === usuarioId && atual.recente === true) {
      await tx.update(insumoPrecos).set({ preco: String(valor) }).where(eq(insumoPrecos.id, atual.id));
      return true;
    }
    await tx.insert(insumoPrecos).values({ alteradoPor: usuarioId, insumoId: id, preco: String(valor) });
    return true;
  });
  return { ok: true, mudou };
}

/**
 * Em uso numa receita de hoje: recusa e diz onde. Senão, se aparece em alguma versão de receita,
 * arquiva (apagar levaria os preços junto, em cascade, e o passado perderia o custo). Senão, apaga.
 */
export async function removerInsumo(id: number): Promise<Resultado> {
  if (!idValido(id)) return falha("Insumo inválido.");
  return getDb().transaction(async (tx) => {
    // As FKs são `on delete restrict`: sem estas checagens o Postgres devolveria um
    // erro cru de constraint em vez de dizer onde o insumo está sendo usado.
    const emReceitas = await tx
      .select({ produto: produtos.nome })
      .from(receitaLinhas)
      .innerJoin(produtos, eq(produtos.id, receitaLinhas.produtoId))
      .where(eq(receitaLinhas.insumoId, id));

    const emEmbalagens = await tx
      .select({ produto: produtos.nome })
      .from(produtoEmbalagens)
      .innerJoin(produtos, eq(produtos.id, produtoEmbalagens.produtoId))
      .where(eq(produtoEmbalagens.insumoId, id));

    const usos = [...emReceitas, ...emEmbalagens];
    if (usos.length > 0) {
      const nomes = Array.from(new Set(usos.map((u) => u.produto))).join(", ");
      return falha(`Está sendo usado em: ${nomes}. Remova de lá primeiro.`);
    }

    const item = JSON.stringify([{ insumoId: id }]);
    const [naHistoria] = await tx
      .select({ id: receitaVersoes.id })
      .from(receitaVersoes)
      .where(or(
        sql`${receitaVersoes.receita} -> 'linhas' @> ${item}::jsonb`,
        sql`${receitaVersoes.receita} -> 'embalagens' @> ${item}::jsonb`,
      ))
      .limit(1);

    if (naHistoria) await tx.update(insumos).set({ ativo: false }).where(eq(insumos.id, id));
    else await tx.delete(insumos).where(eq(insumos.id, id));
    return OK;
  });
}

/* ---------------- produtos ---------------- */

export async function salvarProduto(
  usuarioId: number,
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

  const [linha] = await comAutor(usuarioId, (tx) => tx
    .update(produtos)
    .set({
      nome,
      rendimento: String(rendimento),
      ...(markupAlvo === undefined ? {} : { markupAlvo: String(markupAlvo) }),
      minutosPreparo: String(minutosPreparo),
      minutosAcabamentoUn: String(minutosAcabamentoUn),
    })
    .where(eq(produtos.id, id))
    .returning({ id: produtos.id }));

  return linha ? OK : falha("Produto não encontrado.");
}

/** Nasce sem nenhuma embalagem: nada entra no custo sem alguém mandar entrar. */
export async function criarProduto(usuarioId: number): Promise<Resultado> {
  await comAutor(usuarioId, async (tx) => {
    const [linha] = await tx
      .insert(produtos)
      .values({ nome: "Novo produto", rendimento: "12", markupAlvo: "3.50" })
      .returning({ id: produtos.id });
    await tx.insert(produtoPrecos).values({ alteradoPor: usuarioId, produtoId: linha.id, preco: "0" });
  });
  return OK;
}

/**
 * Copia receita, embalagem, tempos, forno (inclusive "não vai ao forno"), perda, o preço geral
 * vigente e o preço vigente de cada canal que tem preço próprio. O histórico não é copiado: tudo
 * na mesma transação, o produto novo nasce com UMA versão da receita.
 */
export async function duplicarProduto(usuarioId: number, id: number): Promise<Resultado> {
  const db = getDb();

  const [original] = await db.select().from(produtos).where(eq(produtos.id, id)).limit(1);
  if (!original) return falha("Produto não encontrado.");

  await comAutor(usuarioId, async (tx) => {
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
        semForno: original.semForno,
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
      alteradoPor: usuarioId,
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
          alteradoPor: usuarioId,
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

  return OK;
}

/* ---------------- linhas de receita (ingrediente, por receita) ---------------- */

export async function salvarLinha(
  usuarioId: number,
  id: number,
  campos: { insumoId: number; qtd: string },
): Promise<Resultado> {
  const qtd = naoNegativo(campos.qtd, "Quantidade");
  if (ehFalha(qtd)) return qtd;

  const [insumo] = await getDb()
    .select({ tipo: insumos.tipo })
    .from(insumos)
    .where(eq(insumos.id, campos.insumoId))
    .limit(1);

  if (!insumo) return falha("Insumo não encontrado.");
  if (insumo.tipo === "embalagem") {
    return falha("Material de embalagem entra na seção de embalagem, não na receita.");
  }

  const [linha] = await comAutor(usuarioId, (tx) => tx
    .update(receitaLinhas)
    .set({ insumoId: campos.insumoId, qtd: String(qtd) })
    .where(eq(receitaLinhas.id, id))
    .returning({ id: receitaLinhas.id }));

  return linha ? OK : falha("Linha não encontrada.");
}

export async function criarLinha(usuarioId: number, produtoId: number): Promise<Resultado> {
  return comAutor(usuarioId, async (tx) => {
    const [primeiro] = await tx
      .select({ id: insumos.id })
      .from(insumos)
      .where(and(eq(insumos.tipo, "ingrediente"), eq(insumos.ativo, true)))
      .orderBy(insumos.nome)
      .limit(1);

    if (!primeiro) return falha("Cadastre um ingrediente antes.");

    const [{ proxima }] = await tx
      .select({ proxima: sql<number>`coalesce(max(${receitaLinhas.ordem}), -1) + 1` })
      .from(receitaLinhas)
      .where(eq(receitaLinhas.produtoId, produtoId));

    await tx
      .insert(receitaLinhas)
      .values({ produtoId, insumoId: primeiro.id, qtd: "0", ordem: proxima });
    return OK;
  });
}

export async function removerLinha(usuarioId: number, id: number): Promise<Resultado> {
  await comAutor(usuarioId, (tx) => tx.delete(receitaLinhas).where(eq(receitaLinhas.id, id)));
  return OK;
}

/* ---------------- embalagem do produto (por unidade produzida) ---------------- */

export async function salvarEmbalagemProduto(
  usuarioId: number,
  id: number,
  campos: { insumoId: number; qtdPorUnidade: string },
): Promise<Resultado> {
  const qtd = naoNegativo(campos.qtdPorUnidade, "Quantidade por unidade");
  if (ehFalha(qtd)) return qtd;

  const [insumo] = await getDb()
    .select({ tipo: insumos.tipo })
    .from(insumos)
    .where(eq(insumos.id, campos.insumoId))
    .limit(1);

  if (!insumo) return falha("Material não encontrado.");
  if (insumo.tipo !== "embalagem") {
    return falha("Só material de embalagem entra aqui. Ingrediente vai na receita.");
  }

  try {
    // O erro de unicidade derruba a transação inteira (rollback) antes de cair no catch.
    const [linha] = await comAutor(usuarioId, (tx) => tx
      .update(produtoEmbalagens)
      .set({ insumoId: campos.insumoId, qtdPorUnidade: String(qtd) })
      .where(eq(produtoEmbalagens.id, id))
      .returning({ id: produtoEmbalagens.id }));

    if (!linha) return falha("Linha não encontrada.");
  } catch {
    return falha("Esse material já está nessa receita. Ajuste a quantidade da linha existente.");
  }
  return OK;
}

export async function criarEmbalagemProduto(usuarioId: number, produtoId: number): Promise<Resultado> {
  return comAutor(usuarioId, async (tx) => {
    const usados = await tx
      .select({ insumoId: produtoEmbalagens.insumoId })
      .from(produtoEmbalagens)
      .where(eq(produtoEmbalagens.produtoId, produtoId));
    const jaUsados = new Set(usados.map((u) => u.insumoId));

    const catalogo = await tx
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

    const [{ proxima }] = await tx
      .select({ proxima: sql<number>`coalesce(max(${produtoEmbalagens.ordem}), -1) + 1` })
      .from(produtoEmbalagens)
      .where(eq(produtoEmbalagens.produtoId, produtoId));

    await tx
      .insert(produtoEmbalagens)
      .values({ produtoId, insumoId: livre.id, qtdPorUnidade: "1", ordem: proxima });
    return OK;
  });
}

export async function removerEmbalagemProduto(usuarioId: number, id: number): Promise<Resultado> {
  await comAutor(usuarioId, (tx) => tx.delete(produtoEmbalagens).where(eq(produtoEmbalagens.id, id)));
  return OK;
}
