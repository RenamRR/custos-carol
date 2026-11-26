import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { getDb } from "../db";
import * as schema from "../db/schema";
import { lerUsuariosIniciais } from "../db/usuarios-iniciais";
import { hashSenha, verificarSenha } from "./senhas";
import { autenticarCredenciais, hashToken, OPCOES_COOKIE, revogarSessao, usuarioDaSessao } from "./auth";

test("scrypt: salt aleatório, formato sem dólar, senha incorreta e hash inválido", async () => {
  await assert.rejects(hashSenha("12345678901"), /12 caracteres/);
  assert.ok(await hashSenha("123456789012"));
  const a = await hashSenha("senha de teste á");
  const b = await hashSenha("senha de teste á");
  assert.match(a, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.notEqual(a, b);
  assert.equal(await verificarSenha("senha de teste á", a), true);
  assert.equal(await verificarSenha("outra", a), false);
  assert.equal(await verificarSenha("senha de teste á", "scrypt:00:00"), false);
  assert.equal(await verificarSenha("x".repeat(1025), a), false);
  assert.throws(() => lerUsuariosIniciais(`Carol|Carol|${a}; carol |Outra|${b}`), /entrada 2/);
  assert.deepEqual(lerUsuariosIniciais(` Carol | Carol |${a}`), [{ login: "carol", nome: "Carol", senhaHash: a }]);
  assert.throws(() => lerUsuariosIniciais("carol|Carol|senha"), /entrada 1/);
});

test("ADR-001: limite persistente, sessões, expiração, revogação e usuário inativo", async () => {
  const pg = new PGlite();
  try {
    for (const arquivo of ["0000_init.sql", "0001_embalagem_por_produto.sql", "0002_mao_de_obra.sql", "0003_usuarios.sql"]) {
      await pg.exec(await readFile(`drizzle/${arquivo}`, "utf8"));
    }
    // Os drivers expõem a mesma API Drizzle usada pela auth; o cast fica só no ensaio.
    const db = drizzle(pg, { schema }) as unknown as ReturnType<typeof getDb>;
    const hash = await hashSenha("senha correta");
    await pg.query("insert into usuarios (login, nome, senha_hash) values ($1, $2, $3)", ["carol", "Carol", hash]);
    const estado = async () => (await pg.query<{ falhas_login: number; bloqueado_ate: Date | null }>("select falhas_login, bloqueado_ate from usuarios")).rows[0];
    for (let i = 0; i < 5; i++) assert.equal(await autenticarCredenciais(" CAROL ", "errada", undefined, db), null);
    const bloqueado = await estado();
    assert.equal(bloqueado.falhas_login, 0);
    assert.ok(bloqueado.bloqueado_ate);
    assert.equal(await autenticarCredenciais("carol", "senha correta", undefined, db), null);
    assert.equal(await autenticarCredenciais("inexistente", "senha correta", undefined, db), null);
    assert.deepEqual(await estado(), bloqueado, "bloqueio não se estende com novas tentativas");
    await pg.exec("update usuarios set bloqueado_ate = now() - interval '1 second'");
    assert.equal(await autenticarCredenciais("carol", "errada", undefined, db), null);
    assert.equal((await estado()).falhas_login, 1);
    const sessao = await autenticarCredenciais("carol", "senha correta", undefined, db);
    assert.ok(sessao);
    assert.deepEqual(await estado(), { falhas_login: 0, bloqueado_ate: null });
    assert.match(sessao.token, /^[a-f0-9]{64}$/);
    const persistida = (await pg.query<{ id: string; duracao: number }>("select id, extract(epoch from expira_em - criado_em)::integer as duracao from sessoes")).rows[0];
    assert.equal(persistida.id, hashToken(sessao.token));
    assert.notEqual(persistida.id, sessao.token);
    assert.equal(persistida.duracao, 30 * 86400);
    assert.deepEqual(await usuarioDaSessao(sessao.token, db), { id: 1, login: "carol", nome: "Carol" });
    assert.equal(await usuarioDaSessao("invalido", db), null);
    await pg.exec("update sessoes set expira_em = now()");
    assert.equal(await usuarioDaSessao(sessao.token, db), null, "sessão expirada não autentica");
    const nova = await autenticarCredenciais("carol", "senha correta", sessao.token, db);
    assert.ok(nova);
    assert.equal((await pg.query("select * from sessoes")).rows.length, 1, "rotação revoga token anterior");
    await pg.query("insert into sessoes (id, usuario_id, expira_em) values ($1, 1, now() - interval '1 second')", ["e".repeat(64)]);
    const limpa = await autenticarCredenciais("carol", "senha correta", undefined, db);
    assert.ok(limpa);
    assert.equal((await pg.query("select * from sessoes where expira_em < now()")).rows.length, 0);
    await revogarSessao(limpa.token, db);
    await pg.exec("update usuarios set ativo = false");
    assert.equal(await usuarioDaSessao(nova.token, db), null);
    assert.equal(await autenticarCredenciais("carol", "senha correta", undefined, db), null);
    assert.equal((await estado()).falhas_login, 1);
    await revogarSessao(nova.token, db);
    assert.equal((await pg.query("select * from sessoes")).rows.length, 0);
    assert.equal(OPCOES_COOKIE.httpOnly, true);
    assert.equal(OPCOES_COOKIE.secure, true);
    assert.equal(OPCOES_COOKIE.sameSite, "lax");
    await pg.exec(`update usuarios set ativo = true, falhas_login = 0, bloqueado_ate = null;
      create table falhas_observadas (id serial);
      create function observar_falha() returns trigger language plpgsql as $$
      begin insert into falhas_observadas default values; return new; end $$;
      create trigger observar_falha after update on usuarios for each row execute function observar_falha();`);
    // PGlite serializa transações; este ensaio cobre rajadas, o Tester valida locks no Postgres.
    const erros = await Promise.all(Array.from({ length: 10 }, () => autenticarCredenciais("carol", "senha errada", undefined, db)));
    assert.ok(erros.every((r) => r === null));
    assert.equal((await pg.query("select * from falhas_observadas")).rows.length, 5, "só as cinco primeiras tentativas atualizam a conta");
    const corretas = await Promise.all(Array.from({ length: 10 }, () => autenticarCredenciais("carol", "senha correta", undefined, db)));
    assert.ok(corretas.every((r) => r === null), "senha correta também é recusada durante bloqueio");
    assert.equal((await pg.query("select * from sessoes")).rows.length, 0);
    assert.equal((await pg.query("select * from falhas_observadas")).rows.length, 5);
  } finally {
    await pg.close();
  }
});

test("hash-senha aceita pipe sem eco, recusa senha curta e avisa no fallback argv", async () => {
  const senha = "senha sintetica segura";
  const executar = (args: string[], input?: string) => spawnSync(process.execPath,
    ["--import", "tsx", "src/lib/hash-senha.ts", ...args], { input, encoding: "utf8" });
  const pipe = executar([], `${senha}\r\n`);
  assert.equal(pipe.status, 0, pipe.stderr);
  if (process.platform === "win32") assert.match(pipe.stderr, /PowerShell 5.1/);
  else assert.equal(pipe.stderr, "");
  assert.ok(await verificarSenha(senha, pipe.stdout.trim()));
  assert.ok(!pipe.stdout.includes(senha));
  const curta = executar([], "curta\n");
  assert.equal(curta.status, 1);
  assert.match(curta.stderr, /12 caracteres/);
  const argv = executar([senha]);
  assert.equal(argv.status, 0, argv.stderr);
  assert.match(argv.stderr, /histórico do shell/);
  assert.ok(!argv.stderr.includes(senha));
  assert.ok(await verificarSenha(senha, argv.stdout.trim()));
});
