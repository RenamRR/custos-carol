import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { getDb } from "../db";
import * as schema from "../db/schema";
import { carregarHistoricoPrecos } from "./consultas-db";

test("histórico envia corte serializável ao postgres-js e preserva fuso e autoria", async () => {
  const pg = new PGlite();
  // Não conecta: intercepta a fronteira Drizzle/postgres-js e executa em banco isolado.
  const cliente = postgres({ max: 1 });
  const cache = globalThis as unknown as { _db?: ReturnType<typeof getDb> };
  const anterior = cache._db;
  try {
    for (const nome of ["0000_init.sql", "0001_embalagem_por_produto.sql", "0002_mao_de_obra.sql", "0003_usuarios.sql"]) {
      await pg.exec(await readFile(`drizzle/${nome}`, "utf8"));
    }
    await pg.exec(`insert into usuarios (id, login, nome, senha_hash) values (1, 'carol', 'Carol', 'fixture');
      insert into insumos (id, nome, qtd) values (1, 'Cacau', 1000);
      insert into insumo_precos (insumo_id, preco, vigente_desde, alterado_por) values
        (1, 10, '2026-11-26T02:59:59Z', null),
        (1, 20, '2026-11-26T03:00:00Z', 1),
        (1, 30, '2026-11-26T04:00:00Z', null);`);
    const driver = new Proxy(cliente, {
      get(target, propriedade) {
        if (propriedade === "unsafe") return async (consulta: string, parametros: unknown[]) => {
          assert.equal(typeof parametros[0], "string", "Date cru não pode chegar ao serializador do postgres-js");
          assert.ok(Number.isFinite(Date.parse(parametros[0] as string)));
          return (await pg.query(consulta, parametros)).rows;
        };
        return Reflect.get(target, propriedade);
      },
    });
    cache._db = drizzle(driver, { schema });
    const historico = await carregarHistoricoPrecos(new Date("2026-11-26T00:00:00-03:00"));
    assert.deepEqual(historico.map((p) => [p.preco, p.alteradoPor]), [[20, "Carol"], [30, null]]);
    assert.equal(historico[0].vigenteDesde.toISOString(), "2026-11-26T03:00:00.000Z");
    assert.equal((await carregarHistoricoPrecos(new Date("2027-01-01T00:00:00Z"))).length, 0);
    await carregarHistoricoPrecos(); // O corte padrão também deve ser serializável.
  } finally {
    cache._db = anterior;
    await cliente.end();
    await pg.close();
  }
});
