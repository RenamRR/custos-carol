import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const FORMATO = /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/;
export const normalizarLogin = (login: string): string => login.trim().toLowerCase();
export const hashSenhaValido = (hash: string): boolean => FORMATO.test(hash);

function derivar(senha: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha, Buffer.from(salt, "hex"), 64, { N: 16384, r: 8, p: 1 }, (err, hash) => {
      if (err) reject(err);
      else resolve(hash);
    });
  });
}

export async function hashSenha(senha: string): Promise<string> {
  if (Array.from(senha).length < 12 || Buffer.byteLength(senha, "utf8") > 1024) {
    throw new Error("Senha deve ter pelo menos 12 caracteres e no máximo 1024 bytes.");
  }
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${(await derivar(senha, salt)).toString("hex")}`;
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  if (!hashSenhaValido(hash) || Buffer.byteLength(senha, "utf8") > 1024) return false;
  const [, salt, esperado] = hash.split(":");
  return timingSafeEqual(await derivar(senha, salt), Buffer.from(esperado, "hex"));
}
