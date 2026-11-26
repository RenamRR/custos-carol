import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, unlink, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { getDb } from "../db";
import * as schema from "../db/schema";
import { backup } from "../db/backup";
import * as gravacoes from "./gravacoes-vendas";
import * as consultas from "./consultas-vendas";
import { diaSaoPaulo, somarDias } from "./vendas";

test("migração, snapshots, validações, cancelamento, arquivamento, consultas e backup em banco descartável", async () => {
  const pg = new PGlite();
  const cache = globalThis as unknown as { _db?: ReturnType<typeof getDb> };
  const anterior = cache._db;
  const dir = await mkdtemp(path.join(os.tmpdir(), "carol-vendas-"));
  try {
    for (const arquivo of (await readdir("drizzle")).filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) await pg.exec(await readFile(`drizzle/${arquivo}`, "utf8"));
    // PGlite devolve {rows} em execute; postgres-js devolve a própria lista.
    // Apenas essa fronteira difere; queries, parâmetros e transações são reais.
    const db = drizzle(pg, { schema });
    function adaptar(alvo: object): object {
      return new Proxy(alvo, { get(target, prop, receiver) {
        if (prop === "execute") return async (...args: unknown[]) => ((await Reflect.apply(Reflect.get(target, prop), target, args)) as { rows: unknown[] }).rows;
        if (prop === "transaction") return (fn: (tx: object) => unknown, config: unknown) => Reflect.apply(Reflect.get(target, prop), target, [(tx: object) => fn(adaptar(tx)), config]);
        return Reflect.get(target, prop, receiver);
      } });
    }
    cache._db = adaptar(db) as unknown as ReturnType<typeof getDb>;
    await pg.exec(`insert into usuarios (id, login, nome, senha_hash) values (1,'carol','Carol','fixture'), (2,'renam','Renam','fixture');
      insert into insumos(id,nome,qtd) values (1,'Cacau',1000);
      insert into insumo_precos(insumo_id,preco) values (1,20);
      insert into produtos(id,nome,rendimento) values (1,'Tradicional',10),(2,'Nutella',10),(3,'Sem venda',10);
      insert into receita_linhas(produto_id,insumo_id,qtd) values (1,1,500),(2,1,1000);
      insert into produto_precos(produto_id,preco) values (1,10),(2,20);`);
    const hoje = diaSaoPaulo();
    const [ano, mes] = hoje.split("-").map(Number);
    const dados = await consultas.carregarVender();
    assert.deepEqual(dados.produtos.slice(0, 2).map((p) => p.custoUn), [1, 2]);
    const feira = dados.canais.find((c) => c.nome === "Feira")!;
    const encomenda = dados.canais.find((c) => c.nome === "Encomenda")!;
    const pix = feira.formas.find((f) => f.nome === "Pix")!;
    const credito = feira.formas.find((f) => f.taxaPct === null)!;
    const e = await gravacoes.criarEvento(1, { nome: "Feira teste", data: hoje, custoFixo: "60,00" });
    assert.ok(e.ok); if (!e.ok) return;
    const entrada = { canalId: feira.id, formaId: pix.id, eventoId: e.eventoId, itens: [{ produtoId: 1, quantidade: 2, precoUn: "10,00" }, { produtoId: 2, quantidade: 1, precoUn: "20,00" }] };
    assert.equal((await gravacoes.registrarVenda(1, { ...entrada, canalId: encomenda.id })).ok, false);
    assert.equal((await gravacoes.registrarVenda(1, { ...entrada, itens: [{ produtoId: 1, quantidade: 1000, precoUn: "10" }] })).ok, false);
    assert.equal((await gravacoes.registrarVenda(1, { ...entrada, vendidaEm: somarDias(hoje, -1) })).ok, false);
    assert.equal((await gravacoes.registrarVenda(1, { ...entrada, formaId: 999 })).ok, false);
    const v = await gravacoes.registrarVenda(1, entrada);
    assert.ok(v.ok, JSON.stringify(v)); if (!v.ok) return;
    assert.deepEqual(v.itensComCusto.map((i) => i.custoUn), [1, 2]); assert.equal(v.custoUnMedio, 4 / 3);
    const c = await gravacoes.registrarVenda(2, { ...entrada, formaId: credito.id, itens: [{ produtoId: 1, quantidade: 1, precoUn: "10" }] });
    assert.ok(c.ok); if (!c.ok) return;
    let m = await consultas.carregarMes(ano, mes);
    assert.equal(m.resumo.totais.faturamento, 50); assert.equal(m.resumo.totais.custo, 5); assert.equal(m.resumo.totais.lucro, -15);
    assert.equal(m.resumo.totais.vendasSemTaxa, 1);
    assert.equal((await gravacoes.cancelarEvento(1, e.eventoId)).ok, false);
    assert.equal((await gravacoes.salvarEvento(1, e.eventoId, { nome: "Feira", data: somarDias(hoje, 1), custoFixo: "60" })).ok, false);
    assert.ok((await gravacoes.salvarEvento(2, e.eventoId, { nome: "Feira corrigida", data: hoje, custoFixo: "30" })).ok);
    await pg.exec(`insert into insumo_precos(insumo_id,preco,vigente_desde) values (1,200,now());
      insert into forma_pagamento_taxas(forma_id,taxa_pct) values (${credito.id},5);
      update produtos set nome='Nome novo' where id=1;`);
    m = await consultas.carregarMes(ano, mes);
    assert.equal(m.resumo.totais.custo, 5); assert.equal(m.resumo.totais.vendasSemTaxa, 1); assert.equal(m.resumo.totais.lucro, 15);
    assert.equal(m.vendas[0].itens[0].produtoNome, "Tradicional");
    assert.equal(m.eventos[0].alteradoPor, 2);
    assert.ok((await gravacoes.cancelarVenda(2, c.vendaId)).ok);
    assert.ok((await gravacoes.cancelarVenda(1, c.vendaId)).ok); // idempotente, preserva autor original
    m = await consultas.carregarMes(ano, mes);
    assert.equal(m.resumo.totais.faturamento, 40); assert.equal(m.resumo.totais.custo, 4); assert.equal(m.resumo.totais.lucro, 6);
    assert.equal(m.resumo.totais.vendasSemTaxa, 0);
    assert.equal(m.vendas.find((x) => x.id === c.vendaId)?.canceladaPor, 2);
    assert.ok((await gravacoes.removerProduto(2, 1)).ok);
    assert.ok((await gravacoes.removerProduto(1, 3)).ok);
    const produtos = (await pg.query<{ id: number; ativo: boolean; arquivado_por: number | null }>("select id,ativo,arquivado_por from produtos order by id")).rows;
    assert.deepEqual(produtos, [{ id: 1, ativo: false, arquivado_por: 2 }, { id: 2, ativo: true, arquivado_por: null }]);
    assert.equal((await gravacoes.registrarVenda(1, entrada)).ok, false);
    assert.equal((await consultas.carregarVender()).produtos.length, 1);
    assert.equal((await consultas.carregarHoje()).vendas.length, 2);
    assert.ok((await gravacoes.cancelarVenda(1, v.vendaId)).ok);
    assert.ok((await gravacoes.cancelarEvento(2, e.eventoId)).ok);
    assert.equal((await consultas.carregarMes(ano, mes)).resumo.totais.lucro, 0);
    assert.equal((await gravacoes.registrarVenda(1, entrada)).ok, false);
    // Consulta de competência: 23h30 SP já é janeiro em UTC, mas pertence a dezembro.
    await pg.exec(`insert into vendas(vendida_em,canal_id,forma_id,imposto_pct,criado_por) values ('2027-01-01T02:30:00Z',${encomenda.id},${pix.id},0,1);`);
    assert.equal((await consultas.carregarMes(2026, 12)).vendas.filter((x) => x.vendidaEm === "2027-01-01T02:30:00.000Z").length, 1);
    assert.equal((await consultas.carregarMes(2027, 1)).vendas.length, 0);
    const arquivo = await backup(async (q) => (await pg.query<Record<string, unknown>>(q)).rows, dir);
    const dump = JSON.parse(await readFile(arquivo, "utf8"));
    assert.equal(dump.tabelas.eventos.length, 1); assert.equal(dump.tabelas.vendas.length, 3); assert.equal(dump.tabelas.venda_itens.length, 3);
    assert.equal(dump.tabelas.venda_itens[0].custo_un, "1");
    assert.ok(!JSON.stringify(dump).includes("senha_hash"));
  } finally {
    cache._db = anterior; await pg.close();
    for (const arquivo of await readdir(dir)) await unlink(path.join(dir, arquivo));
    await rmdir(dir);
  }
});
