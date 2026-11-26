"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  {
    href: "/",
    rotulo: "Início",
    ativo: (p: string) => p === "/",
    icone: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
      </svg>
    ),
  },
  {
    href: "/produtos",
    rotulo: "Produtos",
    ativo: (p: string) => p === "/produtos" || p.startsWith("/produtos/"),
    icone: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="8" height="7" rx="2" />
        <rect x="13" y="4" width="8" height="7" rx="2" />
        <rect x="3" y="13" width="8" height="7" rx="2" />
        <rect x="13" y="13" width="8" height="7" rx="2" />
      </svg>
    ),
  },
  {
    href: "/insumos",
    rotulo: "Insumos",
    ativo: (p: string) => p === "/insumos" || p.startsWith("/insumos/"),
    icone: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M6 7v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
        <path d="M9 7V5a3 3 0 0 1 6 0v2" />
      </svg>
    ),
  },
  {
    href: "/mais",
    rotulo: "Mais",
    ativo: (p: string) => p === "/mais" || p.startsWith("/mais/"),
    icone: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="6" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="18" cy="12" r="1.6" />
      </svg>
    ),
  },
] as const;

export function BarraNavegacao() {
  const pathname = usePathname();

  return (
    <div className="bottom-nav-wrap">
      <nav className="bottom-nav" aria-label="Navegação principal">
        {ITENS.map((item) => {
          const ativo = item.ativo(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${ativo ? " is-active" : ""}`}
              aria-current={ativo ? "page" : undefined}
            >
              <span className="nav-icon-pill">{item.icone}</span>
              <span>{item.rotulo}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
