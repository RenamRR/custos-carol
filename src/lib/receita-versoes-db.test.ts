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
import {
  carregarAlertas, carregarBase, carregarHistoricoInsumo, carregarHistoricoProduto, carregarHistoricoReceita, carregarSeries,
  receitasDivergentes,
} from "./consultas-historico";
import { salvarCustoProduto, salvarPrecoCanal } from "./gravacoes-custo";
import {
  criarLinha, duplicarProduto, removerInsumo, removerLinha, salvarInsumo, salvarLinha, salvarPrecoInsumo, salvarProduto,
} from "./gravacoes-receita";
import { removerProduto } from "./gravacoes-vendas";
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
const quase = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) <= 1e-9, `${msg ?? ""}: ${a} ≠ ${b}`);
const OK = { ok: true };

test("receita no banco: sessão de edição, autoria, voltar atrás, duplicar, cascade, alerta com diff, preenchimento, embalagem, arquivar e check", async () => {
  const pg = new PGlite();
  const cache = globalThis as unknown as { _db?: ReturnType<typeof getDb> };
  const anterior = cache._db;
  const dir = await mkdtemp(path.join(os.tmpdir(), "carol-receita-"));
  try {
    for (const arquivo of (await readdir("drizzle")).filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) await pg.exec(await readFile(`drizzle/${arquivo}`, "utf8"));
    const db = adaptar(drizzle(pg, { schema })) as unknown as ReturnType<typeof getDb>;
    cache._db = db;
    const q = async <T = Record<string, unknown>>(consulta: string) => (await pg.query<T>(consulta)).rows;

    // Seed da planilha há 200 dias, numa transação só, como o seed.ts. Mais um "Cacau teste" (500 g a R$ 20)
    // fora de qualquer receita e o botijão (120 / 10 h = 0,20/min) há 60 dias.
    let sqlSeed = "begin;\ninsert into usuarios (id, login, nome, senha_hash) values (1, 'carol', 'Carol', 'fixture'), (2, 'renam', 'Renam', 'fixture');\n";
    INSUMOS_INICIAIS.forEach((i, n) => {
      sqlSeed += `insert into insumos (id, nome, tipo, embalagem, qtd, unidade) values (${n + 1}, ${literal(i.nome)}, ${literal(i.tipo)}, ${literal(i.embalagem)}, ${i.qtd}, ${literal(i.unidade)});\n`;
      sqlSeed += `insert into insumo_precos (insumo_id, preco, vigente_desde) values (${n + 1}, ${i.preco}, now() - interval '200 days');\n`;
    });
    const cacauTeste = INSUMOS_INICIAIS.length + 1;
    sqlSeed += `insert into insumos (id, nome, tipo, embalagem, qtd, unidade) values (${cacauTeste}, 'Cacau teste', 'ingrediente', 'Pacote 500g', 500, 'g');\n`;
    sqlSeed += `insert into insumo_precos (insumo_id, preco, vigente_desde) values (${cacauTeste}, 20, now() - interval '200 days');\n`;
    sqlSeed += `select setval('insumos_id_seq', ${cacauTeste});\n`;
    const idInsumo = (nome: string) => INSUMOS_INICIAIS.findIndex((i) => i.nome === nome) + 1;
    PRODUTOS_INICIAIS.forEach((p, n) => {
      const id = n + 1;
      sqlSeed += `insert into produtos (id, nome, rendimento, markup_alvo, minutos_preparo, minutos_acabamento_un, criado_em) values (${id}, ${literal(p.nome)}, ${p.rendimento}, ${p.markupAlvo}, ${p.minutosPreparo}, ${p.minutosAcabamentoUn}, now() - interval '200 days');\n`;
      sqlSeed += `insert into produto_precos (produto_id, preco, vigente_desde) values (${id}, ${p.precoVenda}, now() - interval '200 days');\n`;
      p.linhas.forEach((l, o) => { sqlSeed += `insert into receita_linhas (produto_id, insumo_id, qtd, ordem) values (${id}, ${idInsumo(l.insumo)}, ${l.qtd}, ${o});\n`; });
      p.embalagens.forEach((e, o) => { sqlSeed += `insert into produto_embalagens (produto_id, insumo_id, qtd_por_unidade, ordem) values (${id}, ${idInsumo(e.insumo)}, ${e.qtdPorUnidade}, ${o});\n`; });
    });
    sqlSeed += `select setval('produtos_id_seq', ${PRODUTOS_INICIAIS.length});\n`;
    sqlSeed += "insert into forno_custos (preco_botijao, horas_por_botijao, vigente_desde) values (120, 10, now() - interval '60 days');\ncommit;";
    await pg.exec(sqlSeed);

    const versoes = (produtoId: number) => q<{ id: number; alterado_por: number | null; vigente_desde: Date; atualizado_em: Date | null; receita: Record<string, unknown> }>(
      `select id, alterado_por, vigente_desde, atualizado_em, receita from receita_versoes where produto_id = ${produtoId} order by vigente_desde, id`);
    const passar = (produtoId: number, minutos: number) => pg.exec(`update receita_versoes set vigente_desde = vigente_desde - interval '${minutos} minutes',
      atualizado_em = atualizado_em - interval '${minutos} minutes' where produto_id = ${produtoId}`);
    const consistente = async (quando: string) => {
      const painel = await carregarPainel(db);
      const agora = painelEm(await carregarSeries(db), await carregarBase(db), Date.now());
      assert.equal(agora.length, painel.produtos.length, quando);
      for (const p of painel.produtos) {
        const t = agora.find((x) => x.produto.id === p.produto.id)!;
        quase(t.resultado.custoUnitario, p.resultado.custoUnitario, `${quando}: ${p.produto.nome}`);
        p.canais.forEach((c, i) => quase(t.canais[i].margemPct, c.margemPct, `${quando}: ${p.produto.nome} canal ${c.canalId}`));
      }
      assert.deepEqual(await receitasDivergentes(db), [], `${quando}: última versão = tabelas`);
    };

    // 0) Seed: 1 versão por produto, sem autor, vigente desde a criação. Consistente com o painel.
    for (let id = 1; id <= PRODUTOS_INICIAIS.length; id++) {
      const [v, ...resto] = await versoes(id);
      assert.equal(resto.length, 0); assert.equal(v.alterado_por, null);
    }
    await consistente("seed");
    const custosSeed = (await carregarPainel(db)).produtos.map((p) => p.resultado.custoUnitario);

    // 1) Dez saves da Carol no Redvelvet (id 2), cada um numa transação: viram UMA versão nova.
    const linhas2 = await q<{ id: number; insumo_id: number }>("select id, insumo_id from receita_linhas where produto_id = 2 order by ordem");
    const campos = (rendimento: string) => ({ nome: "Brownie Redvelvet", rendimento, minutosPreparo: "30", minutosAcabamentoUn: "1" });
    assert.deepEqual(await salvarProduto(1, 2, campos("10")), OK);
    const [, aberta] = await versoes(2);
    assert.deepEqual(await salvarCustoProduto(1, 2, { minutosForno: "40", perdaPct: "0" }), OK);
    assert.deepEqual(await salvarCustoProduto(1, 2, { minutosForno: "45", perdaPct: "5" }), OK);
    assert.deepEqual(await salvarCustoProduto(1, 2, { minutosForno: "45", perdaPct: "5", semForno: false }), OK);
    assert.deepEqual(await salvarLinha(1, linhas2[0].id, { insumoId: linhas2[0].insumo_id, qtd: "140" }), OK);
    assert.deepEqual(await salvarLinha(1, linhas2[1].id, { insumoId: linhas2[1].insumo_id, qtd: "280" }), OK);
    assert.deepEqual(await criarLinha(1, 2), OK);
    const [nova] = await q<{ id: number }>("select id from receita_linhas where produto_id = 2 order by id desc limit 1");
    assert.deepEqual(await salvarLinha(1, nova.id, { insumoId: idInsumo("Farinha"), qtd: "10" }), OK);
    assert.deepEqual(await removerLinha(1, nova.id), OK);
    assert.deepEqual(await salvarProduto(1, 2, campos("11")), OK);
    let v2 = await versoes(2);
    assert.equal(v2.length, 2, "10 saves na mesma sessão = 1 versão");
    assert.equal(v2[1].alterado_por, 1);
    assert.equal(v2[1].vigente_desde.getTime(), aberta.vigente_desde.getTime(), "atualizar a versão não muda vigente_desde (chave do alerta estável)");
    assert.ok(v2[1].atualizado_em !== null);
    assert.equal(v2[1].receita.rendimento, 11); assert.equal(v2[1].receita.perdaPct, 5);

    // 2) Outro usuário: versão nova.
    assert.deepEqual(await salvarCustoProduto(2, 2, { minutosForno: "45", perdaPct: "7" }), OK);
    v2 = await versoes(2);
    assert.deepEqual(v2.map((v) => v.alterado_por), [null, 1, 2]);

    // 3) 11 minutos depois, o mesmo usuário: versão nova.
    await passar(2, 11);
    assert.deepEqual(await salvarCustoProduto(2, 2, { minutosForno: "45", perdaPct: "8" }), OK);
    assert.equal((await versoes(2)).length, 4);

    // 4) Mudou e voltou atrás (perda 8 → 7, igual à versão anterior): a versão aberta é apagada.
    assert.deepEqual(await salvarCustoProduto(2, 2, { minutosForno: "45", perdaPct: "7" }), OK);
    v2 = await versoes(2);
    assert.equal(v2.length, 3); assert.equal(v2[2].receita.perdaPct, 7);

    // 5) Save idêntico: nada acontece (nem atualizado_em).
    assert.deepEqual(await salvarCustoProduto(2, 2, { minutosForno: "45", perdaPct: "7" }), OK);
    assert.deepEqual(await versoes(2), v2);

    // 6) Duplicar: o produto novo nasce com UMA versão, da Carol, igual à receita do original (com sem_forno).
    await salvarCustoProduto(2, 2, { minutosForno: "45", perdaPct: "7", semForno: true });
    assert.deepEqual(await duplicarProduto(1, 2), OK);
    const [{ id: copia }] = await q<{ id: number }>("select max(id) as id from produtos");
    const vc = await versoes(copia);
    assert.equal(vc.length, 1); assert.equal(vc[0].alterado_por, 1);
    assert.deepEqual(vc[0].receita, (await versoes(2)).at(-1)!.receita);
    assert.equal(vc[0].receita.semForno, true);

    // 7) Deletar produto (sem vendas) em cascade: triggers das linhas não quebram; versões somem.
    assert.deepEqual(await removerProduto(1, copia), OK);
    assert.equal((await versoes(copia)).length, 0);

    // 8) Cacau 70% do Tradicional (id 1): 135 → 150 g. Antes de T vale 135, depois 150, e o alerta traz o diff.
    // Feira com preço que deixa a margem em 50,5%: 15 g × R$ 30/500 g ÷ 12 = +0,075/un derruba abaixo de 50%.
    const painel0 = await carregarPainel(db);
    const feira = painel0.canais.find((c) => c.nome === "Feira")!;
    const naFeira = (painel: typeof painel0, id: number) => painel.produtos.find((p) => p.produto.id === id)!.canais.find((c) => c.canalId === feira.id)!;
    const precoNaMeta = (id: number) => {
      const p = painel0.produtos.find((x) => x.produto.id === id)!;
      const c = naFeira(painel0, id);
      const semCusto = c.margemPct / 100 + p.resultado.custoUnitario / c.preco; // 1 − taxa − imposto
      return (p.resultado.custoUnitario / (semCusto - 0.505)).toFixed(4).replace(".", ",");
    };
    assert.deepEqual(await salvarPrecoCanal(1, 1, feira.id, precoNaMeta(1)), OK);
    const c0 = painel0.produtos[0].resultado.custoUnitario;
    const [linhaCacau] = await q<{ id: number }>(`select id from receita_linhas where produto_id = 1 and insumo_id = ${idInsumo("Cacau 70%")}`);
    assert.deepEqual(await salvarLinha(1, linhaCacau.id, { insumoId: idInsumo("Cacau 70%"), qtd: "150" }), OK);
    const T = (await versoes(1)).at(-1)!.vigente_desde.getTime();
    const series = await carregarSeries(db), base = await carregarBase(db);
    quase(painelEm(series, base, T - 1)[0].resultado.custoUnitario, c0, "antes de T: 135 g");
    quase(painelEm(series, base, T)[0].resultado.custoUnitario, c0 + 0.075, "depois de T: 150 g");
    const alerta = (await carregarAlertas()).find((a) => a.produtoId === 1 && a.canalId === feira.id)!;
    assert.ok(alerta, "a mudança na receita derrubou a Feira abaixo da meta");
    assert.ok(alerta.de >= 50 && alerta.para < 50);
    const causa = alerta.causas.find((c) => c.tipo === "receita")!;
    assert.deepEqual([causa.nome, causa.alteradoPor, causa.preenchimento, causa.mudancas], ["Brownie Tradicional", "Carol", false,
      [{ campo: "ingrediente", insumoId: idInsumo("Cacau 70%"), nome: "Cacau 70%", unidade: "g", de: 135, para: 150 }]]);
    quase(causa.de!, c0); quase(causa.para, c0 + 0.075);
    const hp = (await carregarHistoricoProduto(1))!;
    assert.ok(hp.pontos.at(-1)!.causas.some((c) => c.tipo === "receita"));
    const hr = (await carregarHistoricoReceita(1))!;
    assert.equal(hr.length, 2);
    assert.deepEqual(hr[0].mudancas, causa.mudancas); quase(hr[0].custoUn, c0 + 0.075); assert.equal(hr[0].alteradoPor, "Carol");
    quase(hr[0].custoAntes!, c0, "custoAntes: receita anterior com os preços do mesmo T (só o efeito da receita)");
    assert.equal(hr[1].custoAntes, null, "linha de base");
    assert.deepEqual(hr[1].mudancas, []); quase(hr[1].custoUn, custosSeed[0], "linha de base com os preços da época");
    assert.ok(hr[1].linhas.some((l) => l.nome === "Cacau 70%" && l.qtd === 135 && l.unidade === "g"));
    assert.equal(await carregarHistoricoReceita(99999), null);

    // 9) Preencher os minutos de forno do Cookie (id 3): 0 → 40 sobe o custo (40 × 0,20 ÷ 12 = +0,67/un) e
    // cruzaria a meta, mas é preenchimento: não alerta.
    assert.deepEqual(await salvarPrecoCanal(2, 3, feira.id, precoNaMeta(3)), OK);
    assert.deepEqual(await salvarCustoProduto(2, 3, { minutosForno: "40", perdaPct: "0" }), OK);
    assert.ok(naFeira(await carregarPainel(db), 3).margemPct < 50, "sem a regra, alertaria");
    assert.ok(!(await carregarAlertas()).some((a) => a.produtoId === 3), "preencher não é mudar");
    const [preencheu] = (await carregarHistoricoReceita(3))!;
    assert.equal(preencheu.preenchimento, true);
    assert.deepEqual(preencheu.mudancas, [{ campo: "minutosForno", de: 0, para: 40 }]);

    // 10) Pacote do Cacau teste: 500 g a R$ 20 → 1 kg a R$ 38, na mesma sessão: UM registro novo, sem degrau falso.
    assert.deepEqual(await salvarInsumo(1, cacauTeste, { nome: "Cacau teste", embalagem: "Pacote 1kg", qtd: "1000", unidade: "g" }), OK);
    assert.deepEqual(await salvarPrecoInsumo(1, cacauTeste, "38"), { ok: true, mudou: true });
    const precosTeste = () => q<{ preco: string; qtd_embalagem: string; origem: string; alterado_por: number | null }>(
      `select preco, qtd_embalagem, origem, alterado_por from insumo_precos where insumo_id = ${cacauTeste} order by vigente_desde, id`);
    assert.deepEqual((await precosTeste()).map((r) => [Number(r.preco), Number(r.qtd_embalagem), r.origem, r.alterado_por]), [
      [20, 500, "preco", null], [38, 1000, "embalagem", 1],
    ]);
    const hi = (await carregarHistoricoInsumo(cacauTeste))!;
    assert.deepEqual(hi.pontos.map((p) => [p.preco, p.qtdEmbalagem]), [[20, 500], [38, 1000]], "nunca R$ 20 por 1 kg");
    quase(hi.pontos[0].precoPorUnidade, 0.04); quase(hi.pontos[1].precoPorUnidade, 0.038);
    // Outro autor, ou mais de 10 min depois: não junta.
    assert.deepEqual(await salvarInsumo(2, cacauTeste, { nome: "Cacau teste", embalagem: "Pacote 500g", qtd: "500", unidade: "g" }), OK);
    assert.deepEqual(await salvarPrecoInsumo(1, cacauTeste, "21"), { ok: true, mudou: true });
    assert.deepEqual(await salvarInsumo(1, cacauTeste, { nome: "Cacau teste", embalagem: "Pacote 1kg", qtd: "1000", unidade: "g" }), OK);
    await pg.exec(`update insumo_precos set vigente_desde = vigente_desde - interval '11 minutes' where insumo_id = ${cacauTeste}`);
    assert.deepEqual(await salvarPrecoInsumo(1, cacauTeste, "40"), { ok: true, mudou: true });
    assert.deepEqual((await precosTeste()).slice(2).map((r) => [Number(r.preco), Number(r.qtd_embalagem), r.origem, r.alterado_por]), [
      [38, 500, "embalagem", 2], [21, 500, "preco", 1], [21, 1000, "embalagem", 1], [40, 1000, "preco", 1],
    ]);
    assert.deepEqual(await salvarPrecoInsumo(1, cacauTeste, "40"), { ok: true, mudou: false }, "mesmo preço: nada");

    // 11) Remover insumo: em uso hoje recusa; com história arquiva (preços ficam); sem história apaga.
    assert.equal((await removerInsumo(idInsumo("Cacau 70%"))).ok, false);
    const cookie = idInsumo("Cookie Bauducco");
    const [linhaCookie] = await q<{ id: number }>(`select id from receita_linhas where insumo_id = ${cookie}`);
    assert.deepEqual(await removerLinha(1, linhaCookie.id), OK);
    assert.deepEqual(await removerInsumo(cookie), OK);
    assert.deepEqual(await q(`select ativo from insumos where id = ${cookie}`), [{ ativo: false }]);
    assert.equal((await q(`select 1 from insumo_precos where insumo_id = ${cookie}`)).length, 1);
    assert.ok(!(await carregarPainel(db)).insumos.some((i) => i.id === cookie), "arquivado sai do catálogo");
    const hc = (await carregarHistoricoReceita(3))!;
    assert.ok(hc[hc.length - 1].linhas.some((l) => l.nome === "Cookie Bauducco"), "a receita antiga ainda mostra o nome");
    assert.deepEqual(await removerInsumo(cacauTeste), OK);
    assert.equal((await q(`select 1 from insumos where id = ${cacauTeste}`)).length, 0, "sem história: apaga");

    // 12) Consistência depois da sequência de edições.
    await consistente("depois das edições");

    // 13) O check do db:verify pega uma edição que escapou do trigger.
    await pg.exec(`alter table receita_linhas disable trigger receita_linhas_versao;
      update receita_linhas set qtd = qtd + 1 where id = ${linhaCacau.id};
      alter table receita_linhas enable trigger receita_linhas_versao;`);
    assert.deepEqual(await receitasDivergentes(db), [{ produtoId: 1, nome: "Brownie Tradicional", motivo: "última versão difere das tabelas" }]);

    // 14) O backup leva receita_versoes, com a foto como objeto.
    const arquivo = await backup(async (consulta) => (await pg.query<Record<string, unknown>>(consulta)).rows, dir);
    const dump = JSON.parse(await readFile(arquivo, "utf8"));
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from receita_versoes");
    assert.equal(dump.tabelas.receita_versoes.length, n);
    assert.equal(typeof dump.tabelas.receita_versoes[0].receita, "object");
    assert.ok(dump.tabelas.insumo_precos.every((r: { qtd_embalagem: unknown }) => r.qtd_embalagem !== null));
  } finally {
    cache._db = anterior;
    await pg.close();
    await rm(dir, { recursive: true, force: true });
  }
});
