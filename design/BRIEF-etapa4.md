# Etapa 4 — Produção → lista de compras (Custos Carol v2)

Maestro: Genesis. As etapas 1–3 estão no ar desde 26/11; a etapa 3 é o commit adb6d86. Antes de começar, leia:
- `C:\Users\Usuario\Desktop\Form\Obsidian\Renam-AI\11 - custos carol\V2-Plano.md`, seção "Produção e compras";
- `design/BRIEF-etapa3.md`;
- `design/mockup-v2.html`: barra inferior e padrão dos cartões.

## Objetivo
A Carol diz o que vai assar ("3 fornadas de Tradicional + 2 de Nutella") e o app devolve a lista de compras:
- ingredientes e embalagens somados de todas as receitas;
- **arredondada para a embalagem de compra**: não dá para comprar 135 g de cacau, compra-se 1 pacote de 500 g;
- quanto vai **gastar no mercado** e quanto **custa o que a produção consome** (a diferença é a sobra que fica em casa);
- quantos brownies saem.

## Decisões do Genesis (o Renam deu OK para a etapa em 26/11)
- **Fornada = 1 receita inteira** (o `rendimento` do produto). Aceita meia fornada: passo de 0,5, de 0,5 a 50.
- **Sem migração e sem gravar nada no banco.** O plano vive na URL (`/produzir?p=<produtoId>:<fornadas>,...`),
  então ela recarrega ou manda o link e o plano continua lá. "Já tenho em casa" e o check de "comprado"
  ficam no aparelho (`localStorage`, por plano). Marcar produção como feita, estoque e sobra ficam fora.
- **"Já tenho em casa"** é opcional, por insumo, na mesma unidade da receita (g, ml, un). É descontado da
  necessidade antes de arredondar para pacotes.
- **Embalagem só para brownie bom**, a mesma regra do custo:
  unidades boas = ⌊rendimento × fornadas × (1 − perda/100)⌋, arredondado para baixo porque não se
  embala meio brownie. Necessidade de embalagem = `qtdPorUnidade` × unidades boas.
- Produto arquivado não aparece para planejar.

## Divisão de arquivos (a mesma das etapas anteriores)
| Dono | Arquivos |
|---|---|
| **Forge** | `src/lib/**`, `src/db/**`, `src/app/actions.ts`, `package.json` |
| **Quartzo** | `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `src/app/globals.css`, `src/components/**` |

## Motor (Forge) — `src/lib/producao.ts`, função pura, com testes feitos à mão
`listaCompras(plano, produtos, insumos, jaTenho?)`:
- **Entradas:**
  - `plano: { produtoId, fornadas }[]`;
  - `jaTenho: Record<insumoId, number>`.
- **Por produto:** `{ produtoId, nome, fornadas, unidadesBoas, custoConsumido }`.
- **Por insumo**, agrupado em ingredientes e embalagens, cada item com:
  - `insumoId`, `nome`, `unidade`, `embalagem` (descrição) e `qtdEmbalagem`;
  - `necessario`: soma das receitas, já × fornadas;
  - `jaTenho` e `comprar = max(0, necessario − jaTenho)`;
  - `pacotes = ceil(comprar / qtdEmbalagem)` e `sobra = pacotes × qtdEmbalagem − comprar`;
  - `gasto = pacotes × preço vigente da embalagem`;
  - `custoConsumido = necessario × preço ÷ qtdEmbalagem`;
  - `usadoPor: string[]`: quais produtos usam o insumo.
- **Totais:** `{ gastoMercado, custoConsumido, unidadesBoas, pacotes }`.
- **Pendências**, sem travar:
  - insumo sem preço ou com `qtdEmbalagem <= 0` → `pacotes`/`gasto` = `null`, e o item vai para `pendencias`;
  - fornadas fora do intervalo ou fora do passo de 0,5 → ignorada e listada em `pendencias`.
- **Ponto flutuante:** some em unidades inteiras onde der e use tolerância no `ceil`, para que
  500 × 1,0000000001 não vire 2 pacotes. Teste com valores que dariam esse erro.
- `custoConsumido` dos ingredientes de um produto ÷ unidades boas tem que bater com a parte de
  ingredientes do `calcularProduto` (teste de consistência com um produto real do seed).

`parsePlano(query: string)` e `serializarPlano(plano)` ficam no mesmo arquivo:
- tolerantes a lixo;
- produto repetido soma as fornadas;
- limite de 20 produtos.

## Contrato para o Quartzo (Forge confirma com o aviso "contrato no disco")
- `src/lib/queries.ts` → `carregarProduzir()`: produtos ativos (`id`, `nome`, `rendimento`, `perdaPct`,
  linhas, embalagens) + insumos com preço vigente. Chama `exigirUsuario()`.
- A conta roda no cliente com `listaCompras` (função pura, sem segredo). O servidor só entrega os dados.
- Nenhuma action nova.

## Telas (Quartzo)
1. **Barra inferior:** Início · Produtos · Vender (central) · **Produzir** · Mais.
   **Insumos sai da barra** e vira um item em Mais, no topo, com o mesmo destino `/insumos`.
   A rota `/insumos` continua existindo.
2. **Produzir** (`/produzir`), celular primeiro, para usar dentro do mercado:
   - **Planejar:**
     - cada produto com um stepper de fornadas (−/+ de 0,5 em 0,5);
     - mostra "rende ~N brownies" e o gasto previsto ao lado;
     - o plano vai para a URL com `router.replace`, sem empilhar histórico.
   - **Resumo:**
     - **Gasto no mercado R$ X** em destaque;
     - "consome R$ Y desta compra; o resto fica em casa";
     - total de brownies.
   - **Lista de compras**, em Ingredientes e Embalagens. Cada linha:
     - nome e "2 × Pacote 500 g";
     - "precisa 1.135 g · sobra 365 g" e o gasto;
     - checkbox **comprado** (risca a linha e a manda para o fim);
     - campo opcional "já tenho", que recalcula na hora.
   - **Botões:**
     - **Copiar lista** (texto simples para colar no WhatsApp);
     - **Limpar plano**.
   - Pendências aparecem num aviso no topo da lista, com link para corrigir o insumo.
   - Estado vazio: "Escolha quantas fornadas de cada sabor".
3. **Mais:** item "Insumos e embalagens" no topo.
- Toques ≥ 44 px, `tabular-nums`, contraste AA, 390 px sem overflow.
- Quantidades no formato BR com milhar ("1.135 g") e preço com 2 casas.

## Fora do escopo
Registrar produção feita, estoque, sobra entre produções, histórico de planos, alertas e gráficos (etapa 5).
Não faça commit nem deploy: o Genesis integra.

## Gate (nesta ordem)
1. Forge e Quartzo terminam e avisam o Genesis.
2. **Tester:**
   - typecheck, todos os `test:*`, `build`, `build:scripts`;
   - testes novos de `producao.ts` com conta à mão:
     - 3 Tradicional + 2 Nutella com os dados do backup;
     - "já tenho" maior que o necessário;
     - insumo sem preço;
     - meia fornada;
     - tolerância de ponto flutuante;
     - URL com lixo;
   - **navegador 390 px num banco descartável com o backup real:**
     - montar o plano;
     - conferir 3 linhas e o total à mão;
     - recarregar a página (o plano fica);
     - marcar comprado;
     - "já tenho";
     - copiar a lista;
     - Insumos acessível por Mais.
3. **Smith:** diff inteiro, com atenção a:
   - arredondamento e ponto flutuante;
   - consistência com `calc.ts`;
   - `exigirUsuario` na query;
   - parse da URL.

   APPROVE é condição de aceite.

Ao terminar sua parte: `maestri ask "Genesis" "<resumo: o que fez, arquivos, testes, dúvidas>"`.
