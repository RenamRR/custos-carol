/**
 * Dados extraídos da planilha "Custo Carol - Custos.csv".
 * Fonte e conferência: vault, `11 - custos carol/Dados-Originais.md`.
 *
 * Usado pelo seed e pelo teste do motor de cálculo — o teste garante que estes
 * números continuam produzindo R$ 3,66 / R$ 3,20 / R$ 4,58 por unidade.
 */

export interface InsumoInicial {
  nome: string;
  tipo: "ingrediente" | "embalagem";
  embalagem: string;
  qtd: number;
  unidade: string;
  preco: number;
}

export interface LinhaInicial {
  insumo: string;
  qtd: number;
  alerta?: string;
}

export interface EmbalagemInicial {
  insumo: string;
  qtdPorUnidade: number;
}

export interface ProdutoInicial {
  nome: string;
  rendimento: number;
  markupAlvo: number;
  precoVenda: number;
  /** Zero: a planilha original não media tempo. A Carol precisa cronometrar. */
  minutosPreparo: number;
  minutosAcabamentoUn: number;
  linhas: LinhaInicial[];
  embalagens: EmbalagemInicial[];
}

const CONFERIR_GOTAS =
  "A tabela de receita da planilha original dizia 270g. Confirmar com a Carol.";

export const INSUMOS_INICIAIS: InsumoInicial[] = [
  { nome: "Cacau 70%",                tipo: "ingrediente", embalagem: "Pacote 500g",         qtd: 500,  unidade: "g",  preco: 30.0 },
  { nome: "Cacau gotas meio amargo",  tipo: "ingrediente", embalagem: "Pacote 2kg",          qtd: 2000, unidade: "g",  preco: 62.0 },
  { nome: "Cacau 50%",                tipo: "ingrediente", embalagem: "Pacote 1kg",          qtd: 1000, unidade: "g",  preco: 35.0 },
  { nome: "Chocolate gotas branco",   tipo: "ingrediente", embalagem: "Pacote 1kg",          qtd: 1000, unidade: "g",  preco: 30.0 },
  { nome: "Ovo",                      tipo: "ingrediente", embalagem: "Bandeja 20 unidades", qtd: 20,   unidade: "un", preco: 18.0 },
  { nome: "Farinha",                  tipo: "ingrediente", embalagem: "Pacote 1kg",          qtd: 1000, unidade: "g",  preco: 4.0 },
  { nome: "Açúcar",                   tipo: "ingrediente", embalagem: "Pacote 1kg",          qtd: 1000, unidade: "g",  preco: 3.8 },
  { nome: "Margarina",                tipo: "ingrediente", embalagem: "Pote 1kg",            qtd: 1000, unidade: "g",  preco: 13.0 },
  { nome: "Cream cheese",             tipo: "ingrediente", embalagem: "Pote 300g",           qtd: 300,  unidade: "g",  preco: 13.0 },
  { nome: "Cookie Bauducco",          tipo: "ingrediente", embalagem: "Pacote 100g",         qtd: 100,  unidade: "g",  preco: 5.0 },
  { nome: "Barra chocolate ao leite", tipo: "ingrediente", embalagem: "Barra 80g",           qtd: 80,   unidade: "g",  preco: 6.0 },

  { nome: "Tag",      tipo: "embalagem", embalagem: "200 unidades", qtd: 200, unidade: "un", preco: 50.0 },
  { nome: "Caixa",    tipo: "embalagem", embalagem: "25 unidades",  qtd: 25,  unidade: "un", preco: 12.5 },
  { nome: "Saquinho", tipo: "embalagem", embalagem: "100 unidades", qtd: 100, unidade: "un", preco: 20.5 },
  { nome: "Sizal",    tipo: "embalagem", embalagem: "Rolo 100m",    qtd: 100, unidade: "m",  preco: 10.0 },
];

/** Os três brownies da planilha usam o mesmo conjunto: 1 de cada, por unidade. */
const EMBALAGEM_BROWNIE: EmbalagemInicial[] = [
  { insumo: "Tag", qtdPorUnidade: 1 },
  { insumo: "Caixa", qtdPorUnidade: 1 },
  { insumo: "Saquinho", qtdPorUnidade: 1 },
  { insumo: "Sizal", qtdPorUnidade: 1 },
];

export const PRODUTOS_INICIAIS: ProdutoInicial[] = [
  {
    nome: "Brownie Tradicional",
    rendimento: 12,
    markupAlvo: 3.5,
    precoVenda: 11.5,
    minutosPreparo: 0,
    minutosAcabamentoUn: 0,
    embalagens: EMBALAGEM_BROWNIE,
    linhas: [
      { insumo: "Cacau 70%", qtd: 135 },
      { insumo: "Cacau gotas meio amargo", qtd: 540, alerta: CONFERIR_GOTAS },
      { insumo: "Ovo", qtd: 4 },
      { insumo: "Farinha", qtd: 120 },
      { insumo: "Açúcar", qtd: 270 },
      { insumo: "Margarina", qtd: 100 },
    ],
  },
  {
    nome: "Brownie Redvelvet",
    rendimento: 12,
    markupAlvo: 3.5,
    precoVenda: 13.5,
    minutosPreparo: 0,
    minutosAcabamentoUn: 0,
    embalagens: EMBALAGEM_BROWNIE,
    linhas: [
      { insumo: "Cacau 50%", qtd: 135 },
      { insumo: "Chocolate gotas branco", qtd: 270 },
      { insumo: "Ovo", qtd: 4 },
      { insumo: "Farinha", qtd: 120 },
      { insumo: "Açúcar", qtd: 270 },
      { insumo: "Margarina", qtd: 100 },
      { insumo: "Cream cheese", qtd: 150 },
    ],
  },
  {
    nome: "Brownie Cookie",
    rendimento: 12,
    markupAlvo: 3.5,
    precoVenda: 13.5,
    minutosPreparo: 0,
    minutosAcabamentoUn: 0,
    embalagens: EMBALAGEM_BROWNIE,
    linhas: [
      { insumo: "Cacau 70%", qtd: 135 },
      { insumo: "Cacau gotas meio amargo", qtd: 540, alerta: CONFERIR_GOTAS },
      { insumo: "Ovo", qtd: 4 },
      { insumo: "Farinha", qtd: 120 },
      { insumo: "Açúcar", qtd: 270 },
      { insumo: "Margarina", qtd: 100 },
      { insumo: "Cookie Bauducco", qtd: 100 },
      { insumo: "Barra chocolate ao leite", qtd: 80 },
    ],
  },
];
