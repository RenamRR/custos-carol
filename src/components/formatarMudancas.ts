import { brl } from "@/lib/calc";
import type { CausaMudanca, MudancaReceita } from "@/lib/linha-do-tempo";

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

export function formatarQtdLimpaBR(valor: number, casasMax = 4): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: casasMax,
  }).format(valor);
}

export function formatarPctBR(valor: number, casasMax = 2): string {
  return `${formatarQtdLimpaBR(valor, casasMax)}%`;
}

export function descreverMudancaReceita(mudanca: MudancaReceita): string {
  switch (mudanca.campo) {
    case "ingrediente":
    case "embalagem": {
      if (mudanca.de === null && mudanca.para !== null) {
        return `+ ${mudanca.nome} ${formatarQtdLimpaBR(mudanca.para)} ${mudanca.unidade}`;
      }
      if (mudanca.de !== null && mudanca.para === null) {
        return `− ${mudanca.nome} (era ${formatarQtdLimpaBR(mudanca.de)} ${mudanca.unidade})`;
      }
      return `${mudanca.nome}: ${formatarQtdLimpaBR(mudanca.de ?? 0)} ${mudanca.unidade} → ${formatarQtdLimpaBR(mudanca.para ?? 0)} ${mudanca.unidade}`;
    }
    case "rendimento":
      return `Rende ${formatarQtdLimpaBR(Number(mudanca.de))} → ${formatarQtdLimpaBR(Number(mudanca.para))} un`;
    case "minutosPreparo": {
      const de = Number(mudanca.de);
      const para = Number(mudanca.para);
      return `Preparo: ${formatarQtdLimpaBR(de, 2)} → ${formatarQtdLimpaBR(para, 2)} min${de === 0 && para > 0 ? " (preenchido)" : ""}`;
    }
    case "minutosAcabamentoUn": {
      const de = Number(mudanca.de);
      const para = Number(mudanca.para);
      return `Acabamento: ${formatarQtdLimpaBR(de, 2)} → ${formatarQtdLimpaBR(para, 2)} min/un${de === 0 && para > 0 ? " (preenchido)" : ""}`;
    }
    case "minutosForno": {
      const de = Number(mudanca.de);
      const para = Number(mudanca.para);
      return `Forno: ${formatarQtdLimpaBR(de, 2)} → ${formatarQtdLimpaBR(para, 2)} min${de === 0 && para > 0 ? " (preenchido)" : ""}`;
    }
    case "perdaPct": {
      const de = Number(mudanca.de);
      const para = Number(mudanca.para);
      return `Perda: ${formatarPctBR(de)} → ${formatarPctBR(para)}${de === 0 && para > 0 ? " (preenchido)" : ""}`;
    }
    case "semForno":
      return mudanca.para ? "Não vai mais ao forno" : "Passa a ir ao forno";
  }
}

export function resumirMudancasReceita(mudancas: MudancaReceita[], limite = 2): string {
  if (mudancas.length === 0) return "";
  const visiveis = mudancas.slice(0, limite).map(descreverMudancaReceita);
  const extras = mudancas.length - visiveis.length;
  return extras > 0 ? `${visiveis.join(", ")} +${extras}` : visiveis.join(", ");
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
    case "receita":
      return brl(valor);
  }
}

export function descreverCausa(
  causa: CausaMudanca,
  opcoes?: { dataIso?: string; incluirAutor?: boolean },
): string {
  const extras: string[] = [];
  if (opcoes?.incluirAutor !== false && causa.alteradoPor) {
    extras.push(causa.alteradoPor);
  }
  if (opcoes?.dataIso) {
    extras.push(formatarDataCurtaBR(opcoes.dataIso));
  }

  if (causa.tipo === "receita") {
    const resumo = resumirMudancasReceita(causa.mudancas ?? [], 2);
    if (resumo) {
      return extras.length > 0
        ? `mudança na receita (${resumo}, ${extras.join(", ")})`
        : `mudança na receita (${resumo})`;
    }
    const base =
      causa.de === null
        ? "receita cadastrada"
        : `mudança na receita (${brl(causa.de)} → ${brl(causa.para)})`;
    return extras.length > 0 ? `${base} (${extras.join(", ")})` : base;
  }

  const sufixoPorHora = causa.tipo === "hora" || causa.tipo === "forno" ? "/h" : "";
  const paraTxt = formatarValorCausa(causa, causa.para);
  const deTxt =
    causa.de !== null
      ? causa.tipo === "taxa" || causa.tipo === "imposto"
        ? formatarPctBR(causa.de)
        : brl(causa.de)
      : null;

  const unInsumo = causa.unidade ? ` ${causa.unidade}` : "";
  const trechoValor =
    deTxt !== null
      ? causa.tipo === "insumo" &&
        causa.qtdDe !== undefined &&
        causa.qtdPara !== undefined &&
        Math.abs(causa.qtdDe - causa.qtdPara) > 1e-6
        ? `${deTxt} · ${formatarQtdLimpaBR(causa.qtdDe)}${unInsumo} → ${paraTxt} · ${formatarQtdLimpaBR(causa.qtdPara)}${unInsumo}`
        : `${deTxt}${sufixoPorHora} → ${paraTxt}`
      : `informado pela 1ª vez em ${paraTxt}`;

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
