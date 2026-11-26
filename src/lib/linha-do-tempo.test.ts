import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularProduto, faltaPreencher } from "./calc";
import type { ProdutoCompleto } from "./custo-completo";
import {
  alertasAtivos, alertasMargem, estadoEm, instantesDeMudanca, lerChaveAlerta, maisSubiram, painelEm, serieInsumo, serieProduto,
  type BaseCusto, type SeriesCusto,
} from "./linha-do-tempo";

/*
 * Conta de base, feita à mão:
 * Nutella rende 10 e leva 500 g de creme de avelã (pote de 1000 g). Sem embalagem, sem mão de obra,
 * sem perda. custo/un = 500 × preço/1000 ÷ 10 = preço do pote ÷ 20.
 * Preço de venda 10, taxa e imposto 0: margem% = (10 − custo) ÷ 10 × 100. Meta da Feira: 40%.
 *   pote 100 → custo 5,00 → 50%    pote 130 → 6,50 → 35%    pote 134 → 6,70 → 33%
 *   pote 133,8 → 6,69 → 33,1%      pote 150 → 7,50 → 25%
 */
const T0 = Date.parse("2026-09-01T12:00:00.000Z");
const DESDE = Date.parse("2026-09-02T00:00:00.000Z");
const T1 = Date.parse("2026-10-01T12:00:00.000Z");
const T2 = Date.parse("2026-10-15T12:00:00.000Z");
const AGORA = Date.parse("2026-11-01T00:00:00.000Z");

const nutella: ProdutoCompleto = {
  id: 10, nome: "Nutella", rendimento: 10, markupAlvo: 3.5, precoVenda: 0, minutosPreparo: 0, minutosAcabamentoUn: 0,
  minutosForno: 0, perdaPct: 0, semForno: false, precosPorCanal: [],
  linhas: [{ id: 1, insumoId: 1, qtd: 500, alerta: null }], embalagens: [],
};
function base(produtos: ProdutoCompleto[] = [nutella]): BaseCusto {
  return {
    produtos,
    insumos: [
      { id: 1, nome: "Creme de avelã", tipo: "ingrediente", embalagem: "Pote 1 kg", qtd: 1000, unidade: "g" },
      { id: 2, nome: "Farinha", tipo: "ingrediente", embalagem: "Pacote 1 kg", qtd: 1000, unidade: "g" },
    ],
    canais: [{ id: 2, nome: "Feira", margemAlvoPct: 40, ativo: true, ordem: 0, formas: [{ id: 1, nome: "Pix", ativo: true, ordem: 0, taxaPct: null }] }],
    formas: [{ id: 1, nome: "Pix" }, { id: 4, nome: "Crédito à vista" }],
  };
}
function series(extra: Partial<SeriesCusto> = {}, poteInicial = 100): SeriesCusto {
  return {
    insumos: [{ id: 1, vigenteDesde: T0, alteradoPor: null, insumoId: 1, preco: poteInicial }, ...(extra.insumos ?? [])],
    custoHora: extra.custoHora ?? [],
    forno: extra.forno ?? [],
    taxas: [{ id: 1, vigenteDesde: T0, alteradoPor: null, formaId: 1, taxaPct: 0 }, ...(extra.taxas ?? [])],
    imposto: [{ id: 1, vigenteDesde: T0, alteradoPor: null, valor: 0 }, ...(extra.imposto ?? [])],
    precos: [{ id: 1, vigenteDesde: T0, alteradoPor: null, produtoId: 10, canalId: null, preco: 10 }, ...(extra.precos ?? [])],
  };
}
const pote = (id: number, t: number, preco: number, alteradoPor: string | null = "Carol") => ({ id, vigenteDesde: t, alteradoPor, insumoId: 1, preco });
const perto = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("aumento que cruza a meta: 50% → 35% na Feira, com a causa do creme", () => {
  const alertas = alertasMargem(series({ insumos: [pote(2, T1, 130)] }), base(), DESDE, AGORA);
  assert.equal(alertas.length, 1);
  const [a] = alertas;
  assert.equal(a.chave, "2026-10-01T12:00:00.000Z|10|2");
  assert.equal(a.produto, "Nutella"); assert.equal(a.canal, "Feira"); assert.equal(a.meta, 40);
  perto(a.de, 50); perto(a.para, 35);
  assert.deepEqual(a.causas, [{ tipo: "insumo", nome: "Creme de avelã", de: 100, para: 130, alteradoPor: "Carol", insumoId: 1 }]);
  assert.deepEqual(lerChaveAlerta(a.chave), { instante: a.instante, produtoId: 10, canalId: 2 });
});

test("já abaixo da meta: queda de 10 p.p. e de 2,0 p.p. alertam; de 1,9 p.p. não", () => {
  const com = (preco: number) => alertasMargem(series({ insumos: [pote(2, T1, preco)] }, 130), base(), DESDE, AGORA);
  const dez = com(150); assert.equal(dez.length, 1); perto(dez[0].de, 35); perto(dez[0].para, 25);
  const dois = com(134); assert.equal(dois.length, 1); perto(dois[0].para, 33);
  assert.equal(com(133.8).length, 0, "35% → 33,1% é queda de 1,9 p.p.");
  assert.equal(com(120).length, 0, "subir a margem nunca alerta");
});

test("primeiro preenchimento não alerta; o aumento seguinte do mesmo botijão alerta", () => {
  // Forno: 60 min por lote. Botijão 120/10 h = 12 R$/h = 0,20/min → 12 por lote → 1,20/un → margem 38%.
  // Depois 150/10 h = 15 R$/h → 1,50/un → custo 6,50 → 35%: queda de 3 p.p. já abaixo de 40.
  const comForno = { ...nutella, minutosForno: 60 };
  const s = series({ forno: [
    { id: 1, vigenteDesde: T1, alteradoPor: "Carol", precoBotijao: 120, horasPorBotijao: 10 },
    { id: 2, vigenteDesde: T2, alteradoPor: "Renam", precoBotijao: 150, horasPorBotijao: 10 },
  ] });
  const alertas = alertasMargem(s, base([comForno]), DESDE, AGORA);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].instante, new Date(T2).toISOString());
  perto(alertas[0].de, 38); perto(alertas[0].para, 35);
  assert.deepEqual(alertas[0].causas, [{ tipo: "forno", nome: "Gás do forno (por hora)", de: 12, para: 15, alteradoPor: "Renam" }]);
});

test("duas mudanças no mesmo instante viram um alerta com as duas causas", () => {
  // Pote 130 → custo 6,50; Pix 2% → taxa 0,20; margem = 10 − 6,50 − 0,20 = 3,30 → 33%.
  const s = series({ insumos: [pote(2, T1, 130)], taxas: [{ id: 2, vigenteDesde: T1, alteradoPor: "Carol", formaId: 1, taxaPct: 2 }] });
  const alertas = alertasMargem(s, base(), DESDE, AGORA);
  assert.equal(alertas.length, 1); perto(alertas[0].para, 33);
  assert.deepEqual(alertas[0].causas.map((c) => [c.tipo, c.nome, c.de, c.para]), [["insumo", "Creme de avelã", 100, 130], ["taxa", "Pix", 0, 2]]);
});

test("empate de vigente_desde: vence o maior id, em qualquer ordem do array", () => {
  for (const insumos of [[pote(2, T1, 130), pote(3, T1, 100)], [pote(3, T1, 100), pote(2, T1, 130)]]) {
    const s = series({ insumos });
    assert.equal(estadoEm(s, base(), T1).insumos.find((i) => i.id === 1)!.preco, 100);
    assert.deepEqual(instantesDeMudanca(s, base(), DESDE, AGORA), [], "130 perdeu o empate: nada mudou");
    assert.equal(alertasMargem(s, base(), DESDE, AGORA).length, 0);
  }
  const s = series({ insumos: [pote(3, T1, 130), pote(2, T1, 100)] });
  assert.equal(estadoEm(s, base(), T1).insumos.find((i) => i.id === 1)!.preco, 130);
});

test("preço baixado abaixo da meta alerta com causa 'preco' (geral e próprio do canal)", () => {
  // Preço 8, custo 5: (8 − 5) ÷ 8 = 37,5%.
  const geral = alertasMargem(series({ precos: [{ id: 2, vigenteDesde: T1, alteradoPor: "Carol", produtoId: 10, canalId: null, preco: 8 }] }), base(), DESDE, AGORA);
  assert.equal(geral.length, 1); perto(geral[0].para, 37.5);
  assert.deepEqual(geral[0].causas, [{ tipo: "preco", nome: "Nutella (preço geral)", de: 10, para: 8, alteradoPor: "Carol", produtoId: 10, canalId: null }]);
  // O 1º preço próprio da Feira não é "primeiro preenchimento": antes valia o geral herdado (10).
  const canal = alertasMargem(series({ precos: [{ id: 2, vigenteDesde: T1, alteradoPor: "Carol", produtoId: 10, canalId: 2, preco: 8 }] }), base(), DESDE, AGORA);
  assert.equal(canal.length, 1);
  assert.deepEqual(canal[0].causas.map((c) => [c.nome, c.de, c.para]), [["Nutella (Feira)", 10, 8]]);
});

test("ordem pelo estrago e janela (desde, agora]", () => {
  const brownie: ProdutoCompleto = { ...nutella, id: 11, nome: "Brownie", linhas: [{ id: 2, insumoId: 1, qtd: 200, alerta: null }] };
  const s = series({ insumos: [pote(2, T1, 300)], precos: [{ id: 2, vigenteDesde: T0, alteradoPor: null, produtoId: 11, canalId: null, preco: 10 }] });
  // Pote 300: Nutella custo 15 → 50% → −50%. Brownie custo = 200 × 0,3 ÷ 10 = 6 → 80% → 40%: igual à meta, não alerta.
  const alertas = alertasMargem(s, base([nutella, brownie]), DESDE, AGORA);
  assert.deepEqual(alertas.map((a) => [a.produto, a.de, a.para]), [["Nutella", 50, -50]]);
  const s2 = series({ insumos: [pote(2, T1, 400)], precos: [{ id: 2, vigenteDesde: T0, alteradoPor: null, produtoId: 11, canalId: null, preco: 10 }] });
  // Pote 400: Brownie custo 8 → 80% → 20% (estrago 60); Nutella custo 20 → 50% → −100% (estrago 150).
  // A base vem com o Brownie primeiro: a ordem do resultado tem que vir do estrago.
  assert.deepEqual(alertasMargem(s2, base([brownie, nutella]), DESDE, AGORA).map((a) => [a.produto, a.de, a.para]), [["Nutella", 50, -100], ["Brownie", 80, 20]]);
  assert.equal(alertasMargem(s2, base(), T1, AGORA).length, 0, "mudança exatamente em `desde` fica fora");
  assert.equal(alertasMargem(s2, base(), DESDE, T1 - 1).length, 0, "mudança depois de `agora` fica fora");
});

test("sem_forno: forno vale 0, sai de 'falta preencher' e o gás não vira causa", () => {
  const assado = { ...nutella, minutosForno: 60 };
  const semForno = { ...nutella, id: 12, nome: "Pudim de pote", minutosForno: 60, semForno: true };
  const insumos = [{ id: 1, nome: "Creme", tipo: "ingrediente" as const, embalagem: "", qtd: 1000, unidade: "g", preco: 100 }];
  perto(calcularProduto(assado, insumos, 0, 0.2).custoUnitario, 6.2);
  perto(calcularProduto(semForno, insumos, 0, 0.2).custoUnitario, 5);
  const pendencias = faltaPreencher([{ ...nutella }, { ...semForno, minutosForno: 0 }], 30, { precoBotijao: 1, horasPorBotijao: 1, custoHora: 1, custoMinuto: 1, informado: true }, []);
  assert.deepEqual(pendencias.map((p) => p.id), ["forno-10"]);
  const s = series({ forno: [
    { id: 1, vigenteDesde: T0, alteradoPor: null, precoBotijao: 120, horasPorBotijao: 10 },
    { id: 2, vigenteDesde: T1, alteradoPor: null, precoBotijao: 600, horasPorBotijao: 10 },
  ], precos: [{ id: 2, vigenteDesde: T0, alteradoPor: null, produtoId: 12, canalId: null, preco: 10 }] });
  assert.deepEqual(alertasMargem(s, base([semForno]), DESDE, AGORA), []);
  assert.equal(serieProduto(12, s, base([semForno]), DESDE, AGORA).length, 1, "gás não mexe no produto sem forno");
});

test("série do insumo: ponto inicial em desde, um ponto por mudança, autor e preço por unidade", () => {
  const s = series({ insumos: [pote(2, T1, 130), pote(3, T2, 130, "Renam"), pote(4, AGORA + 1, 999)] });
  assert.deepEqual(serieInsumo(1, s, base(), DESDE, AGORA), [
    { instante: new Date(DESDE).toISOString(), preco: 100, precoPorUnidade: 0.1, alteradoPor: null },
    { instante: new Date(T1).toISOString(), preco: 130, precoPorUnidade: 0.13, alteradoPor: "Carol" },
  ]);
  assert.deepEqual(serieInsumo(2, s, base(), DESDE, AGORA), [], "insumo sem preço: sem histórico");
});

test("série do produto: degrau com o início e só as mudanças que mexem nele", () => {
  const s = series({ insumos: [pote(2, T1, 130), { id: 5, vigenteDesde: T2, alteradoPor: "Carol", insumoId: 2, preco: 7 }] });
  const pontos = serieProduto(10, s, base(), DESDE, AGORA);
  assert.equal(pontos.length, 2, "farinha não está na receita da Nutella");
  assert.deepEqual(pontos.map((p) => [p.instante, p.custoUn, p.canais[0].margemPct]), [
    [new Date(DESDE).toISOString(), 5, 50], [new Date(T1).toISOString(), 6.5, 35],
  ]);
  assert.deepEqual(pontos[1].causas.map((c) => c.nome), ["Creme de avelã"]);
  assert.deepEqual(serieProduto(999, s, base(), DESDE, AGORA), []);
});

test("o que mais subiu: % entre desde e agora; ignora sem valor em desde, queda e zero", () => {
  const s = series({ insumos: [
    pote(2, T1, 130),
    { id: 5, vigenteDesde: T0, alteradoPor: null, insumoId: 2, preco: 4 }, { id: 6, vigenteDesde: T1, alteradoPor: null, insumoId: 2, preco: 5 },
  ] });
  const b = base(); b.insumos.push({ id: 3, nome: "Novo", tipo: "ingrediente", embalagem: "", qtd: 1, unidade: "un" });
  s.insumos.push({ id: 7, vigenteDesde: T1, alteradoPor: null, insumoId: 3, preco: 50 });
  const lista = maisSubiram(s, b, DESDE, 3, AGORA);
  assert.deepEqual(lista.map((i) => [i.nome, i.de, i.para]), [["Creme de avelã", 100, 130], ["Farinha", 4, 5]]);
  perto(lista[0].variacaoPct, 30); perto(lista[1].variacaoPct, 25);
  assert.equal(maisSubiram(s, b, DESDE, 1, AGORA).length, 1);
});

test("estado em T usa os mesmos defaults das queries: sem valor = 0, taxa sem valor = null, preço herdado", () => {
  const e = estadoEm(series(), base(), T0 - 1);
  assert.equal(e.insumos[0].preco, 0); assert.equal(e.custoHora, 0); assert.equal(e.impostoPct, 0);
  assert.equal(e.forno.informado, false); assert.equal(e.canais[0].formas[0].taxaPct, null);
  assert.deepEqual(e.produtos[0].precosPorCanal, [{ canalId: 2, preco: 0, herdado: true }]);
  const agora = estadoEm(series(), base(), AGORA);
  assert.deepEqual(agora.produtos[0].precosPorCanal, [{ canalId: 2, preco: 10, herdado: true }]);
  assert.equal(painelEm(series(), base(), AGORA)[0].canais[0].margemPct, 50);
});

test("chave do alerta: só o formato que alertasMargem gera", () => {
  assert.ok(lerChaveAlerta("2026-10-01T12:00:00.000Z|10|2"));
  for (const ruim of [
    "", "x", "2026-10-01T12:00:00Z|10|2", "2026-13-01T12:00:00.000Z|10|2", "2026-10-01T12:00:00.000Z|0|2",
    "2026-10-01T12:00:00.000Z|10|2|9", "2026-10-01T12:00:00.000Z|10|2' or 1=1--", "2026-10-01T12:00:00.000Z|99999999999|2",
    "2026-10-01T12:00:00.000Z|10|2147483648", null, 123,
  ]) assert.equal(lerChaveAlerta(ruim), null, String(ruim));
});

test("alertas ativos: só o último golpe por produto × canal, some se corrigido ou dispensado, ordem por estrago", () => {
  // Nutella: pote 100 → 130 em T1 (50% → 35%, estrago 15) e 130 → 150 em T2 (35% → 25%, estrago 10).
  const s = series({ insumos: [pote(2, T1, 130), pote(3, T2, 150)] });
  const todos = alertasMargem(s, base(), DESDE, AGORA);
  assert.deepEqual(todos.map((a) => [a.instante, a.de, a.para]), [[new Date(T1).toISOString(), 50, 35], [new Date(T2).toISOString(), 35, 25]]);
  const hoje = painelEm(s, base(), AGORA); // 25%, abaixo da meta de 40
  const ativos = alertasAtivos(todos, hoje, new Set());
  assert.deepEqual(ativos.map((a) => [a.instante, a.de, a.para]), [[new Date(T2).toISOString(), 35, 25]], "dois golpes = um cartão, o do último");
  // Dispensar o último não ressuscita o anterior.
  assert.deepEqual(alertasAtivos(todos, hoje, new Set([ativos[0].chave])), []);
  // Dispensar só o antigo não muda nada: ele já não aparecia.
  assert.equal(alertasAtivos(todos, hoje, new Set([todos[0].chave])).length, 1);
  // Corrigido: preço 10 → 20 em T3 → custo 7,50 → 62,5% ≥ 40: some.
  const T3 = Date.parse("2026-10-20T12:00:00.000Z");
  const corrigido = series({ insumos: [pote(2, T1, 130), pote(3, T2, 150)], precos: [{ id: 2, vigenteDesde: T3, alteradoPor: "Carol", produtoId: 10, canalId: null, preco: 20 }] });
  assert.deepEqual(alertasAtivos(alertasMargem(corrigido, base(), DESDE, AGORA), painelEm(corrigido, base(), AGORA), new Set()), []);
  // Exatamente na meta conta como corrigido: preço 12,50 → custo 7,50 → 40%.
  const naMeta = series({ insumos: [pote(2, T1, 130), pote(3, T2, 150)], precos: [{ id: 2, vigenteDesde: T3, alteradoPor: null, produtoId: 10, canalId: null, preco: 12.5 }] });
  assert.deepEqual(alertasAtivos(alertasMargem(naMeta, base(), DESDE, AGORA), painelEm(naMeta, base(), AGORA), new Set()), []);
  // Produto que saiu do painel (arquivado) some.
  assert.deepEqual(alertasAtivos(todos, [], new Set()), []);
  // Ordem por estrago entre produtos: pote 400 → Nutella 50 → −100 (150) antes de Brownie 80 → 20 (60).
  const brownie: ProdutoCompleto = { ...nutella, id: 11, nome: "Brownie", linhas: [{ id: 2, insumoId: 1, qtd: 200, alerta: null }] };
  const s2 = series({ insumos: [pote(2, T1, 400)], precos: [{ id: 2, vigenteDesde: T0, alteradoPor: null, produtoId: 11, canalId: null, preco: 10 }] });
  const b2 = base([brownie, nutella]);
  assert.deepEqual(alertasAtivos(alertasMargem(s2, b2, DESDE, AGORA), painelEm(s2, b2, AGORA), new Set()).map((a) => a.produto), ["Nutella", "Brownie"]);
});
