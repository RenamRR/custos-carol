import { brl, nivelMargem, type ResultadoProduto } from "@/lib/calc";

const RAMPA = ["--r1", "--r2", "--r3", "--r4", "--r5", "--r6"];

export function corDoSegmento(tipo: string, indiceIngrediente: number): string {
  if (tipo === "embalagem") return "var(--r-pack)";
  if (tipo === "mao-de-obra") return "var(--r-labor)";
  if (tipo === "forno") return "var(--r-oven)";
  if (tipo === "perda") return "var(--r-loss)";
  return `var(${RAMPA[Math.min(indiceIngrediente, RAMPA.length - 1)]})`;
}

const ROTULO_NIVEL = {
  good: "Boa",
  warn: "Atenção",
  crit: "Baixa",
} as const;

export function BadgeMargem({
  margemPct,
  mostrarNivel = true,
}: {
  margemPct: number;
  mostrarNivel?: boolean;
}) {
  const nivel = nivelMargem(margemPct);
  const classe =
    nivel === "good" ? "badge--good" : nivel === "warn" ? "badge--warn" : "badge--crit";

  return (
    <span className={`badge ${classe} tnum`}>
      {margemPct.toFixed(0)}%
      {mostrarNivel ? ` · ${ROTULO_NIVEL[nivel]}` : " margem"}
    </span>
  );
}

export function BarraCusto({ resultado }: { resultado: ResultadoProduto }) {
  const segmentos = resultado.segmentos
    .filter((s) => s.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  if (segmentos.length === 0 || resultado.custoTotal <= 0) {
    return <div className="stacked-bar" aria-hidden="true" />;
  }

  let ingredientesUsados = 0;

  return (
    <div className="stacked-bar" role="img" aria-label={`Composição do custo de ${resultado.nome}`}>
      {segmentos.map((s, i) => {
        const pct = (s.valor / resultado.custoTotal) * 100;
        const bg = corDoSegmento(
          s.tipo,
          s.tipo === "ingrediente" ? ingredientesUsados++ : 0,
        );
        return (
          <div
            key={`${s.nome}-${i}`}
            className="stacked-seg"
            style={{ width: `${pct}%`, background: bg }}
            title={`${s.nome} · ${brl(s.valor)} · ${pct.toFixed(0)}%`}
          />
        );
      })}
    </div>
  );
}
