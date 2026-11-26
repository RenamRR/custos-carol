"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { autenticarCredenciais, COOKIE_SESSAO, ERRO_LOGIN, OPCOES_COOKIE, revogarSessao } from "@/lib/auth";

export async function entrar(_estado: unknown, form: FormData): Promise<{ erro?: string }> {
  const login = form.get("login");
  const senha = form.get("senha");
  if (typeof login !== "string" || typeof senha !== "string") return { erro: ERRO_LOGIN };
  const jar = await cookies();
  const sessao = await autenticarCredenciais(login, senha, jar.get(COOKIE_SESSAO)?.value);
  if (!sessao) return { erro: ERRO_LOGIN };
  jar.set(COOKIE_SESSAO, sessao.token, { ...OPCOES_COOKIE, expires: sessao.expiraEm });
  redirect("/");
}

export async function sair(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) await revogarSessao(token);
  jar.set(COOKIE_SESSAO, "", { ...OPCOES_COOKIE, maxAge: 0, expires: new Date(0) });
  redirect("/entrar");
}
