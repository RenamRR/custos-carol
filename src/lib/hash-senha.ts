import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashSenha } from "./senhas";

async function lerSenha(): Promise<string> {
  if (process.stdin.isTTY) {
    process.stderr.write("Senha (mínimo 12 caracteres; entrada oculta): ");
    // Readline trata edição/PowerShell e restaura o terminal; a saída muda suprime o eco.
    const mudo = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const leitor = createInterface({ input: process.stdin, output: mudo, terminal: true });
    return new Promise((resolve, reject) => {
      let terminou = false;
      leitor.once("line", (linha) => {
        terminou = true;
        leitor.close();
        process.stderr.write("\n");
        resolve(linha);
      });
      leitor.once("SIGINT", () => leitor.close());
      leitor.once("close", () => {
        if (!terminou) reject(new Error("Entrada cancelada."));
      });
    });
  }
  if (process.platform === "win32") {
    console.error("No PowerShell 5.1, use o modo interativo (npm run hash-senha): pipes podem converter acentos para ASCII.");
  }
  const partes: Buffer[] = [];
  let tamanho = 0;
  for await (const parte of process.stdin) {
    const buffer = Buffer.from(parte);
    tamanho += buffer.length;
    if (tamanho > 1026) throw new Error("Entrada excede o limite de senha.");
    partes.push(buffer);
  }
  const senha = Buffer.concat(partes).toString("utf8").replace(/\r?\n$/, "");
  if (/[\r\n]/.test(senha)) throw new Error("Informe somente uma linha de senha.");
  return senha;
}

async function main() {
  if (process.argv.length > 3) throw new Error("Uso: npm run hash-senha (stdin) ou -- <senha>.");
  let senha: string;
  if (process.argv[2] !== undefined) {
    console.error("Aviso: senha em argv pode ficar no histórico do shell e na lista de processos. Prefira stdin.");
    senha = process.argv[2];
  } else {
    senha = await lerSenha();
  }
  console.log(await hashSenha(senha));
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : "Não foi possível gerar o hash.");
  process.exitCode = 1;
});
