import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rmdir, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { backup } from "./backup";

test("backup JSON preserva autoria e tabelas novas, sem hashes nem sessões", async () => {
  const pg = new PGlite();
  const dir = await mkdtemp(path.join(os.tmpdir(), "carol-backup-test-"));
  try {
    await pg.exec(`create table usuarios (id int, login text, nome text, ativo boolean,
      criado_em timestamptz, senha_hash text, falhas_login int, bloqueado_ate timestamptz);
      insert into usuarios values (7, 'carol', 'Carol', true, now(), 'HASH-NAO-EXPORTAR', 3, now());
      create table sessoes (id text); insert into sessoes values ('TOKEN-NAO-EXPORTAR');
      create table tabela_futura (id int, alterado_por int); insert into tabela_futura values (9, 7);`);
    const arquivo = await backup(async (consulta) => (await pg.query<Record<string, unknown>>(consulta)).rows, dir);
    const json = await readFile(arquivo, "utf8");
    assert.doesNotMatch(json, /senha_hash|sessoes|HASH-NAO-EXPORTAR|TOKEN-NAO-EXPORTAR|falhas_login|bloqueado_ate/);
    const dump = JSON.parse(json);
    assert.deepEqual(Object.keys(dump.tabelas.usuarios[0]).sort(), ["ativo", "criado_em", "id", "login", "nome"]);
    assert.equal(dump.tabelas.usuarios[0].id, 7);
    assert.deepEqual(dump.tabelas.tabela_futura, [{ id: 9, alterado_por: 7 }]);
    if (process.platform !== "win32") assert.equal((await stat(arquivo)).mode & 0o777, 0o600);
  } finally {
    await pg.close();
    for (const nome of await readdir(dir)) await unlink(path.join(dir, nome));
    await rmdir(dir);
  }
});
