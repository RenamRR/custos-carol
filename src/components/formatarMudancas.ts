import { brl } from "@/lib/calc";
import type { CausaMudanca } from "@/lib/linha-do-tempo";

const FUSO_BR = "America/Sao_Paulo";

export function formatarDataCurtaBR(iso: string, comAno = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_BR,
    day: "2-digit",
    month: "2-digit",
    ...(comAno ? { year: "2-digit" } : {}),
  }).format(d);
}

export function formatarDataHoraBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_BR,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatarPctBR(valor: number, casasMax = 2): string {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: casasMax,
  }).format(valor)}%`;
}

function formatarValorCausa(causa: CausaMudanca, valor: number): string {
  switch (causa.tipo) {
    case "taxa":
    case "imposto":
      return formatarPctBR(valor);
    case "hora":
    case "forno":
      return `${brl(valor)}/h`;
    case "insumo":
    case "preco":
      return brl(valor);
  }
}

export function descreverCausa(
  causa: CausaMudanca,
  opcoes?: { dataIso?: string; incluirAutor?: boolean },
): string {
  const sufixoPorHora = causa.tipo === "hora" || causa.tipo === "forno" ? "/h" : "";
  const paraTxt = formatarValorCausa(causa, causa.para);
  const deTxt =
    causa.de !== null
      ? causa.tipo === "taxa" || causa.tipo === "imposto"
        ? formatarPctBR(causa.de)
        : brl(causa.de)
      : null;

  const trechoValor =
    deTxt !== null
      ? `${deTxt}${sufixoPorHora} → ${paraTxt}`
      : `informado pela 1ª vez em ${paraTxt}`;

  const extras: string[] = [];
  if (opcoes?.incluirAutor !== false && causa.alteradoPor) {
    extras.push(causa.alteradoPor);
  }
  if (opcoes?.dataIso) {
    extras.push(formatarDataCurtaBR(opcoes.dataIso));
  }

  return extras.length > 0
    ? `${causa.nome} (${trechoValor}, ${extras.join(", ")})`
    : `${causa.nome} (${trechoValor})`;
}

export function descreverCausasNoInstante(
  causas: CausaMudanca[],
  instanteIso: string,
): string {
  if (causas.length === 0) return `alteração em ${formatarDataCurtaBR(instanteIso)}`;
  if (causas.length === 1) {
    return descreverCausa(causas[0], { dataIso: instanteIso, incluirAutor: true });
  }

  const autores = new Set(causas.map((c) => c.alteradoPor).filter(Boolean));
  const autorComum = autores.size === 1 ? [...autores][0] : null;
  const partes = causas.map((c) =>
    descreverCausa(c, { incluirAutor: autorComum === null }),
  );
  const rodape = [autorComum, formatarDataCurtaBR(instanteIso)].filter(Boolean).join(", ");
  return `${partes.join("; ")} (${rodape})`;
}
