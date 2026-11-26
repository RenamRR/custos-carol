import "server-only";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { sessoes, usuarios } from "../db/schema";
import { normalizarLogin, verificarSenha } from "./senhas";

export interface Usuario { id: number; login: string; nome: string }

export const COOKIE_SESSAO = "carol_sessao";
export const ERRO_LOGIN = "usuário ou senha incorretos";
export const OPCOES_COOKIE = {
  httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 30 * 24 * 60 * 60,
};
const TOKEN_VALIDO = /^[a-f0-9]{64}$/;
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

// Hash fictício, nunca associado a usuário; todos os caminhos de recusa fazem um scrypt.
const HASH_FICTICIO = `scrypt:${"00".repeat(16)}:${"00".repeat(64)}`;
async function recusar(senha: string): Promise<null> {
  await verificarSenha(senha, HASH_FICTICIO);
  return null;
}

/** Interno ao servidor; recebe DB explicitamente para ensaios isolados, sem rede. */
export async function autenticarCredenciais(
  loginInformado: string, senha: string, tokenAnterior?: string, db = getDb(),
): Promise<{ token: string; expiraEm: Date } | null> {
  const login = normalizarLogin(loginInformado);
  if (!login || login.length > 100 || !senha || Buffer.byteLength(senha, "utf8") > 1024) {
    return recusar("");
  }
  return db.transaction(async (tx) => {
    // ADR-001: a trava serializa inclusive verificações concorrentes da mesma conta.
    const [usuario] = await tx.select({
      id: usuarios.id, senhaHash: usuarios.senhaHash, ativo: usuarios.ativo,
      bloqueado: sql<boolean>`coalesce(${usuarios.bloqueadoAte} > now(), false)`,
    }).from(usuarios).where(eq(usuarios.login, login)).for("update");
    if (!usuario) {
      await recusar(senha);
      // Aproxima o trabalho do caminho de erro, sem criar nem tocar contas reais.
      await tx.update(usuarios).set({ falhasLogin: sql`${usuarios.falhasLogin}` }).where(sql`false`);
      return null;
    }
    if (usuario.bloqueado) return recusar(senha);
    const correta = await verificarSenha(senha, usuario.senhaHash);
    if (!correta || !usuario.ativo) {
      await tx.update(usuarios).set({
        falhasLogin: sql`case when ${usuarios.falhasLogin} + 1 >= 5 then 0 else ${usuarios.falhasLogin} + 1 end`,
        bloqueadoAte: sql`case when ${usuarios.falhasLogin} + 1 >= 5 then now() + interval '5 minutes' else null end`,
      }).where(eq(usuarios.id, usuario.id));
      return null;
    }
    await tx.update(usuarios).set({ falhasLogin: 0, bloqueadoAte: null }).where(eq(usuarios.id, usuario.id));
    await tx.delete(sessoes).where(lt(sessoes.expiraEm, sql`now()`));
    const token = randomBytes(32).toString("hex");
    const [sessao] = await tx.insert(sessoes).values({
      id: hashToken(token), usuarioId: usuario.id, expiraEm: sql`now() + interval '30 days'`,
    }).returning({ expiraEm: sessoes.expiraEm });
    if (tokenAnterior && TOKEN_VALIDO.test(tokenAnterior)) {
      await tx.delete(sessoes).where(eq(sessoes.id, hashToken(tokenAnterior)));
    }
    return { token, expiraEm: sessao.expiraEm };
  });
}

export async function usuarioDaSessao(token: string, db = getDb()): Promise<Usuario | null> {
  if (!TOKEN_VALIDO.test(token)) return null;
  const [usuario] = await db.select({ id: usuarios.id, login: usuarios.login, nome: usuarios.nome })
    .from(sessoes).innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
    .where(and(eq(sessoes.id, hashToken(token)), gt(sessoes.expiraEm, sql`now()`), eq(usuarios.ativo, true)))
    .limit(1);
  return usuario ?? null;
}

export async function revogarSessao(token: string, db = getDb()): Promise<void> {
  if (TOKEN_VALIDO.test(token)) await db.delete(sessoes).where(eq(sessoes.id, hashToken(token)));
}

export const usuarioAtual = cache(async (): Promise<Usuario | null> => {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  return token ? usuarioDaSessao(token) : null;
});

export async function exigirUsuario(): Promise<Usuario> {
  const usuario = await usuarioAtual();
  if (!usuario) {
    const { redirect } = await import("next/navigation");
    return redirect("/entrar");
  }
  return usuario;
}
