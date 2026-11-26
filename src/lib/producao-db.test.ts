import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { getDb } from "../db";
import * as schema from "../db/schema";
import { carregarProduzir } from "./consultas-producao";

test("query: apenas produtos ativos, preço vigente com desempate, null distinto de zero", async () => {
  const pg = new PGlite();
  const cache = globalThis as unknown as { _db?: ReturnType<typeof getDb> };
  const anterior = cache._db;
  try {
    for (const arquivo of (await readdir("drizzle")).filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) await pg.exec(await readFile(`drizzle/${arquivo}`, "utf8"));
    // Adapta apenas o envelope execute: PGlite {rows}, postgres-js lista diretamente.
    function adaptar(alvo: object): object {
      return new Proxy(alvo, { get(target, prop, receiver) {
        if (prop === "execute") return async (...args: unknown[]) => ((await Reflect.apply(Reflect.get(target, prop), target, args)) as { rows: unknown[] }).rows;
        if (prop === "transaction") return (fn: (tx: object) => unknown, config: unknown) => Reflect.apply(Reflect.get(target, prop), target, [(tx: object) => fn(adaptar(tx)), config]);
        return Reflect.get(target, prop, receiver);
      } });
    }
    cache._db = adaptar(drizzle(pg, { schema })) as unknown as ReturnType<typeof getDb>;
    await pg.exec(`insert into produtos(id,nome,rendimento,perda_pct,ativo) values (1,'Ativo',12,5,true),(2,'Arquivado',12,0,false);
      insert into insumos(id,nome,qtd) values (1,'Sem preço',1000),(2,'Zero explícito',500),(3,'Vigente',500);
      insert into insumo_precos(insumo_id,preco,vigente_desde) values
        (2,0,'2020-01-01'),(3,10,'2020-01-01'),(3,20,'2020-01-01'),(3,999,'9999-01-01');
      insert into receita_linhas(produto_id,insumo_id,qtd) values (1,1,100),(2,3,200);`);
    const dados = await carregarProduzir();
    assert.equal(dados.produtos.length, 1); assert.equal(dados.produtos[0].nome, "Ativo");
    assert.equal(dados.produtos[0].perdaPct, 5); assert.equal(dados.produtos[0].linhas[0].qtd, 100);
    assert.deepEqual(dados.insumos.map((i) => [i.id, i.preco]).sort((a, b) => a[0]! - b[0]!), [[1, null], [2, 0], [3, 20]]);
    assert.deepEqual(Object.keys(dados.produtos[0]).sort(), ["embalagens", "id", "linhas", "nome", "perdaPct", "rendimento"]);
  } finally { cache._db = anterior; await pg.close(); }
});
