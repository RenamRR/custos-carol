"use client";

import { useActionState, useState } from "react";
import { entrar } from "@/app/entrar/actions";

const INICIAL: { erro?: string } = {};

export function FormEntrar() {
  const [estado, acao, pendente] = useActionState(entrar, INICIAL);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-hero">
          <div className="login-logo-frame">
            <img
              src="/logo-carol.jpeg"
              alt="Logo Carol Brownie"
              width={120}
              height={120}
            />
          </div>
          <h1 className="login-title">Acesse a cozinha</h1>
          <p className="login-sub">
            Entre com seu usuário e senha para abrir receitas, custos e insumos.
          </p>
        </div>

        <form action={acao} className="login-card">
          <div className="field-group">
            <label className="field-label" htmlFor="login">
              Usuário
            </label>
            <input
              id="login"
              name="login"
              type="text"
              className="field-input"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="senha">
              Senha
            </label>
            <div className="pass-wrap">
              <input
                id="senha"
                name="senha"
                type={mostrarSenha ? "text" : "password"}
                className="field-input"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="pass-toggle"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-pressed={mostrarSenha}
              >
                {mostrarSenha ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          {estado?.erro && (
            <div className="banner-erro" role="alert">
              {estado.erro}
            </div>
          )}

          <button type="submit" className="btn btn-choco btn-full" disabled={pendente}>
            {pendente ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="login-foot">
          <span style={{ color: "var(--heart)" }} aria-hidden="true">
            &#10084;
          </span>{" "}
          Carol Brownie · cada alteração de preço fica registrada
        </p>
      </div>
    </div>
  );
}
