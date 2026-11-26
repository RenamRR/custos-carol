import { brl } from "@/lib/calc";
import { formatarDataCurtaBR } from "./formatarMudancas";

export interface PontoDegrauUnico {
  instante: string;
  valor: number;
}

export interface CanalMetaGrafico {
  id: number;
  nome: string;
  margemAlvoPct: number;
}

export interface PontoProdutoGrafico {
  instante: string;
  custoUn: number | null;
  canais: { canalId: number; preco: number; margemPct: number | null }[];
}

const CORES_CANAIS = ["#1f5e3b", "#d4652f", "#9d6d21", "#5e3a28"];

interface LimitesEixo {
  minY: number;
  maxY: number;
  ticksY: number[];
}

function calcularLimitesY(valores: number[], extras: number[] = []): LimitesEixo {
  const todos = [...valores, ...extras].filter((v) => Number.isFinite(v));
  if (todos.length === 0) return { minY: 0, maxY: 100, ticksY: [0, 50, 100] };

  let min = Math.min(...todos);
  let max = Math.max(...todos);
  if (Math.abs(max - min) < 0.01) {
    const base = Math.max(Math.abs(max) * 0.2, 1);
    min = Math.max(0, min - base);
    max = max + base;
  } else {
    const folga = (max - min) * 0.14;
    min = min >= 0 ? Math.max(0, min - folga) : min - folga;
    max = max + folga;
  }

  const mid = (min + max) / 2;
  return { minY: min, maxY: max, ticksY: [min, mid, max] };
}

function mapearX(
  ms: number,
  minMs: number,
  maxMs: number,
  padL: number,
  larguraPlot: number,
): number {
  if (maxMs <= minMs) return padL + larguraPlot / 2;
  return padL + ((ms - minMs) / (maxMs - minMs)) * larguraPlot;
}

function mapearY(
  valor: number,
  minY: number,
  maxY: number,
  padT: number,
  alturaPlot: number,
): number {
  if (maxY <= minY) return padT + alturaPlot / 2;
  return padT + alturaPlot - ((valor - minY) / (maxY - minY)) * alturaPlot;
}

function construirDegrau(pts: { x: number; y: number }[], xFim?: number): string {
  if (pts.length === 0) return "";
  const cmds: string[] = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`];
  for (let i = 1; i < pts.length; i++) {
    cmds.push(`H ${pts[i].x.toFixed(1)}`);
    cmds.push(`V ${pts[i].y.toFixed(1)}`);
  }
  const ultimo = pts[pts.length - 1];
  if (xFim !== undefined && xFim > ultimo.x) {
    cmds.push(`H ${xFim.toFixed(1)}`);
  }
  return cmds.join(" ");
}

function construirAreaDegrau(
  pts: { x: number; y: number }[],
  baseY: number,
  xFim?: number,
): string {
  if (pts.length === 0) return "";
  const passo = construirDegrau(pts, xFim);
  const fimX = xFim !== undefined && xFim > pts[pts.length - 1].x ? xFim : pts[pts.length - 1].x;
  return `${passo} L ${fimX.toFixed(1)} ${baseY.toFixed(1)} L ${pts[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`;
}

function ticksTempo(minMs: number, maxMs: number, padL: number, larguraPlot: number) {
  const comAno = maxMs - minMs > 150 * 86_400_000;
  const isoInicio = new Date(minMs).toISOString();
  const isoFim = new Date(maxMs).toISOString();
  const rInicio = formatarDataCurtaBR(isoInicio, comAno);
  const rFim = formatarDataCurtaBR(isoFim, comAno);

  const ticks: { x: number; label: string; anchor: "start" | "middle" | "end" }[] = [
    { x: padL, label: rInicio, anchor: "start" },
  ];

  const meioMs = (minMs + maxMs) / 2;
  const rMeio = formatarDataCurtaBR(new Date(meioMs).toISOString(), comAno);
  if (maxMs - minMs > 4 * 86_400_000 && rMeio !== rInicio && rMeio !== rFim) {
    ticks.push({ x: padL + larguraPlot / 2, label: rMeio, anchor: "middle" });
  }

  if (maxMs > minMs) {
    ticks.push({ x: padL + larguraPlot, label: rFim, anchor: "end" });
  }
  return ticks;
}

export function GraficoDegrau({
  pontos,
  formatarY = brl,
  ariaLabel,
  mensagemVazio = "Ainda sem histórico de mudanças neste período.",
}: {
  pontos: PontoDegrauUnico[];
  formatarY?: (valor: number) => string;
  ariaLabel: string;
  mensagemVazio?: string;
}) {
  const validos = pontos
    .map((p) => ({ ...p, ms: new Date(p.instante).getTime() }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.valor))
    .sort((a, b) => a.ms - b.ms);

  if (validos.length <= 1) {
    const unico = validos[0];
    return (
      <div className="chart-empty" role="status">
        <strong>Ainda sem histórico</strong>
        <span>
          {unico
            ? `Valor mantido em ${formatarY(unico.valor)} desde ${formatarDataCurtaBR(unico.instante)}.`
            : mensagemVazio}
        </span>
      </div>
    );
  }

  const W = 344;
  const H = 166;
  const padL = 68;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const minMs = validos[0].ms;
  const maxMs = validos[validos.length - 1].ms;
  const { minY, maxY, ticksY } = calcularLimitesY(validos.map((p) => p.valor));

  const coords = validos.map((p) => ({
    x: mapearX(p.ms, minMs, maxMs, padL, plotW),
    y: mapearY(p.valor, minY, maxY, padT, plotH),
  }));

  const caminho = construirDegrau(coords);
  const area = construirAreaDegrau(coords, padT + plotH);
  const eixoX = ticksTempo(minMs, maxMs, padL, plotW);

  return (
    <svg
      className="chart-svg tnum"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
    >
      {ticksY.map((tick, idx) => {
        const y = mapearY(tick, minY, maxY, padT, plotH);
        return (
          <g key={idx}>
            <line
              x1={padL}
              y1={y}
              x2={padL + plotW}
              y2={y}
              stroke="#e6d6c0"
              strokeWidth="1"
              strokeDasharray={idx === 0 ? undefined : "3 3"}
            />
            <text
              x={padL - 7}
              y={y + 3.5}
              textAnchor="end"
              fontSize="10.5"
              fontWeight="700"
              fill="#6f4e3b"
            >
              {formatarY(tick)}
            </text>
          </g>
        );
      })}

      <path d={area} fill="rgba(223, 157, 45, 0.14)" />
      <path d={caminho} fill="none" stroke="#3b1100" strokeWidth="2.4" strokeLinejoin="round" />

      {coords.map((pt, i) => (
        <circle
          key={i}
          cx={pt.x}
          cy={pt.y}
          r={i === coords.length - 1 ? 4.2 : 3.2}
          fill="#df9d2d"
          stroke="#3b1100"
          strokeWidth="1.6"
        />
      ))}

      {eixoX.map((t, idx) => (
        <text
          key={idx}
          x={t.x}
          y={H - 6}
          textAnchor={t.anchor}
          fontSize="10.5"
          fontWeight="600"
          fill="#6f4e3b"
        >
          {t.label}
        </text>
      ))}
    </svg>
  );
}

export function GraficoCustoEMargem({
  pontos,
  canais,
  nomeProduto,
}: {
  pontos: PontoProdutoGrafico[];
  canais: CanalMetaGrafico[];
  nomeProduto: string;
}) {
  const validos = pontos
    .map((p) => ({ ...p, ms: new Date(p.instante).getTime() }))
    .filter((p) => Number.isFinite(p.ms))
    .sort((a, b) => a.ms - b.ms);

  const custosValidos = validos.filter(
    (p): p is typeof p & { custoUn: number } =>
      typeof p.custoUn === "number" && Number.isFinite(p.custoUn),
  );

  if (validos.length <= 1 || custosValidos.length <= 1) {
    const ultimoCusto = custosValidos[custosValidos.length - 1]?.custoUn;
    return (
      <div className="chart-empty" role="status">
        <strong>Ainda sem histórico</strong>
        <span>
          {ultimoCusto !== undefined
            ? `Custo/un estável em ${brl(ultimoCusto)} neste período.`
            : "Ainda sem mudanças suficientes para desenhar a linha do tempo."}
        </span>
      </div>
    );
  }

  const W = 344;
  const H_CUSTO = 148;
  const H_MARGEM = 166;
  const padL = 62;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotHCusto = H_CUSTO - padT - padB;
  const plotHMargem = H_MARGEM - padT - padB;

  const minMs = validos[0].ms;
  const maxMs = validos[validos.length - 1].ms;
  const eixoX = ticksTempo(minMs, maxMs, padL, plotW);

  const limCusto = calcularLimitesY(custosValidos.map((p) => p.custoUn));
  const coordsCusto = custosValidos.map((p) => ({
    x: mapearX(p.ms, minMs, maxMs, padL, plotW),
    y: mapearY(p.custoUn, limCusto.minY, limCusto.maxY, padT, plotHCusto),
  }));
  const caminhoCusto = construirDegrau(coordsCusto, padL + plotW);

  const todasMargens: number[] = [];
  for (const pt of validos) {
    for (const c of pt.canais) {
      if (typeof c.margemPct === "number" && Number.isFinite(c.margemPct)) {
        todasMargens.push(c.margemPct);
      }
    }
  }
  const metas = canais.map((c) => c.margemAlvoPct).filter((m) => Number.isFinite(m));
  const limMargem = calcularLimitesY(todasMargens, metas);

  const seriesCanais = canais.map((canal, idx) => {
    const cor = CORES_CANAIS[idx % CORES_CANAIS.length];
    const pts = validos
      .map((p) => {
        const achado = p.canais.find((c) => c.canalId === canal.id);
        if (!achado || typeof achado.margemPct !== "number" || !Number.isFinite(achado.margemPct)) {
          return null;
        }
        return {
          x: mapearX(p.ms, minMs, maxMs, padL, plotW),
          y: mapearY(achado.margemPct, limMargem.minY, limMargem.maxY, padT, plotHMargem),
          valor: achado.margemPct,
        };
      })
      .filter((item): item is { x: number; y: number; valor: number } => item !== null);
    return { canal, cor, pts };
  });

  const metasUnicas = [...new Set(metas.map((m) => Math.round(m * 10) / 10))];
  const ultimoCusto = custosValidos[custosValidos.length - 1].custoUn;
  const primeiroCusto = custosValidos[0].custoUn;

  const ariaCusto = `Gráfico de custo unitário de ${nomeProduto} entre ${formatarDataCurtaBR(
    validos[0].instante,
  )} e ${formatarDataCurtaBR(validos[validos.length - 1].instante)}: de ${brl(
    primeiroCusto,
  )} para ${brl(ultimoCusto)}.`;

  const resumoCanais = seriesCanais
    .filter((s) => s.pts.length > 0)
    .map((s) => `${s.canal.nome} atualmente em ${s.pts[s.pts.length - 1].valor.toFixed(0)}%`)
    .join(", ");
  const ariaMargem = `Gráfico de margem por canal de ${nomeProduto} com linha tracejada da meta: ${resumoCanais || "sem margem calculada"}.`;

  return (
    <div className="chart-stack">
      <div>
        <div className="chart-subhead">Custo por unidade (R$)</div>
        <svg className="chart-svg tnum" viewBox={`0 0 ${W} ${H_CUSTO}`} role="img" aria-label={ariaCusto}>
          {limCusto.ticksY.map((tick, idx) => {
            const y = mapearY(tick, limCusto.minY, limCusto.maxY, padT, plotHCusto);
            return (
              <g key={idx}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + plotW}
                  y2={y}
                  stroke="#e6d6c0"
                  strokeWidth="1"
                  strokeDasharray={idx === 0 ? undefined : "3 3"}
                />
                <text
                  x={padL - 7}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10.5"
                  fontWeight="700"
                  fill="#6f4e3b"
                >
                  {brl(tick)}
                </text>
              </g>
            );
          })}
          <path d={caminhoCusto} fill="none" stroke="#3b1100" strokeWidth="2.4" strokeLinejoin="round" />
          {coordsCusto.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={i === coordsCusto.length - 1 ? 4 : 3}
              fill="#df9d2d"
              stroke="#3b1100"
              strokeWidth="1.6"
            />
          ))}
          {eixoX.map((t, idx) => (
            <text
              key={idx}
              x={t.x}
              y={H_CUSTO - 6}
              textAnchor={t.anchor}
              fontSize="10.5"
              fontWeight="600"
              fill="#6f4e3b"
            >
              {t.label}
            </text>
          ))}
        </svg>
      </div>

      {todasMargens.length > 0 && (
        <div>
          <div className="chart-subhead">Margem por canal (%)</div>
          <svg
            className="chart-svg tnum"
            viewBox={`0 0 ${W} ${H_MARGEM}`}
            role="img"
            aria-label={ariaMargem}
          >
            {limMargem.ticksY.map((tick, idx) => {
              const y = mapearY(tick, limMargem.minY, limMargem.maxY, padT, plotHMargem);
              return (
                <g key={idx}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={padL + plotW}
                    y2={y}
                    stroke="#e6d6c0"
                    strokeWidth="1"
                    strokeDasharray={idx === 0 ? undefined : "3 3"}
                  />
                  <text
                    x={padL - 7}
                    y={y + 3.5}
                    textAnchor="end"
                    fontSize="10.5"
                    fontWeight="700"
                    fill="#6f4e3b"
                  >
                    {`${tick.toFixed(0)}%`}
                  </text>
                </g>
              );
            })}

            {metasUnicas.map((meta) => {
              const yMeta = mapearY(meta, limMargem.minY, limMargem.maxY, padT, plotHMargem);
              return (
                <g key={meta}>
                  <line
                    x1={padL}
                    y1={yMeta}
                    x2={padL + plotW}
                    y2={yMeta}
                    stroke="#a80204"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                  />
                  <text
                    x={padL + plotW - 2}
                    y={Math.max(padT + 9, yMeta - 4)}
                    textAnchor="end"
                    fontSize="9.5"
                    fontWeight="800"
                    fill="#a80204"
                  >
                    {`Meta ${meta.toFixed(0)}%`}
                  </text>
                </g>
              );
            })}

            {seriesCanais.map((serie) => {
              if (serie.pts.length === 0) return null;
              const d = construirDegrau(serie.pts, padL + plotW);
              return (
                <g key={serie.canal.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={serie.cor}
                    strokeWidth="2.3"
                    strokeLinejoin="round"
                  />
                  {serie.pts.map((pt, idx) => (
                    <circle
                      key={idx}
                      cx={pt.x}
                      cy={pt.y}
                      r={idx === serie.pts.length - 1 ? 4 : 3}
                      fill={serie.cor}
                      stroke="#fffdf9"
                      strokeWidth="1.3"
                    />
                  ))}
                </g>
              );
            })}

            {eixoX.map((t, idx) => (
              <text
                key={idx}
                x={t.x}
                y={H_MARGEM - 6}
                textAnchor={t.anchor}
                fontSize="10.5"
                fontWeight="600"
                fill="#6f4e3b"
              >
                {t.label}
              </text>
            ))}
          </svg>

          <div className="chart-legend" aria-label="Legenda dos canais e meta">
            {seriesCanais.map((serie) => (
              <span key={serie.canal.id} className="chart-legend-item tnum">
                <span className="chart-swatch" style={{ background: serie.cor }} />
                {serie.canal.nome} (meta {serie.canal.margemAlvoPct.toFixed(0)}%)
              </span>
            ))}
            <span className="chart-legend-item">
              <span className="chart-swatch-dashed" />
              Meta do canal
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
