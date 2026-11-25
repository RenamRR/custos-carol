/**
 * Testa a conexão e reporta o que está faltando. Nunca imprime a connection string.
 * `npm run db:check`
 */
import postgres from "postgres";

function mascarar(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? "***:***@" : ""}${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(connection string em formato inválido)";
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não definida. Copie .env.example para .env.");
    process.exit(1);
  }

  console.log(`Alvo: ${mascarar(url)}`);

  const sql = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 5 });
  try {
    const [{ versao }] = await sql<{ versao: string }[]>`select version() as versao`;
    console.log(`Conectado: ${versao.split(",")[0]}`);

    const tabelas = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `;

    if (tabelas.length === 0) {
      console.log("\nBanco vazio — nenhuma tabela. Rode: npm run db:migrate");
    } else {
      console.log(`\nTabelas (${tabelas.length}): ${tabelas.map((t) => t.table_name).join(", ")}`);
      const temInsumos = tabelas.some((t) => t.table_name === "insumos");
      if (temInsumos) {
        const [{ total }] = await sql<{ total: string }[]>`select count(*)::text as total from insumos`;
        console.log(
          Number(total) === 0
            ? "insumos está vazia — rode: npm run db:seed"
            : `insumos: ${total} registros`,
        );
      }
    }
    await sql.end();
    process.exit(0);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.error(`\nFalhou: ${e.message}`);
    if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN") {
      console.error(
        "\nO host não resolve daqui. Se for um nome de serviço interno do Dokploy\n" +
          "(algo como 'projeto-db-abc123'), ele só existe dentro da rede Docker da VM.\n" +
          "Para rodar migração e seed da sua máquina, use a connection string EXTERNA,\n" +
          "que o Dokploy mostra quando você habilita a porta pública do Postgres.",
      );
    }
    if (e.code === "ECONNREFUSED") {
      console.error("\nHost resolve mas a porta está fechada. Confira a porta e o firewall da VM.");
    }
    if (e.code === "ETIMEDOUT" || e.message.includes("timeout")) {
      console.error("\nTempo esgotado — provavelmente firewall bloqueando a porta.");
    }
    await sql.end({ timeout: 1 }).catch(() => {});
    process.exit(1);
  }
}

void main();
