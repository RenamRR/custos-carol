/**
 * Confere o motor de cálculo contra os números da planilha original da Carol.
 * Roda sem banco: `npm run test:calc`
 */
import assert from "node:assert/strict";
import { INSUMOS_INICIAIS, PRODUTOS_INICIAIS } from "../db/dados-iniciais.js";
import {
  brl,
  calcularProduto,
  embalagemPorUnidade,
  formatarMinutos,
  nivelMargem,
  nivelMarkup,
  parseNumeroBR,
  type Insumo,
  type Produto,
} from "./calc.js";

const insumos: Insumo[] = INSUMOS_INICIAIS.map((i, idx) => ({ ...i, id: idx + 1 }));
const idPorNome = new Map(insumos.map((i) => [i.nome, i.id]));

function idDe(nome: string): number {
  const id = idPorNome.get(nome);
  assert.ok(id, `insumo não encontrado na lista: ${nome}`);
  return id;
}

const produtos: Produto[] = PRODUTOS_INICIAIS.map((p, pIdx) => ({
  id: pIdx + 1,
  nome: p.nome,
  rendimento: p.rendimento,
  markupAlvo: p.markupAlvo,
  precoVenda: p.precoVenda,
  minutosPreparo: p.minutosPreparo,
  minutosAcabamentoUn: p.minutosAcabamentoUn,
  linhas: p.linhas.map((l, i) => ({
    id: pIdx * 100 + i,
    insumoId: idDe(l.insumo),
    qtd: l.qtd,
    alerta: l.alerta ?? null,
  })),
  embalagens: p.embalagens.map((e, i) => ({
    id: pIdx * 100 + 50 + i,
    insumoId: idDe(e.insumo),
    qtdPorUnidade: e.qtdPorUnidade,
  })),
}));

let falhas = 0;
function checa(rotulo: string, obtido: number, esperado: number, tolerancia: number) {
  if (Math.abs(obtido - esperado) > tolerancia) {
    falhas += 1;
    console.error(`  FALHOU ${rotulo}: esperado ${esperado}, obtido ${obtido.toFixed(4)}`);
  }
}

// --- parser de número brasileiro ---
assert.equal(parseNumeroBR("30,00"), 30);
assert.equal(parseNumeroBR("R$ 1.234,56"), 1234.56);
assert.equal(parseNumeroBR("13.5"), 13.5);
assert.equal(parseNumeroBR(""), 0);
assert.equal(parseNumeroBR("abc"), 0);

// --- embalagem por unidade, por produto ---
for (const p of produtos) {
  checa(`${p.nome} embalagem/unidade`, embalagemPorUnidade(p, insumos), 1.055, 1e-9);
}
console.log("Embalagem por unidade (os três brownies): R$ 1,0550");

// --- produtos, contra a planilha ---
const ESPERADO: Record<string, { unit: number; total: number; markup: number; nivel: string }> = {
  "Brownie Tradicional": { unit: 3.66, total: 43.91, markup: 3.14, nivel: "warn" },
  "Brownie Redvelvet": { unit: 3.2, total: 38.39, markup: 4.22, nivel: "good" },
  "Brownie Cookie": { unit: 4.58, total: 54.91, markup: 2.95, nivel: "warn" },
};

console.log("\nProduto                  Insumos  Embalag.     Total  Custo/un   Markup  nível");
for (const p of produtos) {
  const r = calcularProduto(p, insumos);
  const nivel = nivelMarkup(r.markup);
  console.log(
    p.nome.padEnd(22) +
      brl(r.custoInsumos).padStart(10) +
      brl(r.custoEmbalagem).padStart(10) +
      brl(r.custoTotal).padStart(10) +
      brl(r.custoUnitario).padStart(10) +
      `${r.markup.toFixed(2)}x`.padStart(9) +
      "  " +
      nivel,
  );

  const e = ESPERADO[p.nome];
  assert.ok(e, `produto sem referência: ${p.nome}`);
  checa(`${p.nome} custo/un`, Number(r.custoUnitario.toFixed(2)), e.unit, 0.005);
  checa(`${p.nome} total`, Number(r.custoTotal.toFixed(2)), e.total, 0.011);
  checa(`${p.nome} markup`, Number(r.markup.toFixed(2)), e.markup, 0.006);
  if (nivel !== e.nivel) {
    falhas += 1;
    console.error(`  FALHOU ${p.nome} nível: esperado ${e.nivel}, obtido ${nivel}`);
  }

  const soma = r.segmentos.reduce((a, s) => a + s.valor, 0);
  checa(`${p.nome} segmentos`, soma, r.custoTotal, 1e-9);
}

// --- regressão: embalagem é POR PRODUTO, não global ---
// Este era o bug: `embalagemPorUnidade` somava o catálogo inteiro e aplicava a todo
// produto, então uma marmita pagava tag, saquinho e sizal que não usa.
console.log("\nRegressão — embalagem por produto:");

const semEmbalagem: Produto = {
  id: 900,
  nome: "Produto sem embalagem",
  rendimento: 16,
  markupAlvo: 3,
  precoVenda: 16.5,
  minutosPreparo: 0,
  minutosAcabamentoUn: 0,
  linhas: [{ id: 901, insumoId: idDe("Cacau 70%"), qtd: 135 }].map((l) => ({
    ...l,
    alerta: null,
  })),
  embalagens: [],
};
const rSem = calcularProduto(semEmbalagem, insumos);
checa("produto sem embalagem paga zero de embalagem", rSem.custoEmbalagem, 0, 1e-12);
checa("custo = só o insumo", rSem.custoTotal, 8.1, 1e-9);
console.log(`  sem embalagem: ${brl(rSem.custoEmbalagem)} de embalagem, total ${brl(rSem.custoTotal)}`);

const soCaixa: Produto = {
  ...semEmbalagem,
  id: 902,
  nome: "Produto só com caixa",
  embalagens: [{ id: 903, insumoId: idDe("Caixa"), qtdPorUnidade: 1 }],
};
const rCaixa = calcularProduto(soCaixa, insumos);
// Caixa: R$ 12,50 / 25 un = R$ 0,50 por unidade × 16 unidades = R$ 8,00
checa("produto só com caixa paga só a caixa", rCaixa.custoEmbalagem, 8, 1e-9);
console.log(`  só com caixa : ${brl(rCaixa.custoEmbalagem)} de embalagem`);

// e os brownies continuam intactos com produtos novos existindo
const tradDepois = calcularProduto(produtos[0], insumos);
checa(
  "Tradicional não muda por existirem outros produtos",
  Number(tradDepois.custoUnitario.toFixed(2)),
  3.66,
  0.005,
);

// --- mão de obra ---
console.log("\nMão de obra:");

// custo da hora zerado: nada muda, e é por isso que a baseline da planilha acima vale
const semCustoHora = calcularProduto(
  { ...produtos[0], minutosPreparo: 90, minutosAcabamentoUn: 3 },
  insumos,
  0,
);
checa("hora zerada não gera custo", semCustoHora.custoMaoDeObra, 0, 1e-12);
checa("hora zerada mantém o custo/un", Number(semCustoHora.custoUnitario.toFixed(2)), 3.66, 0.005);

// 60min de preparo + 2min/un × 12 un = 84min = 1,4h × R$ 30 = R$ 42,00
const comMO = calcularProduto(
  { ...produtos[0], minutosPreparo: 60, minutosAcabamentoUn: 2 },
  insumos,
  30,
);
checa("minutos do lote", comMO.minutosLote, 84, 1e-9);
checa("custo de mão de obra do lote", comMO.custoMaoDeObra, 42, 1e-9);
checa("custo direto não muda", Number(comMO.custoDireto.toFixed(2)), 43.91, 0.011);
checa("custo total soma a mão de obra", Number(comMO.custoTotal.toFixed(2)), 85.91, 0.011);
console.log(
  `  lote de 12: ${formatarMinutos(comMO.minutosLote)}, ${brl(comMO.custoMaoDeObra)} de mão de obra, ` +
    `custo/un ${brl(comMO.custoUnitario)}`,
);

// o markup continua sendo sobre custo DIRETO, para seguir comparável
checa("markup ignora mão de obra", Number(comMO.markup.toFixed(2)), 3.14, 0.006);

// lote maior dilui o preparo: é o motivo de separar os dois tempos
const loteGrande = calcularProduto(
  { ...produtos[0], rendimento: 24, minutosPreparo: 60, minutosAcabamentoUn: 2 },
  insumos,
  30,
);
const moPorUn12 = comMO.custoMaoDeObra / 12;
const moPorUn24 = loteGrande.custoMaoDeObra / 24;
checa("lote de 24 leva 108min", loteGrande.minutosLote, 108, 1e-9);
assert.ok(
  moPorUn24 < moPorUn12,
  "dobrar o lote tem que baratear a mão de obra por unidade",
);
console.log(
  `  lote de 24: ${formatarMinutos(loteGrande.minutosLote)}, ` +
    `mão de obra por unidade caiu de ${brl(moPorUn12)} para ${brl(moPorUn24)}`,
);

// segmentos ganham a fatia de mão de obra
const somaComMO = comMO.segmentos.reduce((a, s) => a + s.valor, 0);
checa("segmentos fecham com mão de obra", somaComMO, comMO.custoTotal, 1e-9);
assert.ok(
  comMO.segmentos.some((s) => s.tipo === "mao-de-obra"),
  "faltou o segmento de mão de obra na composição",
);

// --- níveis de margem ---
assert.equal(nivelMargem(70), "good");
assert.equal(nivelMargem(50), "good");
assert.equal(nivelMargem(49.9), "warn");
assert.equal(nivelMargem(35), "warn");
assert.equal(nivelMargem(34.9), "crit");

// --- guardas de borda ---
const semRendimento = calcularProduto({ ...produtos[0], rendimento: 0 }, insumos);
assert.ok(Number.isFinite(semRendimento.custoUnitario), "rendimento 0 não pode gerar Infinity");
const semPreco = calcularProduto({ ...produtos[0], precoVenda: 0 }, insumos);
assert.equal(semPreco.markup, 0, "preço 0 deve dar markup 0, não Infinity");
assert.equal(semPreco.margemPct, 0, "preço 0 deve dar margem 0%");

const insumoInexistente = calcularProduto(
  { ...semEmbalagem, embalagens: [{ id: 904, insumoId: 99999, qtdPorUnidade: 1 }] },
  insumos,
);
checa("embalagem apontando para insumo inexistente vale zero", insumoInexistente.custoEmbalagem, 0, 1e-12);

console.log(falhas === 0 ? "\nOK — todos os valores conferem." : `\n${falhas} divergência(s).`);
process.exit(falhas === 0 ? 0 : 1);
