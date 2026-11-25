/**
 * Aplica os arquivos .sql de `drizzle/` em ordem, cada um numa transação, e registra
 * o que já foi aplicado em `_migracoes`.
 * `npm run db:migrate`
 *
 * Existe para não depender de `psql` instalado na máquina — o SQL roda pelo mesmo
 * driver que a aplicação usa. O registro importa: migrações que alteram schema
 * (drop de coluna, migração de dados) não são idempotentes e não podem rodar duas vezes.
 */
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const DIR = path.join(process.cwd(), "drizzle");

/** Quantas cópias manter em BACKUP_DIR; as mais antigas são apagadas. */
const MANTER_BACKUPS = 30;

/**
 * Cópia completa das tabelas em JSON, antes de qualquer migração. Só roda quando
 * BACKUP_DIR está definido (no Dokploy aponta para um volume). Se a cópia falhar,
 * a migração não roda: migrar dado real sem cópia é o risco que isto existe para evitar.
 */
async function backup(sql: postgres.Sql, dir: string) {
  const tabelas = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name`;
  const dump: { geradoEm: string; tabelas: Record<string, readonly unknown[]> } = {
    geradoEm: new Date().toISOString(),
    tabelas: {},
  };
  for (const { table_name } of tabelas) {
    dump.tabelas[table_name] = await sql`select * from ${sql(table_name)}`;
  }

  await mkdir(dir, { recursive: true });
  const nome = `backup-${dump.geradoEm.replace(/[:.]/g, "-")}.json`;
  await writeFile(path.join(dir, nome), JSON.stringify(dump));
  const resumo = Object.entries(dump.tabelas).map(([t, l]) => `${t}=${l.length}`).join(" ");
  console.log(`backup: ${nome} (${resumo})`);

  const antigos = (await readdir(dir)).filter((f) => /^backup-.*\.json$/.test(f)).sort();
  for (const f of antigos.slice(0, Math.max(0, antigos.length - MANTER_BACKUPS))) {
    await unlink(path.join(dir, f));
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não definida.");
    process.exit(1);
  }

  const arquivos = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  if (arquivos.length === 0) {
    console.log("Nenhum .sql em drizzle/.");
    return;
  }

  // `create ... if not exists` emite NOTICE para cada objeto que já existe; sem isso
  // a saída de uma migração idempotente vira parede de ruído.
  const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });

  try {
    const dirBackup = process.env.BACKUP_DIR;
    if (dirBackup) await backup(sql, dirBackup);

    await sql`
      create table if not exists _migracoes (
        arquivo     text primary key,
        aplicado_em timestamptz not null default now()
      )
    `;

    const jaAplicadas = new Set(
      (await sql<{ arquivo: string }[]>`select arquivo from _migracoes`).map((r) => r.arquivo),
    );

    let aplicadas = 0;
    for (const arquivo of arquivos) {
      if (jaAplicadas.has(arquivo)) {
        console.log(`pulando (já aplicada): ${arquivo}`);
        continue;
      }
      const conteudo = await readFile(path.join(DIR, arquivo), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(conteudo);
        await tx`insert into _migracoes (arquivo) values (${arquivo})`;
      });
      console.log(`aplicado: ${arquivo}`);
      aplicadas += 1;
    }

    console.log(
      aplicadas === 0 ? "\nNada a aplicar." : `\n${aplicadas} migração(ões) aplicada(s).`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
