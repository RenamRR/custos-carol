"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function BarraNavegacao() {
  const pathname = usePathname();

  const inicioAtivo = pathname === "/";
  const produtosAtivo = pathname === "/produtos" || pathname.startsWith("/produtos/");
  const venderAtivo = pathname === "/vender" || pathname.startsWith("/vender/");
  const insumosAtivo = pathname === "/insumos" || pathname.startsWith("/insumos/");
  const maisAtivo = pathname === "/mais" || pathname.startsWith("/mais/");

  return (
    <div className="bottom-nav-wrap">
      <nav className="bottom-nav" aria-label="Navegação principal">
        <Link
          href="/"
          className={`nav-link${inicioAtivo ? " is-active" : ""}`}
          aria-current={inicioAtivo ? "page" : undefined}
        >
          <span className="nav-icon-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
            </svg>
          </span>
          <span>Início</span>
        </Link>

        <Link
          href="/produtos"
          className={`nav-link${produtosAtivo ? " is-active" : ""}`}
          aria-current={produtosAtivo ? "page" : undefined}
        >
          <span className="nav-icon-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="8" height="7" rx="2" />
              <rect x="13" y="4" width="8" height="7" rx="2" />
              <rect x="3" y="13" width="8" height="7" rx="2" />
              <rect x="13" y="13" width="8" height="7" rx="2" />
            </svg>
          </span>
          <span>Produtos</span>
        </Link>

        <Link
          href="/vender"
          className={`nav-sell${venderAtivo ? " is-active" : ""}`}
          aria-current={venderAtivo ? "page" : undefined}
        >
          <span className="nav-sell-fab">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 7h12l1 13H5L6 7Z" />
              <path d="M9 7a3 3 0 0 1 6 0" />
            </svg>
          </span>
          <span>Vender</span>
        </Link>

        <Link
          href="/insumos"
          className={`nav-link${insumosAtivo ? " is-active" : ""}`}
          aria-current={insumosAtivo ? "page" : undefined}
        >
          <span className="nav-icon-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16" />
              <path d="M6 7v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
              <path d="M9 7V5a3 3 0 0 1 6 0v2" />
            </svg>
          </span>
          <span>Insumos</span>
        </Link>

        <Link
          href="/mais"
          className={`nav-link${maisAtivo ? " is-active" : ""}`}
          aria-current={maisAtivo ? "page" : undefined}
        >
          <span className="nav-icon-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="6" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="18" cy="12" r="1.6" />
            </svg>
          </span>
          <span>Mais</span>
        </Link>
      </nav>
    </div>
  );
}
