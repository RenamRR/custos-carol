import { brl, formatarMinutos, nivelMargem, type ResultadoProduto } from "@/lib/calc";

const RAMPA = ["--r1", "--r2", "--r3", "--r4", "--r5", "--r6"];

function corDoSegmento(tipo: string, indiceIngrediente: number): string {
  if (tipo === "embalagem") return "var(--r-pack)";
  if (tipo === "mao-de-obra") return "var(--r-labor)";
  return `var(${RAMPA[Math.min(indiceIngrediente, RAMPA.length - 1)]})`;
}

function CardProduto({ r }: { r: ResultadoProduto }) {
  const segmentos = r.segmentos.filter((s) => s.valor > 0).sort((a, b) => b.valor - a.valor);

  const pct = (v: number) => (r.custoTotal > 0 ? (v / r.custoTotal) * 100 : 0);
  const maior = segmentos[0];
  const nivel = nivelMargem(r.margemPct);

  let ingredientesUsados = 0;

  return (
    <article className="card">
      <h2 className="card__name">{r.nome}</h2>

      <div className="card__cost">
        <b>{brl(r.custoUnitario)}</b>
        <span>por unidade</span>
      </div>

      <div className="bar" role="img" aria-label={`Composição do custo de ${r.nome}`}>
        {segmentos.map((s, i) => (
          <i
            key={`${s.nome}-${i}`}
            style={{
              width: `${pct(s.valor)}%`,
              background: corDoSegmento(
                s.tipo,
                s.tipo === "ingrediente" ? ingredientesUsados++ : 0,
              ),
            }}
            title={`${s.nome} · ${brl(s.valor)} · ${pct(s.valor).toFixed(0)}%`}
          />
        ))}
      </div>

      {maior && (
        <p className="card__driver">
          Maior custo: <b>{maior.nome}</b> · {pct(maior.valor).toFixed(0)}% do total
          {r.custoMaoDeObra === 0 && <span className="card__aviso"> · sem mão de obra</span>}
        </p>
      )}

      <div className="card__foot">
        <span className="card__price">Venda {brl(r.precoVenda)}</span>
        <span
          className={`pill pill--${nivel}`}
          title={
            `Sobra ${brl(r.margem)} por unidade.\n` +
            `Custo direto ${brl(r.custoDireto / r.rendimento)}/un (markup ${r.markup.toFixed(2)}x)\n` +
            (r.custoMaoDeObra > 0
              ? `Mão de obra ${brl(r.custoMaoDeObra / r.rendimento)}/un · ${formatarMinutos(r.minutosLote)} por lote`
              : "Mão de obra ainda não entra: defina o custo da hora e os tempos.")
          }
        >
          {r.margemPct.toFixed(0)}% margem
        </span>
      </div>
    </article>
  );
}

export function Resumo({ resultados }: { resultados: ResultadoProduto[] }) {
  if (resultados.length === 0) {
    return (
      <section className="rail" aria-label="Resumo dos produtos">
        <p className="card__driver">Nenhum produto cadastrado ainda.</p>
      </section>
    );
  }

  return (
    <section className="rail" aria-label="Resumo dos produtos">
      {resultados.map((r) => (
        <CardProduto key={r.produtoId} r={r} />
      ))}
    </section>
  );
}
