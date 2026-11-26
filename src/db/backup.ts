import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

type Consultar = (consulta: string) => Promise<readonly Record<string, unknown>[]>;
const EXCLUIDAS = new Set(["sessoes"]);
const PROJECOES: Record<string, readonly string[]> = {
  usuarios: ["id", "login", "nome", "ativo", "criado_em"],
};
const identificador = (nome: string) => `"${nome.replace(/"/g, '""')}"`;

/** Novas tabelas entram automaticamente; toda tabela sensível nova exige EXCLUIDAS/PROJECOES. */
export async function backup(consultar: Consultar, dir: string): Promise<string> {
  const tabelas = await consultar(`select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`);
  const dump: { geradoEm: string; tabelas: Record<string, readonly Record<string, unknown>[]> } = {
    geradoEm: new Date().toISOString(), tabelas: Object.create(null),
  };
  for (const tabela of tabelas) {
    const nome = String(tabela.table_name);
    if (EXCLUIDAS.has(nome)) continue;
    const colunas = Object.hasOwn(PROJECOES, nome) ? PROJECOES[nome].map(identificador).join(", ") : "*";
    dump.tabelas[nome] = await consultar(`select ${colunas} from public.${identificador(nome)}`);
  }
  await mkdir(dir, { recursive: true });
  const nome = `backup-${dump.geradoEm.replace(/[:.]/g, "-")}.json`;
  const destino = path.join(dir, nome);
  await writeFile(destino, JSON.stringify(dump), { mode: 0o600, flag: "wx" });
  const resumo = Object.entries(dump.tabelas).map(([t, l]) => `${t}=${l.length}`).join(" ");
  console.log(`backup: ${nome} (${resumo})`);
  const antigos = (await readdir(dir)).filter((f) => /^backup-.*\.json$/.test(f)).sort();
  for (const f of antigos.slice(0, Math.max(0, antigos.length - 30))) await unlink(path.join(dir, f));
  return destino;
}
