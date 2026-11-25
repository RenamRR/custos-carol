/**
 * Teste de integração do histórico de preço, contra o banco real.
 * `npm run test:precos`
 *
 * Insere um preço novo, confere que o "atual" mudou e que o antigo continua lá,
 * e apaga a linha de teste no finally — o banco volta exatamente ao estado anterior.
 */
import { desc, eq } from "drizzle-orm";
import { getDb } from "./index.js";
import { insumoPrecos, insumos } from "./schema.js";
import { brl, calcularProduto, custoPorUnidadeDeMedida, num } from "../lib/calc.js";
import { carregarInsumos, carregarProdutos } from "../lib/queries.js";

const ALVO = "Cacau 70%";
const PRECO_TESTE = 34;

let falhas = 0;
function checa(rotulo: string, condicao: boolean, detalhe = "") {
  if (condicao) {
    console.log(`  ok   ${rotulo}`);
  } else {
    console.error(`  FALHA ${rotulo} ${detalhe}`);
    falhas += 1;
  }
}

async function main() {
  const db = getDb();

  const [alvo] = await db.select().from(insumos).where(eq(insumos.nome, ALVO)).limit(1);
  if (!alvo) throw new Error(`Insumo "${ALVO}" não existe no banco.`);

  const antes = await carregarInsumos();
  const produtosAntes = await carregarProdutos();
  const insumoAntes = antes.find((i) => i.id === alvo.id);
  if (!insumoAntes) throw new Error("Insumo sumiu entre as leituras.");

  const tradicionalAntes = produtosAntes.find((p) => p.nome === "Brownie Tradicional");
  if (!tradicionalAntes) throw new Error("Brownie Tradicional não existe no banco.");
  const custoAntes = calcularProduto(tradicionalAntes, antes).custoUnitario;

  const historicoAntes = await db
    .select()
    .from(insumoPrecos)
    .where(eq(insumoPrecos.insumoId, alvo.id));

  console.log(`Alvo: ${ALVO}`);
  console.log(`  preço atual   : ${brl(insumoAntes.preco)}`);
  console.log(`  registros     : ${historicoAntes.length}`);
  console.log(`  Tradicional/un: ${brl(custoAntes)}\n`);

  let idTeste: number | null = null;
  try {
    const [novo] = await db
      .insert(insumoPrecos)
      .values({ insumoId: alvo.id, preco: String(PRECO_TESTE), nota: "TESTE AUTOMATIZADO" })
      .returning({ id: insumoPrecos.id });
    idTeste = novo.id;

    const depois = await carregarInsumos();
    const produtosDepois = await carregarProdutos();
    const insumoDepois = depois.find((i) => i.id === alvo.id);
    const tradicionalDepois = produtosDepois.find((p) => p.nome === "Brownie Tradicional");
    const custoDepois = calcularProduto(tradicionalDepois!, depois).custoUnitario;

    const historicoDepois = await db
      .select()
      .from(insumoPrecos)
      .where(eq(insumoPrecos.insumoId, alvo.id))
      .orderBy(desc(insumoPrecos.vigenteDesde), desc(insumoPrecos.id));

    console.log("Depois de inserir preço novo:");
    checa(
      `preço atual virou ${brl(PRECO_TESTE)}`,
      insumoDepois?.preco === PRECO_TESTE,
      `(obtido ${insumoDepois?.preco})`,
    );
    checa(
      "o preço antigo continua no histórico",
      historicoDepois.some((h) => Math.abs(num(h.preco) - insumoAntes.preco) < 1e-6),
    );
    checa(
      `histórico cresceu de ${historicoAntes.length} para ${historicoAntes.length + 1}`,
      historicoDepois.length === historicoAntes.length + 1,
      `(obtido ${historicoDepois.length})`,
    );

    // 135g de Cacau 70%: (34-30)/500 * 135 = R$ 1,08 na receita, /12 = R$ 0,09 por unidade
    const delta = ((PRECO_TESTE - insumoAntes.preco) / insumoAntes.qtd) * 135;
    const esperado = custoAntes + delta / tradicionalAntes.rendimento;
    checa(
      `custo do Tradicional foi de ${brl(custoAntes)} para ${brl(custoDepois)}`,
      Math.abs(custoDepois - esperado) < 0.0001,
      `(esperado ${brl(esperado)})`,
    );
    checa(
      "custo unitário derivado bate com o preço novo",
      Math.abs(custoPorUnidadeDeMedida(insumoDepois!) - PRECO_TESTE / insumoAntes.qtd) < 1e-9,
    );
  } finally {
    if (idTeste !== null) {
      await db.delete(insumoPrecos).where(eq(insumoPrecos.id, idTeste));
    }
  }

  const restaurado = await carregarInsumos();
  const produtosRestaurados = await carregarProdutos();
  const insumoRestaurado = restaurado.find((i) => i.id === alvo.id);
  const tradRest = produtosRestaurados.find((p) => p.nome === "Brownie Tradicional");
  const custoRest = calcularProduto(tradRest!, restaurado).custoUnitario;

  console.log("\nDepois de limpar a linha de teste:");
  checa(
    `preço voltou para ${brl(insumoAntes.preco)}`,
    Math.abs((insumoRestaurado?.preco ?? -1) - insumoAntes.preco) < 1e-9,
  );
  checa(
    `custo do Tradicional voltou para ${brl(custoAntes)}`,
    Math.abs(custoRest - custoAntes) < 1e-9,
  );

  const historicoFinal = await db
    .select()
    .from(insumoPrecos)
    .where(eq(insumoPrecos.insumoId, alvo.id));
  checa(
    "banco voltou ao número original de registros",
    historicoFinal.length === historicoAntes.length,
    `(${historicoFinal.length} vs ${historicoAntes.length})`,
  );

  console.log(falhas === 0 ? "\nOK — histórico de preço se comporta como projetado." : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
