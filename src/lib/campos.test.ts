import assert from "node:assert/strict";
import { test } from "node:test";
import { paraCampo } from "../components/useSalvar";
import { parseNumeroBR } from "./calc";

test("campo pt-BR preserva milhares e frações ao salvar sem editar", () => {
  for (const valor of [1000, 12000, 1234.5, 0.25]) {
    assert.equal(parseNumeroBR(paraCampo(valor, 4)), valor);
  }
  assert.equal(parseNumeroBR("1.5"), 1.5, "teclado decimal Android continua aceito");
  assert.equal(parseNumeroBR("11,50"), 11.5);
});
