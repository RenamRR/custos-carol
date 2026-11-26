/**
 * Popula o banco com os dados da planilha original.
 * `npm run db:seed` — usuários e catálogo são inicializados independentemente, só se vazios.
 */
import { sql } from "drizzle-orm";
import { lerUsuariosIniciais } from "./usuarios-iniciais.js";
import { getDb } from "./index.js";
import {
  usuarios,
  insumoPrecos,
  insumos,
  produtoEmbalagens,
  produtoPrecos,
  produtos,
  receitaLinhas,
} from "./schema.js";
import { INSUMOS_INICIAIS, PRODUTOS_INICIAIS } from "./dados-iniciais.js";

async function main() {
  const db = getDb();
  // Independente do catálogo: instalações existentes também recebem os logins.
  await db.transaction(async (tx) => {
    await tx.execute(sql`lock table usuarios in exclusive mode`);
    const existentes = await tx.select({ id: usuarios.id }).from(usuarios).limit(1);
    if (existentes.length === 0 && process.env.USUARIOS_INICIAIS) {
      await tx.insert(usuarios).values(lerUsuariosIniciais(process.env.USUARIOS_INICIAIS));
      console.log("Usuários iniciais criados.");
    }
  });
  await db.transaction(async (tx) => {
    // Serializa o seed entre duas subidas simultâneas; nunca duplica o catálogo.
    await tx.execute(sql`lock table insumos, produtos in exclusive mode`);
    const jaTem = await tx.select({ id: insumos.id }).from(insumos).limit(1);
    const temProdutos = await tx.select({ id: produtos.id }).from(produtos).limit(1);
    if (jaTem.length > 0 || temProdutos.length > 0) {
      console.log("Banco já tem catálogo. Nada a semear no catálogo.");
      return;
    }

    const idPorNome = new Map<string, number>();

    for (const i of INSUMOS_INICIAIS) {
      const [linha] = await tx
        .insert(insumos)
        .values({
          nome: i.nome,
          tipo: i.tipo,
          embalagem: i.embalagem,
          qtd: String(i.qtd),
          unidade: i.unidade,
        })
        .returning({ id: insumos.id });

      idPorNome.set(i.nome, linha.id);
      await tx.insert(insumoPrecos).values({
        insumoId: linha.id,
        preco: String(i.preco),
        nota: "Preço da planilha original",
      });
    }

    const idDe = (nome: string) => {
      const id = idPorNome.get(nome);
      if (!id) throw new Error(`Insumo não encontrado no seed: ${nome}`);
      return id;
    };

    for (const p of PRODUTOS_INICIAIS) {
      const [linha] = await tx
        .insert(produtos)
        .values({
          nome: p.nome,
          rendimento: String(p.rendimento),
          markupAlvo: String(p.markupAlvo),
          minutosPreparo: String(p.minutosPreparo),
          minutosAcabamentoUn: String(p.minutosAcabamentoUn),
        })
        .returning({ id: produtos.id });

      await tx.insert(produtoPrecos).values({
        produtoId: linha.id,
        preco: String(p.precoVenda),
        nota: "Preço da planilha original",
      });

      await tx.insert(receitaLinhas).values(
        p.linhas.map((l, ordem) => ({
          produtoId: linha.id,
          insumoId: idDe(l.insumo),
          qtd: String(l.qtd),
          alerta: l.alerta ?? null,
          ordem,
        })),
      );

      await tx.insert(produtoEmbalagens).values(
        p.embalagens.map((e, ordem) => ({
          produtoId: linha.id,
          insumoId: idDe(e.insumo),
          qtdPorUnidade: String(e.qtdPorUnidade),
          ordem,
        })),
      );
    }

    console.log(
      `Seed pronto: ${INSUMOS_INICIAIS.length} insumos, ${PRODUTOS_INICIAIS.length} produtos.`,
    );
  });
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const erro = err as { code?: unknown; cause?: { code?: unknown } } | null;
    const codigo = erro?.code ?? erro?.cause?.code;
    if (typeof codigo === "string" && /^[A-Z0-9_]{2,30}$/.test(codigo)) {
      console.error(`Código da falha: ${codigo}`);
    }
    console.error("Seed falhou. Verifique conexão, migrações e formato de USUARIOS_INICIAIS; credenciais omitidas.");
    process.exit(1);
  });
