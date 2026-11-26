import Link from "next/link";
import type { ReactNode } from "react";
import { BarraNavegacao } from "@/components/BarraNavegacao";
import { usuarioAtual } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // O layout não protege navegação — cada página e query exige sessão via exigirUsuario().
  const usuario = await usuarioAtual();

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/" className="app-brand">
          <img
            src="/logo-carol.jpeg"
            alt="Carol Brownie"
            className="app-logo"
            width={44}
            height={44}
          />
          <div>
            <span className="app-kicker">Carol Brownie</span>
            <p className="app-greeting">{usuario ? `Olá, ${usuario.nome}` : "Olá"}</p>
          </div>
        </Link>
      </header>

      <main className="app-main">{children}</main>

      <BarraNavegacao />
    </div>
  );
}
