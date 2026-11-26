import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { getDb } from "../db";
import { backup } from "../db/backup";
import { INSUMOS_INICIAIS, PRODUTOS_INICIAIS } from "../db/dados-iniciais";
import * as schema from "../db/schema";
import { carregarPainel } from "./consultas-db";
import { carregarAlertas, carregarBase, carregarHistoricoInsumo, carregarHistoricoProduto, carregarMaisSubiram, carregarSeries } from "./consultas-historico";
import { dispensarAlerta, salvarCustoProduto } from "./gravacoes-custo";
import { painelEm } from "./linha-do-tempo";

/** PGlite devolve {rows}; postgres-js devolve a lista. Adapta só o envelope de execute. */
function adaptar(alvo: object): object {
  return new Proxy(alvo, { get(target, prop, receiver) {
    if (prop === "execute") return async (...args: unknown[]) => ((await Reflect.apply(Reflect.get(target, prop), target, args)) as { rows: unknown[] }).rows;
    if (prop === "transaction") return (fn: (tx: object) => unknown, config: unknown) => Reflect.apply(Reflect.get(target, prop), target, [(tx: object) => fn(adaptar(tx)), config]);
    return Reflect.get(target, prop, receiver);
  } });
}
const literal = (v: string | number | null | undefined) => (v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`);

test("linha do tempo no banco: 'agora' = carregarPainel, alertas, dispensa, histórico, sem_forno e backup", async () => {
  const pg = new PGlite();
  const cache = globalThis as unknown as { _db?: ReturnType<typeof getDb> };
  const anterior = cache._db;
  const dir = await mkdtemp(path.join(os.tmpdir(), "carol-historia-"));
  try {
    for (const arquivo of (await readdir("drizzle")).filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) await pg.exec(await readFile(`drizzle/${arquivo}`, "utf8"));
    const db = adaptar(drizzle(pg, { schema })) as unknown as ReturnType<typeof getDb>;
    cache._db = db;

    // Seed real (planilha), há 200 dias, como o seed.ts grava.
    let sqlSeed = "insert into usuarios (id, login, nome, senha_hash) values (1, 'carol', 'Carol', 'fixture');\n";
    INSUMOS_INICIAIS.forEach((i, n) => {
      sqlSeed += `insert into insumos (id, nome, tipo, embalagem, qtd, unidade) values (${n + 1}, ${literal(i.nome)}, ${literal(i.tipo)}, ${literal(i.embalagem)}, ${i.qtd}, ${literal(i.unidade)});\n`;
      sqlSeed += `insert into insumo_precos (insumo_id, preco, vigente_desde) values (${n + 1}, ${i.preco}, now() - interval '200 days');\n`;
    });
    const idInsumo = (nome: string) => INSUMOS_INICIAIS.findIndex((i) => i.nome === nome) + 1;
    PRODUTOS_INICIAIS.forEach((p, n) => {
      const id = n + 1;
      sqlSeed += `insert into produtos (id, nome, rendimento, markup_alvo, minutos_preparo, minutos_acabamento_un) values (${id}, ${literal(p.nome)}, ${p.rendimento}, ${p.markupAlvo}, ${p.minutosPreparo}, ${p.minutosAcabamentoUn});\n`;
      sqlSeed += `insert into produto_precos (produto_id, preco, vigente_desde) values (${id}, ${p.precoVenda}, now() - interval '200 days');\n`;
      p.linhas.forEach((l, o) => { sqlSeed += `insert into receita_linhas (produto_id, insumo_id, qtd, ordem) values (${id}, ${idInsumo(l.insumo)}, ${l.qtd}, ${o});\n`; });
      p.embalagens.forEach((e, o) => { sqlSeed += `insert into produto_embalagens (produto_id, insumo_id, qtd_por_unidade, ordem) values (${id}, ${idInsumo(e.insumo)}, ${e.qtdPorUnidade}, ${o});\n`; });
    });
    await pg.exec(sqlSeed);
    const cacau = idInsumo("Cacau 70%");
    // Histórico dentro e fora das janelas, com autoria, empate de instante e registro futuro.
    await pg.exec(`
      update produtos set minutos_forno = 40 where id in (1, 2);
      insert into insumo_precos (insumo_id, preco, vigente_desde, alterado_por) values
        (${cacau}, 33, now() - interval '120 days', 1),
        (${cacau}, 45, now() - interval '30 days', 1),
        (${cacau}, 999, now() + interval '1 day', 1);
      insert into custo_hora (valor, vigente_desde, alterado_por) values (20, now() - interval '100 days', 1), (25, now() - interval '20 days', 1);
      insert into forno_custos (preco_botijao, horas_por_botijao, vigente_desde, alterado_por) values (120, 10, now() - interval '60 days', 1);
      insert into forma_pagamento_taxas (forma_id, taxa_pct, vigente_desde, alterado_por)
        select id, 4.99, now() - interval '10 days', 1 from formas_pagamento where nome = 'Crédito à vista';
      insert into produto_precos (produto_id, canal_id, preco, vigente_desde, alterado_por)
        select 1, id, 7, now() - interval '5 days', 1 from canais where nome = 'Feira';`);

    // 1) "Agora" da linha do tempo = carregarPainel(), número a número.
    const painel = await carregarPainel(db);
    const series = await carregarSeries(db);
    const base = await carregarBase(db);
    const agora = painelEm(series, base, Date.now());
    assert.equal(agora.length, painel.produtos.length);
    for (const p of painel.produtos) {
      const q = agora.find((x) => x.produto.id === p.produto.id)!;
      assert.equal(q.resultado.custoUnitario, p.resultado.custoUnitario, p.produto.nome);
      assert.deepEqual(q.canais, p.canais, p.produto.nome);
    }
    assert.ok(painel.produtos[0].resultado.custoForno > 0, "o ensaio cobre o forno");

    // 2) Alertas: o preço da Feira a R$ 7 derruba o Tradicional abaixo da meta (50%).
    const alertas = await carregarAlertas();
    const feira = alertas.filter((a) => a.produtoId === 1 && a.canal === "Feira" && a.causas.some((c) => c.tipo === "preco"));
    assert.equal(feira.length, 1);
    assert.ok(feira[0].de >= 50 && feira[0].para < 50);
    assert.deepEqual(feira[0].causas.map((c) => [c.tipo, c.de, c.para, c.alteradoPor]), [["preco", 11.5, 7, "Carol"]]);
    assert.ok(!alertas.some((a) => Date.parse(a.instante) < Date.now() - 91 * 864e5), "só 90 dias");
    for (let i = 1; i < alertas.length; i++) assert.ok(alertas[i - 1].de - alertas[i - 1].para >= alertas[i].de - alertas[i].para);
    assert.equal(new Set(alertas.map((a) => `${a.produtoId}|${a.canalId}`)).size, alertas.length, "um cartão por produto × canal");
    for (const a of alertas) {
      const hoje = painel.produtos.find((p) => p.produto.id === a.produtoId)!.canais.find((c) => c.canalId === a.canalId)!;
      assert.ok(hoje.margemPct < a.meta, "só o que ainda está abaixo da meta hoje");
    }

    // 3) Dispensar: some e não volta; repetir não duplica nem troca o autor; chave inválida é recusada.
    assert.deepEqual(await dispensarAlerta(1, feira[0].chave), { ok: true });
    assert.deepEqual(await dispensarAlerta(1, feira[0].chave), { ok: true });
    assert.ok(!(await carregarAlertas()).some((a) => a.chave === feira[0].chave));
    assert.equal((await pg.query("select * from alertas_dispensados")).rows.length, 1);
    assert.equal((await dispensarAlerta(1, "x'); drop table produtos;--")).ok, false);

    // 4) Histórico do insumo: sem valor em −365 dias, então começa no seed (−200), depois 33 e 45; o futuro (999) não entra.
    const hist = await carregarHistoricoInsumo(cacau);
    assert.deepEqual(hist!.pontos.map((p) => [p.preco, p.alteradoPor]), [[INSUMOS_INICIAIS[cacau - 1].preco, null], [33, "Carol"], [45, "Carol"]]);
    assert.equal(await carregarHistoricoInsumo(99999), null);

    // 5) Histórico do produto: degrau que termina no estado de agora.
    const hp = await carregarHistoricoProduto(1);
    const ultimo = hp!.pontos[hp!.pontos.length - 1];
    assert.equal(ultimo.custoUn, painel.produtos[0].resultado.custoUnitario);
    assert.deepEqual(hp!.canais.map((c) => c.nome), ["Encomenda", "Feira"]);
    await pg.exec("update produtos set ativo = false where id = 4");
    assert.equal(await carregarHistoricoProduto(4), null, "arquivado não tem histórico");

    // 6) Mais subiram: cacau 33 → 45 em 90 dias.
    const subiram = await carregarMaisSubiram();
    assert.deepEqual(subiram.map((s) => [s.insumoId, s.de, s.para]), [[cacau, 33, 45]]);

    // 7) sem_forno: tira a pendência e zera o forno; ausente mantém o valor gravado.
    assert.ok((await carregarPainel(db)).faltaPreencher.some((p) => p.id === "forno-3"));
    assert.deepEqual(await salvarCustoProduto(1, 3, { minutosForno: "0", perdaPct: "0", semForno: true }), { ok: true });
    assert.deepEqual(await salvarCustoProduto(1, 3, { minutosForno: "0", perdaPct: "0" }), { ok: true });
    const depois = await carregarPainel(db);
    assert.ok(!depois.faltaPreencher.some((p) => p.id === "forno-3"));
    assert.equal(depois.produtos.find((p) => p.produto.id === 3)!.produto.semForno, true);
    assert.equal((await salvarCustoProduto(1, 3, { minutosForno: "0", perdaPct: "0", semForno: "sim" as unknown as boolean })).ok, false);

    // 8) Backup na subida leva alertas_dispensados.
    const arquivo = await backup(async (consulta) => (await pg.query<Record<string, unknown>>(consulta)).rows, dir);
    const dump = JSON.parse(await readFile(arquivo, "utf8"));
    assert.equal(dump.tabelas.alertas_dispensados.length, 1);
    assert.equal(dump.tabelas.alertas_dispensados[0].chave, feira[0].chave);
  } finally {
    cache._db = anterior;
    await pg.close();
    await rm(dir, { recursive: true, force: true });
  }
});
