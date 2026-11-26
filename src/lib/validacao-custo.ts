export const PERDA_MAXIMA_PCT = 89.99;
export const IMPOSTO_CHAVE = "imposto_pct";

/**
 * Convenção brasileira para texto sem vírgula: ponto seguido de grupos de exatamente 3 dígitos
 * é separador de milhar ("1.000" = mil, "12.500" = doze mil e quinhentos). Fora disso, o ponto
 * é decimal ("13.5", "1.25", e "0.250", que começa com zero e não pode ser milhar), para aceitar
 * o teclado decimal do Android.
 */
export const pontoEhMilhar = (texto: string): boolean => /^-?[1-9]\d{0,2}(?:\.\d{3})+$/.test(texto);

/** Parser estrito do servidor: não transforma vazio, lixo ou Infinity em zero. */
export function numeroCusto(valor: unknown, maximo: number, casas = 2, minimo = 0): number | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  let numero: number;
  if (typeof valor === "number") numero = valor;
  else {
    const texto = valor.trim().replace(/^R\$\s*/, "");
    if (!/^-?(?:\d+(?:\.\d+)?|\d+(?:\.\d{3})*,\d+)$/.test(texto) && !pontoEhMilhar(texto)) return null;
    numero = Number(
      texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".")
        : pontoEhMilhar(texto) ? texto.replace(/\./g, "")
        : texto,
    );
  }
  if (!Number.isFinite(numero) || numero < minimo || numero > maximo || Number(numero.toFixed(casas)) !== numero) return null;
  return numero;
}

export const idValido = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0 && id <= 2147483647;
