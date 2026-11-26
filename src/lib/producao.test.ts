import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularProduto, type Insumo, type Produto } from "./calc";
import { INSUMOS_INICIAIS, PRODUTOS_INICIAIS } from "../db/dados-iniciais";
import { listaCompras, parsePlano, serializarPlano, type InsumoProducao, type ProdutoProducao } from "./producao";

const perto = (atual: number, esperado: number) => assert.ok(Math.abs(atual - esperado) < 1e-9, `${atual} != ${esperado}`);
const insumo: InsumoProducao = { id: 1, nome: "Farinha", tipo: "ingrediente", embalagem: "Pacote 500 g", qtd: 500, unidade: "g", preco: 10 };
const embalagem: InsumoProducao = { id: 2, nome: "Saquinho", tipo: "embalagem", embalagem: "10 unidades", qtd: 10, unidade: "un", preco: 5 };
const produto: ProdutoProducao = { id: 1, nome: "Brownie", rendimento: 12, perdaPct: 0,
  linhas: [{ id: 1, insumoId: 1, qtd: 300, alerta: null }], embalagens: [{ id: 1, insumoId: 2, qtdPorUnidade: 1 }] };

// Projeção somente de receitas e preços do backup de 25/11/2026, sem dados de usuários.
const insumosBackup: InsumoProducao[] = [
  [1, "Cacau 70%", 500, 65], [2, "Cacau gotas", 2000, 62], [3, "Cacau 50%", 1000, 50],
  [5, "Ovo", 20, 18], [6, "Farinha", 1000, 4], [7, "Açúcar", 1000, 3.8],
  [8, "Margarina", 1000, 13], [16, "Nutella", 650, 55],
  [12, "Tag", 200, 50], [13, "Caixa", 25, 12.5], [14, "Saquinho", 100, 20.5], [15, "Sizal", 100, 10],
].map(([id, nome, qtd, preco]) => ({ id: Number(id), nome: String(nome), qtd: Number(qtd), preco: Number(preco), tipo: [12, 13, 14, 15].includes(Number(id)) ? "embalagem" : "ingrediente", embalagem: String(nome), unidade: id === 5 || [12, 13, 14].includes(Number(id)) ? "un" : id === 15 ? "m" : "g" }));
const receita = (valores: number[][]) => valores.map(([insumoId, qtd], id) => ({ id, insumoId, qtd, alerta: null }));
const materiais = (ids: number[]) => ids.map((insumoId, id) => ({ id, insumoId, qtdPorUnidade: 1 }));
const produtosBackup: ProdutoProducao[] = [
  { id: 1, nome: "Brownie Tradicional", rendimento: 12, perdaPct: 0, linhas: receita([[1, 160], [2, 225], [5, 4], [6, 130], [7, 305], [8, 220]]), embalagens: materiais([12, 13, 14, 15]) },
  { id: 4, nome: "Brownie Nutella", rendimento: 12, perdaPct: 0, linhas: receita([[7, 305], [3, 160], [2, 225], [16, 360], [5, 4], [6, 130], [8, 220]]), embalagens: materiais([14, 15, 12]) },
];

test("3 Tradicional + 2 Nutella do backup: 60 brownies, 16 pacotes, R$ 448,10", () => {
  const r = listaCompras([{ produtoId: 1, fornadas: 3 }, { produtoId: 4, fornadas: 2 }], produtosBackup, insumosBackup);
  const porId = new Map([...r.ingredientes, ...r.embalagens].map((i) => [i.insumoId, i]));
  // Cacau70: 160×3=480; gotas:225×5=1125; açúcar:305×5=1525; Nutella:360×2=720.
  assert.deepEqual([1, 2, 7, 16].map((id) => { const i = porId.get(id)!; return [i.necessario, i.pacotes, i.sobra, i.gasto]; }),
    [[480, 1, 20, 65], [1125, 1, 875, 62], [1525, 2, 475, 7.6], [720, 2, 580, 110]]);
  assert.equal(porId.get(13)!.necessario, 36); // Nutella não usa caixa.
  assert.equal(porId.get(12)!.necessario, 60);
  assert.deepEqual(porId.get(2)!.usadoPor, ["Brownie Tradicional", "Brownie Nutella"]);
  assert.equal(r.totais.unidadesBoas, 60); assert.equal(r.totais.pacotes, 16); perto(r.totais.gastoMercado, 448.1);
  // Ingredientes R$214,893076923 + embalagens R$51,30, sem mão de obra/forno.
  perto(r.totais.custoConsumido, 266.1930769230769);
  perto(r.produtos[0].custoConsumido, 145.722); perto(r.produtos[1].custoConsumido, 120.47107692307693);
  assert.equal(r.totais.incompleto, false); assert.deepEqual(r.pendencias, []);
});

test("já tenho acima da necessidade zera compra sem alterar custo consumido", () => {
  const r = listaCompras([{ produtoId: 1, fornadas: 1 }], [produto], [insumo, embalagem], { 1: 1000, 2: 12 });
  assert.equal(r.ingredientes[0].jaTenho, 1000); assert.equal(r.ingredientes[0].comprar, 0);
  assert.equal(r.ingredientes[0].sobra, 0); assert.equal(r.totais.pacotes, 0); assert.equal(r.totais.gastoMercado, 0);
  assert.equal(r.totais.custoConsumido, 12); // farinha 6 + saquinhos 6, mesmo já estando em casa.
});

test("meia fornada: 150g, seis saquinhos, custo consumido 6 e compra 15", () => {
  const r = listaCompras([{ produtoId: 1, fornadas: 0.5 }], [produto], [insumo, embalagem]);
  assert.equal(r.totais.unidadesBoas, 6); assert.equal(r.ingredientes[0].necessario, 150);
  assert.equal(r.embalagens[0].necessario, 6); assert.equal(r.totais.custoConsumido, 6); assert.equal(r.totais.gastoMercado, 15);
});

test("preço ausente e tamanho inválido não inventam zero; preço zero explícito vale", () => {
  for (const parcial of [{ ...insumo, preco: null }, { ...insumo, qtd: 0 }]) {
    const r = listaCompras([{ produtoId: 1, fornadas: 1 }], [produto], [parcial, embalagem], { 1: 30 });
    const i = r.ingredientes[0];
    assert.equal(i.necessario, 300); assert.equal(i.comprar, 270);
    assert.equal(i.pacotes, null); assert.equal(i.gasto, null); assert.equal(i.custoConsumido, null);
    assert.equal(r.totais.custoConsumido, 6); assert.equal(r.totais.gastoMercado, 10);
    assert.equal(r.totais.incompleto, true); assert.equal(r.produtos[0].incompleto, true); assert.equal(r.pendencias.length, 1);
  }
  const zero = listaCompras([{ produtoId: 1, fornadas: 1 }], [{ ...produto, embalagens: [] }], [{ ...insumo, preco: 0 }]);
  assert.equal(zero.ingredientes[0].pacotes, 1); assert.equal(zero.totais.gastoMercado, 0); assert.equal(zero.totais.incompleto, false);
});

test("micro-unidades eliminam ruído; excedente real e menor quantidade do domínio não somem", () => {
  const comQuantidade = (qtd: number) => listaCompras([{ produtoId: 1, fornadas: 1 }], [{ ...produto, linhas: receita([[1, qtd]]), embalagens: [] }], [insumo]).ingredientes[0];
  assert.equal(comQuantidade(500 * 1.0000000001).pacotes, 1);
  assert.equal(comQuantidade(500.0001).pacotes, 2);
  assert.equal(comQuantidade(0.0001).pacotes, 1);
  assert.ok(comQuantidade(500 * 1.0000000001).sobra! >= 0);
  const decimal = listaCompras([{ produtoId: 1, fornadas: 1 }], [{ ...produto, linhas: receita([[1, 0.1], [1, 0.2]]), embalagens: [] }], [{ ...insumo, qtd: 0.3 }]);
  assert.equal(decimal.ingredientes[0].pacotes, 1); assert.equal(decimal.ingredientes[0].necessario, 0.3);
  const minima = listaCompras([{ produtoId: 1, fornadas: 0.5 }], [{ ...produto, linhas: receita([[1, 0.0001]]), embalagens: [] }], [insumo]);
  assert.equal(minima.ingredientes[0].necessario, 0.00005); assert.equal(minima.ingredientes[0].pacotes, 1);
});

test("1,3 g × 13 com já tenho 16,9 não compra pacote; regressão de resíduos", () => {
  for (const [qtd, fornadas, tenho] of [[1.3, 13, 16.9], [1.6, 1.5, 2.4], [0.0037, 13, 0.0481]]) {
    const r = listaCompras([{ produtoId: 1, fornadas }], [{ ...produto, linhas: receita([[1, qtd]]), embalagens: [] }], [insumo], { 1: tenho });
    assert.equal(r.ingredientes[0].necessario, tenho);
    assert.equal(r.ingredientes[0].comprar, 0); assert.equal(r.ingredientes[0].pacotes, 0);
    assert.equal(r.ingredientes[0].sobra, 0); assert.equal(r.totais.gastoMercado, 0);
  }
});

test("quantidades acima de inteiros seguros viram pendência, sem resultado aproximado", () => {
  const r = listaCompras([{ produtoId: 1, fornadas: 1 }], [produto], [insumo, embalagem], { 1: 1e20 });
  assert.ok(r.pendencias.some((p) => p.insumoId === 1)); assert.equal(r.ingredientes[0].comprar, 300); assert.equal(r.ingredientes[0].jaTenho, 0); assert.equal(r.totais.incompleto, true);
  const pacote = listaCompras([{ produtoId: 1, fornadas: 1 }], [produto], [{ ...insumo, qtd: 1e20 }, embalagem]);
  assert.equal(pacote.ingredientes.length, 0); assert.equal(pacote.totais.incompleto, true);
});

test("perda fracionária: floor só para brownies e embalagens, ingredientes completos", () => {
  const r = listaCompras([{ produtoId: 1, fornadas: 1 }], [{ ...produto, perdaPct: 10 }], [insumo, embalagem]);
  assert.equal(r.totais.unidadesBoas, 10); assert.equal(r.embalagens[0].necessario, 10);
  assert.equal(r.ingredientes[0].necessario, 300); assert.equal(r.totais.custoConsumido, 11);
});

test("consistência com calcularProduto: seed real, todas as perdas em unidades teóricas", () => {
  const insumos: Insumo[] = INSUMOS_INICIAIS.map((i, n) => ({ ...i, id: n + 1 }));
  const id = (nome: string) => insumos.find((i) => i.nome === nome)!.id;
  const seed = PRODUTOS_INICIAIS[0];
  const original: Produto = { ...seed, id: 1, linhas: seed.linhas.map((l, n) => ({ id: n + 1, insumoId: id(l.insumo), qtd: l.qtd, alerta: null })), embalagens: seed.embalagens.map((e, n) => ({ id: n + 1, insumoId: id(e.insumo), qtdPorUnidade: e.qtdPorUnidade })) };
  for (const perdaPct of [0, 5, 10, 25, 33.33, 89.99]) for (const fornadas of [0.5, 1, 3, 50]) {
    const p = { ...original, perdaPct };
    const calculado = calcularProduto(p, insumos);
    const r = listaCompras([{ produtoId: 1, fornadas }], [p], insumos);
    const consumoIngredientes = r.ingredientes.reduce((s, i) => s + i.custoConsumido!, 0);
    const boasTeoricas = p.rendimento * fornadas * (1 - perdaPct / 100);
    perto(consumoIngredientes / boasTeoricas, calculado.custoInsumos / calculado.unidadesBoas);
    assert.ok((r.embalagens[0]?.necessario ?? 0) <= calculado.unidadesBoas * fornadas + 1e-9);
  }
});

test("URL tolera lixo, soma repetidos e mantém faixa/passo inválidos para pendências", () => {
  assert.deepEqual(parsePlano("lixo,1:1,1:0.5,2:51,3:0.25,4:-1,5:Infinity,6:NaN,0:1,1.5:1,7:2x,8:1:2"), [
    { produtoId: 1, fornadas: 1.5 }, { produtoId: 2, fornadas: 51 }, { produtoId: 3, fornadas: 0.25 }, { produtoId: 4, fornadas: -1 },
  ]);
  const r = listaCompras(parsePlano("1:30,1:25,99:1"), [produto], [insumo]);
  assert.equal(r.produtos.length, 0); assert.equal(r.pendencias.length, 2);
  const foraPasso = listaCompras(parsePlano("1:0.5000000001"), [produto], [insumo]);
  assert.equal(foraPasso.produtos.length, 0); assert.equal(foraPasso.pendencias.length, 1);
});

test("URL: 20 distintos em ordem, duplicados posteriores somam, serialização canônica idempotente", () => {
  const query = Array.from({ length: 25 }, (_, n) => `${n + 1}:0.5`).join(",") + ",1:1";
  const plano = parsePlano(query);
  assert.equal(plano.length, 20); assert.equal(plano[0].fornadas, 1.5); assert.equal(plano[19].produtoId, 20);
  assert.equal(serializarPlano([{ produtoId: 3, fornadas: 1 }, { produtoId: 1, fornadas: 0 }, { produtoId: 3, fornadas: 0.5 }, { produtoId: 2, fornadas: 2 }]), "2:2,3:1.5");
  assert.deepEqual(parsePlano(serializarPlano(plano)), plano);
  assert.equal(serializarPlano(parsePlano("3:0.25,2:55")), "2:55,3:0.25");
});

test("insumo indisponível vira pendência; estoque inválido não contamina contas; entradas não são mutadas", () => {
  const p = structuredClone(produto), antes = structuredClone(p);
  const r = listaCompras([{ produtoId: 1, fornadas: 1 }], [p], [embalagem], { 2: NaN });
  assert.equal(r.totais.incompleto, true); assert.equal(r.embalagens[0].comprar, 12);
  assert.ok(r.pendencias.some((p) => p.insumoId === 2));
  assert.equal(r.ingredientes[0].custoConsumido, null); assert.deepEqual(p, antes);
  assert.deepEqual(listaCompras([], [produto], [insumo]).totais, { gastoMercado: 0, custoConsumido: 0, unidadesBoas: 0, pacotes: 0, incompleto: false });
});
