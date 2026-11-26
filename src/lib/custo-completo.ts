import type { Insumo, Nivel, Produto, ResultadoProduto } from "./calc";

export interface PrecoCanal { canalId: number; preco: number; herdado: boolean }
export interface ProdutoCompleto extends Produto {
  minutosForno: number;
  perdaPct: number;
  precosPorCanal: PrecoCanal[];
}
export interface Forno {
  precoBotijao: number;
  horasPorBotijao: number;
  custoHora: number;
  custoMinuto: number;
  informado: boolean;
}
export interface FormaPagamento {
  id: number; nome: string; ativo: boolean; ordem: number;
  /** null = desconhecida; zero = explicitamente informada. */
  taxaPct: number | null;
}
export interface Canal {
  id: number; nome: string; margemAlvoPct: number; ativo: boolean; ordem: number;
  formas: FormaPagamento[];
}
export interface Config { impostoPct: number }
export interface ResumoCanal {
  canalId: number; nome: string; preco: number; precoHerdado: boolean;
  taxaPct: number; margem: number; margemPct: number; nivel: Nivel;
  precoSugerido: number | null;
  /** A forma de taxa conhecida mais alta; null se nenhuma aceita tem taxa informada. */
  formaMaisCara: string | null;
  /** Formas aceitas sem taxa informada: margem e sugerido ainda não as consideram. */
  formasSemTaxa: string[];
}
export interface Pendencia { id: string; mensagem: string; href: string }
export interface ProdutoPainel {
  produto: ProdutoCompleto;
  resultado: ResultadoProduto;
  canais: ResumoCanal[];
}
export interface Painel {
  produtos: ProdutoPainel[];
  insumos: Insumo[];
  custoHora: number;
  forno: Forno;
  canais: Canal[];
  formasPagamento: FormaPagamento[];
  config: Config;
  faltaPreencher: Pendencia[];
}
