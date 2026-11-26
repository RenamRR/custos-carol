import assert from "node:assert/strict";
import { test } from "node:test";
import { diaSaoPaulo, instanteVenda, rateioEvento, resultadoItem, resumoMes, type Evento, type Venda } from "./vendas";
const evento: Evento = { id: 1, nome: "Feira", data: "2026-12-31", custoFixo: 60, nota: null, criadoPor: 1, criadoEm: "2026-12-31T10:00:00Z", alteradoPor: null, alteradoEm: null, canceladoEm: null, canceladoPor: null };
const venda: Venda = { id: 1, vendidaEm: "2027-01-01T02:30:00Z", canalId: 2, canalNome: "Feira", formaId: 1, formaNome: "Pix", eventoId: 1, taxaPct: null, impostoPct: 0, nota: null, criadoPor: 1, criadoEm: "2027-01-01T02:30:00Z", canceladaEm: null, canceladaPor: null, itens: [{ id: 1, produtoId: 1, produtoNome: "Tradicional", quantidade: 2, precoUn: 10, custoUn: 4 }, { id: 2, produtoId: 2, produtoNome: "Nutella", quantidade: 1, precoUn: 20, custoUn: 6 }] };
test("item com taxa desconhecida preserva custo e cobra imposto", () => {
  assert.deepEqual(resultadoItem({ quantidade: 3, precoUn: 10, custoUn: 4 }, null, 5), { faturamento: 30, custo: 12, taxas: 1.5, margem: 16.5 });
});
test("rateio de R$ 10 em três itens: 3,33 + 3,33 + 3,34", () => {
  const partes = rateioEvento(10, [{ quantidade: 1 }, { quantidade: 1 }, { quantidade: 1 }]);
  assert.deepEqual(partes, [3.33, 3.33, 3.34]); assert.equal(partes.reduce((a, b) => a + b, 0), 10);
  assert.deepEqual(rateioEvento(60, [{ quantidade: 2 }, { quantidade: 1 }]), [40, 20]);
  assert.deepEqual(rateioEvento(10, []), []);
});
test("resumo feito à mão: 40 - 14 - 0 - 60 = -34; canceladas não entram", () => {
  const r = resumoMes([venda, { ...venda, id: 2, canceladaEm: "2027-01-01T03:00:00Z" }], [evento]);
  assert.equal(r.totais.faturamento, 40); assert.equal(r.totais.custo, 14); assert.equal(r.totais.lucro, -34);
  assert.equal(r.totais.vendas, 1); assert.equal(r.totais.vendasSemTaxa, 1); assert.equal(r.totais.unidades, 3);
  assert.deepEqual(r.porProduto.map((p) => [p.custoFeiras, p.lucro]), [[40, -28], [20, -6]]);
  assert.equal(r.porCanal[0].lucro, -34); assert.equal(r.feiras[0].lucro, -34);
});
test("evento sem venda entra no mês e no canal Feira, nunca em produto", () => {
  const r = resumoMes([], [evento, { ...evento, id: 2, canceladoEm: "2026-12-31" }], 2);
  assert.equal(r.totais.lucro, -60); assert.equal(r.custoFeiraSemVenda, 60);
  assert.equal(r.porCanal[0].id, 2); assert.equal(r.porCanal[0].lucro, -60); assert.deepEqual(r.porProduto, []);
});
test("SP: venda de 31/12 às 23h30 pertence a dezembro", () => {
  assert.equal(diaSaoPaulo(venda.vendidaEm), "2026-12-31");
  const agora = new Date("2027-01-02T18:00:00Z");
  assert.equal(instanteVenda("2026-12-31", agora)?.toISOString(), "2026-12-31T15:00:00.000Z");
  assert.equal(instanteVenda("2027-01-03", agora), null);
  assert.equal(instanteVenda("2026-02-30", agora), null);
  assert.equal(instanteVenda("2026-01-01", agora), null);
  assert.equal(instanteVenda("2026-12-31T23:30:00", agora), null);
  assert.ok(instanteVenda("2026-11-03", agora)); // limite civil de 60 dias
});
test("data de hoje sem hora às 09h SP usa agora, sem gerar futuro", () => {
  const agora = new Date("2026-11-26T12:00:00Z");
  assert.equal(instanteVenda("2026-11-26", agora)?.toISOString(), agora.toISOString());
  const tarde = new Date("2026-11-26T21:00:00Z");
  assert.equal(instanteVenda("2026-11-26", tarde)?.toISOString(), tarde.toISOString());
});
