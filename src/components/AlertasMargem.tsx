"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dispensarAlerta } from "@/app/actions";
import type { AlertaMargem } from "@/lib/linha-do-tempo";
import { descreverCausasNoInstante, formatarPctBR } from "./formatarMudancas";
import { useSalvar } from "./useSalvar";

export function AlertasMargem({ alertas }: { alertas: AlertaMargem[] }) {
  const router = useRouter();
  const { pendente, erro, limparErro, salvar } = useSalvar();
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [dispensadosLocais, setDispensadosLocais] = useState<string[]>([]);

  const visiveis = alertas.filter((a) => !dispensadosLocais.includes(a.chave));
  if (visiveis.length === 0) return null;

  const limiteInicial = 3;
  const exibidos = mostrarTodos ? visiveis : visiveis.slice(0, limiteInicial);
  const ocultos = visiveis.length - exibidos.length;

  function aoDispensar(chave: string) {
    limparErro();
    salvar(
      () => dispensarAlerta(chave),
      () => {
        setDispensadosLocais((prev) => (prev.includes(chave) ? prev : [...prev, chave]));
        router.refresh();
      },
    );
  }

  return (
    <section aria-label="Alertas de margem">
      <div className="section-row" style={{ marginBottom: 8 }}>
        <h2 className="section-heading">Alertas de margem</h2>
        <span className="badge badge--crit tnum">
          {visiveis.length} {visiveis.length === 1 ? "alerta" : "alertas"}
        </span>
      </div>

      {erro && (
        <div className="banner-erro" role="alert" style={{ marginBottom: 8 }}>
          {erro}
        </div>
      )}

      <div className="alerts-stack">
        {exibidos.map((alerta) => {
          const critica = alerta.para < alerta.meta - 8 || alerta.para < 25;
          return (
            <article
              key={alerta.chave}
              className={`alert-card ${critica ? "alert-card--crit" : "alert-card--warn"}`}
            >
              <div className="alert-top">
                <span className="alert-title">
                  {alerta.produto} · {alerta.canal}
                </span>
                <span className={`badge tnum ${critica ? "badge--crit" : "badge--warn"}`}>
                  Meta {formatarPctBR(alerta.meta, 1)}
                </span>
              </div>

              <p className="alert-msg tnum">
                Margem caiu de {formatarPctBR(alerta.de, 1)} para {formatarPctBR(alerta.para, 1)} (meta{" "}
                {formatarPctBR(alerta.meta, 1)}).
              </p>

              <p className="alert-causa tnum">
                Depois de: {descreverCausasNoInstante(alerta.causas, alerta.instante)}.
              </p>

              <div className="alert-actions">
                <Link href={`/produtos/${alerta.produtoId}`} className="btn btn-soft">
                  Ver produto
                </Link>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={pendente}
                  onClick={() => aoDispensar(alerta.chave)}
                >
                  Entendi
                </button>
              </div>
            </article>
          );
        })}

        {visiveis.length > limiteInicial && (
          <button
            type="button"
            className="btn btn-soft btn-full"
            style={{ minHeight: 44, fontSize: 14 }}
            onClick={() => setMostrarTodos((v) => !v)}
          >
            {mostrarTodos
              ? "Mostrar apenas os 3 principais"
              : `Ver todos os ${visiveis.length} alertas (+${ocultos})`}
          </button>
        )}
      </div>
    </section>
  );
}
