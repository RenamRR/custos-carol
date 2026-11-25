/**
 * Popula o banco com os dados da planilha original.
 * `npm run db:seed` — não faz nada se já houver insumos cadastrados.
 */
import { getDb } from "./index.js";
import {
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
  const jaTem = await db.select({ id: insumos.id }).from(insumos).limit(1);
  if (jaTem.length > 0) {
    console.log("Banco já tem insumos. Nada a fazer.");
    return;
  }

  await db.transaction(async (tx) => {
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
  });

  console.log(
    `Seed pronto: ${INSUMOS_INICIAIS.length} insumos, ${PRODUTOS_INICIAIS.length} produtos.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
