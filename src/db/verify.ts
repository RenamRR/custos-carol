/**
 * Sanidade dos dados vivos: lê pela MESMA camada de queries que a página usa e
 * checa invariantes do modelo. `npm run db:verify`
 *
 * NÃO compara com os números da planilha — esses são dados editáveis e já mudaram.
 * A conferência contra a planilha vive em `npm run test:calc`, que roda sobre o seed.
 */
import {
  brl,
  brl4,
  calcularProduto,
  custoPorUnidadeDeMedida,
  embalagemPorUnidade,
  formatarMinutos,
  minutosDoLote,
  nivelMargem,
} from "../lib/calc.js";
import { carregarCustoHora, carregarInsumos, carregarProdutos } from "../lib/queries.js";

let falhas = 0;
function exige(condicao: boolean, mensagem: string) {
  if (!condicao) {
    console.error(`  FALHA ${mensagem}`);
    falhas += 1;
  }
}

async function main() {
  const [insumos, produtos, custoHora] = await Promise.all([
    carregarInsumos(),
    carregarProdutos(),
    carregarCustoHora(),
  ]);
  const porId = new Map(insumos.map((i) => [i.id, i]));

  const ingredientes = insumos.filter((i) => i.tipo === "ingrediente");
  const materiais = insumos.filter((i) => i.tipo === "embalagem");
  console.log(
    `Catálogo: ${ingredientes.length} ingredientes, ${materiais.length} materiais de embalagem`,
  );
  console.log(`Produtos: ${produtos.length}`);
  console.log(
    custoHora > 0
      ? `Custo da hora: ${brl(custoHora)}\n`
      : "Custo da hora: não definido — mão de obra não entra no cálculo\n",
  );

  // --- catálogo ---
  for (const i of insumos) {
    exige(i.qtd > 0, `"${i.nome}" tem quantidade de compra ${i.qtd} (precisa ser > 0)`);
    exige(Number.isFinite(custoPorUnidadeDeMedida(i)), `"${i.nome}" gera custo não-finito`);
    if (i.preco === 0) console.warn(`  aviso: "${i.nome}" está sem preço vigente`);
  }

  // --- produtos ---
  console.log(
    "Produto                    Insumos  Embalag.   M. obra     Total  Custo/un   Margem  nível",
  );
  for (const p of produtos) {
    const r = calcularProduto(p, insumos, custoHora);
    console.log(
      p.nome.slice(0, 24).padEnd(24) +
        brl(r.custoInsumos).padStart(10) +
        brl(r.custoEmbalagem).padStart(10) +
        brl(r.custoMaoDeObra).padStart(10) +
        brl(r.custoTotal).padStart(10) +
        brl(r.custoUnitario).padStart(10) +
        `${r.margemPct.toFixed(0)}%`.padStart(9) +
        "  " +
        nivelMargem(r.margemPct),
    );

    // mão de obra = (preparo + acabamento × rendimento) / 60 × valor da hora
    const minutos = minutosDoLote(p, r.rendimento);
    exige(
      Math.abs(r.minutosLote - minutos) < 1e-9,
      `${p.nome}: minutos do lote não batem com preparo + acabamento`,
    );
    exige(
      Math.abs(r.custoMaoDeObra - (minutos / 60) * custoHora) < 1e-9,
      `${p.nome}: custo de mão de obra não bate com o tempo declarado`,
    );
    exige(
      Math.abs(r.custoTotal - (r.custoDireto + r.custoMaoDeObra)) < 1e-9,
      `${p.nome}: total não fecha com direto + mão de obra`,
    );

    // a soma dos segmentos tem que fechar com o total
    const soma = r.segmentos.reduce((a, s) => a + s.valor, 0);
    exige(Math.abs(soma - r.custoTotal) < 1e-9, `${p.nome}: segmentos não fecham com o total`);

    // embalagem do produto = o que ele declarou, vezes o rendimento
    const esperado = embalagemPorUnidade(p, insumos) * r.rendimento;
    exige(
      Math.abs(r.custoEmbalagem - esperado) < 1e-9,
      `${p.nome}: custo de embalagem não bate com os materiais declarados`,
    );

    exige(Number.isFinite(r.custoUnitario), `${p.nome}: custo por unidade não-finito`);
    exige(Number.isFinite(r.markup), `${p.nome}: markup não-finito`);
    exige(r.rendimento > 0, `${p.nome}: rendimento ${r.rendimento}`);

    // integridade das duas escalas
    for (const l of p.linhas) {
      const ins = porId.get(l.insumoId);
      exige(ins !== undefined, `${p.nome}: linha de receita aponta para insumo inexistente`);
      if (ins) {
        exige(
          ins.tipo === "ingrediente",
          `${p.nome}: "${ins.nome}" é material de embalagem e está na receita`,
        );
      }
    }
    for (const e of p.embalagens) {
      const ins = porId.get(e.insumoId);
      exige(ins !== undefined, `${p.nome}: embalagem aponta para material inexistente`);
      if (ins) {
        exige(
          ins.tipo === "embalagem",
          `${p.nome}: "${ins.nome}" é ingrediente e está na seção de embalagem`,
        );
      }
    }
  }

  // --- embalagem por produto (era o bug: valor idêntico em todos) ---
  console.log("\nEmbalagem por unidade produzida:");
  for (const p of produtos) {
    const usados = p.embalagens
      .map((e) => porId.get(e.insumoId)?.nome ?? "?")
      .join(", ");
    console.log(
      `  ${p.nome.slice(0, 24).padEnd(24)}${brl4(embalagemPorUnidade(p, insumos)).padStart(11)}  ${usados || "(nenhum)"}`,
    );
  }

  const distintos = new Set(produtos.map((p) => embalagemPorUnidade(p, insumos).toFixed(6)));
  if (produtos.length > 1 && distintos.size === 1) {
    console.warn(
      "\n  aviso: todos os produtos têm o mesmo custo de embalagem. Pode ser real, mas\n" +
        "  também é o sintoma do bug antigo — confira se cada produto lista só o que usa.",
    );
  }

  if (custoHora > 0) {
    console.log("\nTempo por lote:");
    for (const p of produtos) {
      const r = calcularProduto(p, insumos, custoHora);
      console.log(
        `  ${p.nome.slice(0, 24).padEnd(24)}${formatarMinutos(r.minutosLote).padStart(8)}  ` +
          `${brl(r.custoMaoDeObra / r.rendimento)}/un`,
      );
    }
  } else {
    const semTempo = produtos.filter((p) => minutosDoLote(p, p.rendimento) === 0);
    if (semTempo.length < produtos.length) {
      console.warn(
        "\n  aviso: há produtos com tempo lançado, mas o custo da hora está zerado —\n" +
          "  a mão de obra não está entrando em nenhum custo.",
      );
    }
  }

  const comAlerta = produtos.flatMap((p) =>
    p.linhas.filter((l) => l.alerta).map((l) => `${p.nome}`),
  );
  if (comAlerta.length > 0) {
    console.log(`\nLinhas marcadas para conferir: ${comAlerta.length}`);
  }

  console.log(falhas === 0 ? "\nOK — modelo íntegro." : `\n${falhas} problema(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
