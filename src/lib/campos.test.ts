import assert from "node:assert/strict";
import { test } from "node:test";
import { paraCampo } from "../components/useSalvar";
import { parseNumeroBR } from "./calc";
import { numeroCusto } from "./validacao-custo";

test("campo pt-BR preserva milhares e frações ao salvar sem editar", () => {
  for (const valor of [1000, 12000, 1234.5, 0.25]) {
    assert.equal(parseNumeroBR(paraCampo(valor, 4)), valor);
  }
  assert.equal(parseNumeroBR("1.5"), 1.5, "teclado decimal Android continua aceito");
  assert.equal(parseNumeroBR("11,50"), 11.5);
});

test("ponto de milhar pt-BR: 1.000 é mil, 13.5 e 0.250 seguem decimais", () => {
  const casos: [string, number][] = [
    ["1.000", 1000], ["12.500", 12500], ["1.234.567", 1234567], ["R$ 1.200", 1200],
    ["13.5", 13.5], ["1.25", 1.25], ["0.250", 0.25], ["1.0000", 1], ["1.200,50", 1200.5],
  ];
  for (const [texto, esperado] of casos) {
    assert.equal(parseNumeroBR(texto), esperado, `parseNumeroBR(${texto})`);
    assert.equal(numeroCusto(texto, 1e9, 4), esperado, `numeroCusto(${texto})`);
  }
});
