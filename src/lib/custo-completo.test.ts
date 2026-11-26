/**
 * Motor da Etapa 2 (perda, forno, canais, taxa, preço sugerido, pendências).
 * Cada caso traz a conta FEITA À MÃO no comentário; o teste confere o motor contra ela.
 * `npm run test:custo`
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { INSUMOS_INICIAIS, PRODUTOS_INICIAIS } from "../db/dados-iniciais.js";
import {
  calcularProduto,
  faltaPreencher,
  margemNoCanal,
  minutosDoLote,
  precoSugerido,
  resumoCanais,
  type Insumo,
} from "./calc.js";
import type { Canal, Forno, ProdutoCompleto } from "./custo-completo.js";

const EPS = 1e-9;
const perto = (obtido: number, esperado: number, eps = EPS) =>
  assert.ok(Math.abs(obtido - esperado) <= eps, `obtido ${obtido}, esperado ${esperado}`);

/** Insumo de preço p para uma compra de qtd unidades: custo por unidade = p/qtd. */
const insumo = (id: number, preco: number, qtd = 1, tipo: "ingrediente" | "embalagem" = "ingrediente"): Insumo =>
  ({ id, nome: `i${id}`, tipo, embalagem: "", qtd, unidade: "un", preco });

function produtoBase(extra: Partial<ProdutoCompleto> = {}): ProdutoCompleto {
  return {
    id: 1, nome: "Teste", rendimento: 12, markupAlvo: 3.5, precoVenda: 20,
    minutosPreparo: 0, minutosAcabamentoUn: 0, minutosForno: 0, perdaPct: 0,
    linhas: [], embalagens: [], precosPorCanal: [], ...extra,
  };
}

// ---------------------------------------------------------------------------
// 1) Regressão: perda 0 e forno 0 reproduzem a fórmula de ANTES
// ---------------------------------------------------------------------------
test("perda 0 e forno 0: custo/un idêntico à fórmula anterior, para os produtos do seed", () => {
  const insumos: Insumo[] = INSUMOS_INICIAIS.map((i, idx) => ({ ...i, id: idx + 1, preco: i.preco }));
  const idPorNome = new Map(insumos.map((i) => [i.nome, i.id]));
  const produtos: ProdutoCompleto[] = PRODUTOS_INICIAIS.map((p, pIdx) => ({
    id: pIdx + 1, nome: p.nome, rendimento: p.rendimento, markupAlvo: p.markupAlvo, precoVenda: p.precoVenda,
    minutosPreparo: p.minutosPreparo, minutosAcabamentoUn: p.minutosAcabamentoUn,
    minutosForno: 0, perdaPct: 0, precosPorCanal: [],
    linhas: p.linhas.map((l, i) => ({ id: pIdx * 100 + i, insumoId: idPorNome.get(l.insumo)!, qtd: l.qtd, alerta: null })),
    embalagens: p.embalagens.map((e, i) => ({ id: pIdx * 100 + 50 + i, insumoId: idPorNome.get(e.insumo)!, qtdPorUnidade: e.qtdPorUnidade })),
  }));
  for (const hora of [0, 30]) {
    for (const p of produtos) {
      // fórmula anterior, escrita direto: (insumos + embalagem×rend + mão de obra) ÷ rend
      const porId = new Map(insumos.map((i) => [i.id, i]));
      const ins = p.linhas.reduce((a, l) => a + (porId.get(l.insumoId)!.preco / porId.get(l.insumoId)!.qtd) * l.qtd, 0);
      const emb = p.embalagens.reduce((a, e) => a + (porId.get(e.insumoId)!.preco / porId.get(e.insumoId)!.qtd) * e.qtdPorUnidade, 0);
      const minutos = p.minutosPreparo + p.minutosAcabamentoUn * p.rendimento;
      const antes = (ins + emb * p.rendimento + (minutos / 60) * hora) / p.rendimento;
      const r = calcularProduto(p, insumos, hora, 0);
      perto(r.custoUnitario, antes);
      perto(r.custoForno, 0);
      perto(r.custoPerda, 0);
      perto(r.unidadesBoas, p.rendimento);
    }
  }
  // Valor conhecido sem hora (o mesmo do test:calc): Brownie Tradicional = R$ 3,66
  const trad = produtos.find((p) => p.nome === "Brownie Tradicional")!;
  perto(calcularProduto(trad, insumos, 0, 0).custoUnitario, 3.66, 0.005);
});

// ---------------------------------------------------------------------------
// 2) Caso à mão: perda 10%, rendimento 12, ingredientes R$ 36, preparo 60 min a R$ 30/h,
//    forno 40 min a R$ 0,05/min, embalagem R$ 1/un, acabamento 2 min/un
// ---------------------------------------------------------------------------
test("caso à mão: perda 10%, forno, preparo, acabamento e embalagem", () => {
  // Contas à mão:
  //  unidades boas   = 12 × (1 − 0,10)                    = 10,8
  //  ingredientes    = R$ 36,00 (lote inteiro)
  //  preparo         = 60 min × R$ 30/h                   = R$ 30,00 (lote)
  //  forno           = 40 min × R$ 0,05/min               = R$ 2,00  (lote)
  //  lote            = 36 + 30 + 2                        = R$ 68,00
  //  lote ÷ boas     = 68 ÷ 10,8                          = 6,296296
  //  embalagem/un    = R$ 1,00 (só nas boas)
  //  acabamento/un   = 2 min × R$ 0,50/min                = R$ 1,00 (acabamento é por unidade boa)
  //  custo/un        = 6,296296 + 1,00 + 1,00             = 8,296296
  //  perda (lote)    = 68 × 0,10                          = R$ 6,80
  const p = produtoBase({ rendimento: 12, perdaPct: 10, minutosPreparo: 60, minutosAcabamentoUn: 2, minutosForno: 40,
    linhas: [{ id: 1, insumoId: 1, qtd: 1, alerta: null }],
    embalagens: [{ id: 2, insumoId: 2, qtdPorUnidade: 1 }] });
  const insumos = [insumo(1, 36), insumo(2, 1)];
  const r = calcularProduto(p, insumos, 30, 0.05);
  perto(r.unidadesBoas, 10.8);
  perto(r.custoUnitario, 68 / 10.8 + 2, 1e-9);
  perto(r.custoUnitario, 8.296296, 1e-6);
  perto(r.custoPerda, 6.8);
  perto(r.custoForno, 2);
  perto(r.minutosLote, 60 + 2 * 10.8);
  // segmentos à mão: ingredientes 36×0,9 = 32,40; embalagem 10,80; mão de obra 27 + 10,80 = 37,80;
  // forno 2×0,9 = 1,80; perda 6,80
  const seg = Object.fromEntries(r.segmentos.map((s) => [s.tipo, s.valor]));
  perto(seg["ingrediente"], 32.4);
  perto(seg["embalagem"], 10.8);
  perto(seg["mao-de-obra"], 37.8);
  perto(seg["forno"], 1.8);
  perto(seg["perda"], 6.8);
  // soma dos segmentos = unidades boas × custo/un = 10,8 × 8,296296 = 89,60
  perto(r.segmentos.reduce((a, s) => a + s.valor, 0), 89.6, 1e-6);
});

// ---------------------------------------------------------------------------
// 3) Outros casos à mão
// ---------------------------------------------------------------------------
test("perda 25%, sem outros custos: 20 ÷ 7,5 e a perda fica com 5", () => {
  // boas = 10 × 0,75 = 7,5; custo/un = 20 ÷ 7,5 = 2,666667; perda = 20 × 0,25 = 5
  const r = calcularProduto(produtoBase({ rendimento: 10, perdaPct: 25, linhas: [{ id: 1, insumoId: 1, qtd: 1, alerta: null }] }), [insumo(1, 20)], 0, 0);
  perto(r.custoUnitario, 20 / 7.5, 1e-9);
  const seg = Object.fromEntries(r.segmentos.map((s) => [s.tipo, s.valor]));
  perto(seg["ingrediente"], 15);
  perto(seg["perda"], 5);
});

test("só forno: 30 min a R$ 0,20/min com rendimento 12 = R$ 0,50/un (botijão R$ 120 ÷ 10 h)", () => {
  // botijão: 120 ÷ (10 × 60) = R$ 0,20/min; forno: 30 × 0,20 = 6,00; 6,00 ÷ 12 = 0,50
  const r = calcularProduto(produtoBase({ rendimento: 12, minutosForno: 30 }), [], 0, 120 / (10 * 60));
  perto(r.custoUnitario, 0.5, 1e-9);
});

test("mão de obra com perda 50%: 20 min de preparo + 5 min/un, hora R$ 30, rendimento 4", () => {
  // sem perda: (20/60×30 + 5×4/60×30) = 10 + 10 = 20 ⇒ 20 ÷ 4 = 5,00
  const sem = calcularProduto(produtoBase({ rendimento: 4, minutosPreparo: 20, minutosAcabamentoUn: 5 }), [], 30, 0);
  perto(sem.custoUnitario, 5, 1e-9);
  // com perda 50%: boas = 2; minutos = 20 + 5×2 = 30 ⇒ R$ 15 ⇒ 15 ÷ 2 = 7,50
  const com = calcularProduto(produtoBase({ rendimento: 4, perdaPct: 50, minutosPreparo: 20, minutosAcabamentoUn: 5 }), [], 30, 0);
  perto(com.unidadesBoas, 2);
  perto(com.custoUnitario, 7.5, 1e-9);
  perto(minutosDoLote(produtoBase({ minutosPreparo: 20, minutosAcabamentoUn: 5 }), 2), 30);
});

test("soma dos segmentos = unidades boas × custo/un em uma grade de casos", () => {
  let casos = 0;
  for (const perda of [0, 1, 10, 33.33, 89.99])
    for (const rend of [1, 7, 12, 24])
      for (const hora of [0, 30.5])
        for (const forno of [0, 40])
          for (const prep of [0, 45])
            for (const acab of [0, 2.5])
              for (const emb of [0, 1.055]) {
                const p = produtoBase({
                  rendimento: rend, perdaPct: perda, minutosPreparo: prep, minutosAcabamentoUn: acab, minutosForno: forno,
                  linhas: [{ id: 1, insumoId: 1, qtd: 1, alerta: null }],
                  embalagens: emb ? [{ id: 2, insumoId: 2, qtdPorUnidade: 1 }] : [],
                });
                const r = calcularProduto(p, [insumo(1, 36), insumo(2, emb || 1)], hora, 0.05);
                const soma = r.segmentos.reduce((a, s) => a + s.valor, 0);
                perto(soma, r.unidadesBoas * r.custoUnitario, 1e-9);
                casos += 1;
              }
  assert.equal(casos, 5 * 4 * 2 * 2 * 2 * 2 * 2);
});

test("perda ≥ 90 (e negativa) lança RangeError; 89,99 é aceita", () => {
  assert.throws(() => calcularProduto(produtoBase({ perdaPct: 90 }), [], 0, 0), RangeError);
  assert.throws(() => calcularProduto(produtoBase({ perdaPct: 95 }), [], 0, 0), RangeError);
  assert.throws(() => calcularProduto(produtoBase({ perdaPct: -1 }), [], 0, 0), RangeError);
  assert.doesNotThrow(() => calcularProduto(produtoBase({ perdaPct: 89.99 }), [], 0, 0));
});

// ---------------------------------------------------------------------------
// 4) Margem no canal, preço sugerido
// ---------------------------------------------------------------------------
test("margemNoCanal: margem = preço − custo − preço × (taxa + imposto)/100", () => {
  // preço 20, custo 8,296296, taxa 4,99 %:
  //   taxa = 20 × 0,0499 = 0,998 ⇒ margem = 20 − 8,296296 − 0,998 = 10,705704 ⇒ 53,53 % ⇒ good
  const a = margemNoCanal(8.296296, 20, 4.99, 0);
  perto(a.margem, 10.705704, 1e-6);
  perto(a.margemPct, 53.52852, 1e-4);
  assert.equal(a.nivel, "good");
  // imposto 6 %, sem taxa: margem = 20 − 8,296296 − 1,20 = 10,503704 ⇒ 52,52 % ⇒ good
  const b = margemNoCanal(8.296296, 20, 0, 6);
  perto(b.margem, 10.503704, 1e-6);
  assert.equal(b.nivel, "good");
  // preço 15, taxa 4,99 %: margem = 15 − 8,296296 − 0,7485 = 5,955204 ⇒ 39,70 % ⇒ warn
  const c = margemNoCanal(8.296296, 15, 4.99, 0);
  perto(c.margem, 5.955204, 1e-6);
  assert.equal(c.nivel, "warn");
  // preço 12: margem = 12 − 8,296296 − 0,5988 = 3,104904 ⇒ 25,87 % ⇒ crit
  assert.equal(margemNoCanal(8.296296, 12, 4.99, 0).nivel, "crit");
});

test("precoSugerido: custo ÷ (1 − (margem + taxa + imposto)/100); null quando ≥ 100", () => {
  // 8,296296 ÷ (1 − (50 + 4,99)/100) = 8,296296 ÷ 0,4501 ≈ 18,4321 (conferido: 0,4501 × 18,4321 ≈ 8,2963)
  perto(precoSugerido(8.296296, 50, 4.99, 0) as number, 8.296296 / 0.4501, 1e-9);
  perto(precoSugerido(8.296296, 50, 4.99, 0) as number, 18.4321, 1e-4);
  // margem 50 + taxa 40 + imposto 10 = 100 ⇒ divisor 0 ⇒ null
  assert.equal(precoSugerido(8.296296, 50, 40, 10), null);
  // margem 60 + taxa 30 + imposto 10 = 100 ⇒ null
  assert.equal(precoSugerido(8.296296, 60, 30, 10), null);
  // 50 + 40 + 9,9 = 99,9 ⇒ divisor 0,001 ⇒ não é null
  assert.notEqual(precoSugerido(8.296296, 50, 40, 9.9), null);
  // valores negativos ou não finitos não viram número
  assert.equal(precoSugerido(-1, 50, 0, 0), null);
  assert.equal(precoSugerido(Number.NaN, 50, 0, 0), null);
});

// ---------------------------------------------------------------------------
// 5) Resumo por canal
// ---------------------------------------------------------------------------
test("resumoCanais: preço herdado × próprio, taxa = maior entre formas ativas, forma sem taxa conta 0", () => {
  const forma = (id: number, nome: string, taxaPct: number | null, ativo = true) => ({ id, nome, ativo, ordem: id, taxaPct });
  const canais: Canal[] = [
    { id: 1, nome: "Encomenda", margemAlvoPct: 50, ativo: true, ordem: 0, formas: [
      forma(1, "Pix", 0), forma(2, "Dinheiro", 30, false), forma(4, "Crédito à vista", 4.99),
    ] },
    { id: 2, nome: "Feira", margemAlvoPct: 40, ativo: true, ordem: 1, formas: [
      forma(1, "Pix", 0), forma(3, "Débito", null), forma(4, "Crédito à vista", 3.5),
    ] },
    { id: 3, nome: "Desativado", margemAlvoPct: 50, ativo: false, ordem: 2, formas: [] },
  ];
  const produto = produtoBase({ precoVenda: 20, precosPorCanal: [
    { canalId: 1, preco: 20, herdado: true }, { canalId: 2, preco: 25, herdado: false },
  ] });
  const custo = 8.296296;
  const [enc, fei] = resumoCanais(produto, custo, canais, 0);

  assert.equal(enc.nome, "Encomenda");
  assert.equal(enc.precoHerdado, true);
  assert.equal(enc.preco, 20);
  perto(enc.taxaPct, 4.99);              // maior entre Pix 0, Crédito 4,99 (Dinheiro inativo ignorado)
  assert.equal(enc.formaMaisCara, "Crédito à vista");
  perto(enc.margem, 10.705704, 1e-6);    // 20 − 8,296296 − 0,998
  perto(enc.precoSugerido as number, custo / (1 - (50 + 4.99) / 100), 1e-9);

  assert.equal(fei.nome, "Feira");
  assert.equal(fei.precoHerdado, false);
  assert.equal(fei.preco, 25);
  perto(fei.taxaPct, 3.5);               // Débito sem taxa conta 0; o máximo é o Crédito 3,5
  perto(fei.margem, 25 - 8.296296 - 0.875, 1e-6);
  perto(fei.precoSugerido as number, custo / (1 - (40 + 3.5) / 100), 1e-9);
  assert.equal(canais.length, 3, "canal inativo não entra no resumo");
});

test("resumoCanais: só forma sem taxa conhecida conta 0, sem 'mais cara', e vai para formasSemTaxa", () => {
  const canais: Canal[] = [{ id: 1, nome: "Feira", margemAlvoPct: 50, ativo: true, ordem: 0, formas: [
    { id: 3, nome: "Débito", ativo: true, ordem: 0, taxaPct: null },
  ] }];
  const [r] = resumoCanais(produtoBase({ precoVenda: 10, precosPorCanal: [{ canalId: 1, preco: 10, herdado: true }] }), 4, canais, 0);
  perto(r.taxaPct, 0);
  assert.equal(r.formaMaisCara, null);
  assert.deepEqual(r.formasSemTaxa, ["Débito"]);
  perto(r.margem, 6, 1e-9);
});

// Cenário real da migração 0004 (Smith): Pix 0, Dinheiro 0, Débito e Crédito sem taxa.
test("resumoCanais: com Débito/Crédito sem taxa avisa formasSemTaxa; com Crédito 4,99 ele vira o pior caso", () => {
  const forma = (id: number, nome: string, taxaPct: number | null) => ({ id, nome, ativo: true, ordem: id, taxaPct });
  const canal = (credito: number | null): Canal[] => [{ id: 1, nome: "Encomenda", margemAlvoPct: 50, ativo: true, ordem: 0, formas: [
    forma(1, "Pix", 0), forma(2, "Dinheiro", 0), forma(3, "Débito", null), forma(4, "Crédito à vista", credito),
  ] }];
  const produto = produtoBase({ precoVenda: 10, precosPorCanal: [{ canalId: 1, preco: 10, herdado: true }] });

  const [antes] = resumoCanais(produto, 4, canal(null), 0);
  assert.deepEqual(antes.formasSemTaxa, ["Débito", "Crédito à vista"]);
  assert.equal(antes.formaMaisCara, "Pix"); // a maior CONHECIDA (0%); a tela avisa por formasSemTaxa
  perto(antes.taxaPct, 0);

  const [depois] = resumoCanais(produto, 4, canal(4.99), 0);
  assert.deepEqual(depois.formasSemTaxa, ["Débito"]);
  assert.equal(depois.formaMaisCara, "Crédito à vista");
  perto(depois.taxaPct, 4.99);
  // margem = 10 − 4 − 10 × 4,99% = 5,501
  perto(depois.margem, 5.501, 1e-9);
});

// ---------------------------------------------------------------------------
// 6) Pendências ("Falta preencher")
// ---------------------------------------------------------------------------
test("faltaPreencher: hora 0, botijão, forno do produto, forma sem taxa (uma vez só), canal sem forma", () => {
  const formaCompleta = (id: number, nome: string, taxaPct: number | null) => ({ id, nome, ativo: true, ordem: id, taxaPct });
  const forno = (informado: boolean): Forno => ({ precoBotijao: informado ? 120 : 0, horasPorBotijao: informado ? 10 : 0, custoHora: informado ? 12 : 0, custoMinuto: informado ? 0.2 : 0, informado });
  const canaisOk: Canal[] = [
    { id: 1, nome: "Encomenda", margemAlvoPct: 50, ativo: true, ordem: 0, formas: [formaCompleta(1, "Pix", 0), formaCompleta(4, "Crédito", 4.99)] },
    { id: 2, nome: "Feira", margemAlvoPct: 40, ativo: true, ordem: 1, formas: [formaCompleta(1, "Pix", 0), formaCompleta(3, "Débito", null)] },
  ];
  const produtoOk = produtoBase({ minutosForno: 40 });

  // tudo preenchido, exceto a taxa do Débito (que está nos dois canais): UMA pendência só
  const pend = faltaPreencher([produtoOk], 30, forno(true), canaisOk);
  assert.deepEqual(pend.map((p) => p.id), ["taxa-3"]);
  assert.equal(pend[0].href, "/mais#formas-pagamento");

  // hora 0 e botijão não informado
  const hora = faltaPreencher([produtoOk], 0, forno(false), canaisOk).map((p) => p.id);
  assert.ok(hora.includes("hora"));
  assert.ok(hora.includes("forno"));

  // produto sem minutos de forno
  const semForno = faltaPreencher([produtoBase({ id: 9, nome: "Sem forno", minutosForno: 0 })], 30, forno(true), [canaisOk[0]]);
  assert.deepEqual(semForno.map((p) => p.id), ["forno-9"]);
  assert.equal(semForno[0].href, "/produtos/9#forno");

  // canal sem nenhuma forma ativa
  const canalVazio: Canal[] = [{ id: 5, nome: "Feira", margemAlvoPct: 40, ativo: true, ordem: 0, formas: [] }];
  assert.ok(faltaPreencher([produtoOk], 30, forno(true), canalVazio).some((p) => p.id === "formas-5"));

  // tudo certo: nada pendente
  const nenhuma = faltaPreencher([produtoOk], 30, forno(true), [canaisOk[0]].map((c) => ({ ...c, formas: [formaCompleta(1, "Pix", 0)] })));
  assert.deepEqual(nenhuma, []);
});
