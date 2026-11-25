import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

// O dev server do Next recarrega os módulos a cada edição; sem cache no globalThis
// cada reload abre um pool novo e o Postgres estoura o limite de conexões.
const cache = globalThis as unknown as { _pgClient?: postgres.Sql; _db?: Db };

/**
 * Conexão preguiçosa de propósito: `next build` importa os módulos de rota para
 * analisá-las, e conectar (ou explodir por falta de DATABASE_URL) em tempo de
 * import quebraria o build. O erro só aparece quando alguém realmente consulta.
 */
export function getDb(): Db {
  if (cache._db) return cache._db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL não definida. Copie .env.example para .env.");
  }

  const client = cache._pgClient ?? postgres(url, { max: 10 });
  const db = drizzle(client, { schema });

  if (process.env.NODE_ENV !== "production") {
    cache._pgClient = client;
    cache._db = db;
  }
  return db;
}

export { schema };
