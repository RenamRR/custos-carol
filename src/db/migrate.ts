/**
 * Aplica os arquivos .sql de `drizzle/` em ordem, cada um numa transação, e registra
 * o que já foi aplicado em `_migracoes`.
 * `npm run db:migrate`
 *
 * Existe para não depender de `psql` instalado na máquina — o SQL roda pelo mesmo
 * driver que a aplicação usa. O registro importa: migrações que alteram schema
 * (drop de coluna, migração de dados) não são idempotentes e não podem rodar duas vezes.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const DIR = path.join(process.cwd(), "drizzle");

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
