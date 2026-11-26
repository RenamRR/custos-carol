# Etapa 3 — Vendas, feiras e lucro do mês (Custos Carol v2)

Maestro: Genesis. As etapas 1 (18e1e29) e 2 (d34165e) estão no ar desde 26/11. Antes de começar, leia:
- `C:\Users\Usuario\Desktop\Form\Obsidian\Renam-AI\11 - custos carol\V2-Plano.md`;
- `design/BRIEF-etapa2.md`;
- `design/mockup-v2.html`: telas 1 (Início) e 5 (Vender).

## Objetivo
Hoje o app sabe quanto **custa** cada brownie. A etapa 3 faz o app saber quanto a Carol **ganhou**:
- registrar uma venda em poucos toques;
- cada venda grava o **custo do dia** (snapshot): um aumento de insumo depois não reescreve a margem antiga;
- **feiras** viram eventos com data e custo fixo (barraca/inscrição), rateado pelo que vendeu ali;
- **lucro do mês**: faturamento, custo, taxas, custo das feiras e lucro, por produto e por canal.

## Decisões do Genesis (o Renam deu OK para a etapa em 26/11)
- **Uma venda pode ter vários sabores.** Encomenda de WhatsApp costuma ser "6 Tradicional + 4 Nutella".
  O modelo é cabeçalho + itens; a tela segue o mockup (1 produto por vez) com "+ outro sabor".
- **Rateio do custo fixo da feira por unidade vendida no evento.** Exemplo: R$ 60 de barraca ÷ 40
  brownies = R$ 1,50 por brownie. É a conta mais fácil de a Carol conferir de cabeça.
- **Venda errada se cancela, não se edita nem se apaga.** Fica `cancelada_em`/`cancelada_por`, e sai
  das contas. Para corrigir, a Carol cancela e registra de novo.
- **Feira sem evento é permitido** (porta a porta). Venda de Encomenda nunca tem evento.
- **Mês, dia e "hoje" no fuso America/Sao_Paulo**, nunca no fuso do container (UTC).
- **Taxa desconhecida não trava a venda.** Se a forma não tem taxa informada (Débito/Crédito hoje),
  a venda grava `taxa_pct = null`, entra nas contas como 0 e o mês mostra "N vendas sem taxa informada".
  Informar a taxa depois **não** reescreve essas vendas (é snapshot).

## Regras que não mudam
- Migração **aditiva** (`0005_vendas.sql`); não editar 0000–0004, que já rodaram em produção.
- `test:calc` e os testes da etapa 2 continuam verdes sem editar valores esperados.
- `exigirUsuario()` em toda query e action nova; `criado_por`/`cancelada_por`/`alterado_por` em toda escrita.
- **O custo do snapshot é calculado no servidor** com o mesmo motor de `carregarPainel()`. Do cliente
  só vêm produto, quantidade, preço cobrado, canal, forma, evento e data.
- Backup na subida do container precisa levar as tabelas novas. Confira em `src/db/backup.ts`.

## Divisão de arquivos (a mesma das etapas 1 e 2)
| Dono | Arquivos |
|---|---|
| **Forge** | `package.json`/lockfile, `next.config.ts`, `Dockerfile`, `drizzle/**`, `src/db/**`, `src/lib/**`, `src/app/actions.ts`, `src/app/entrar/actions.ts` |
| **Quartzo** | `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `src/app/globals.css`, `src/components/**`, `public/**` |

## Modelo (Forge) — `drizzle/0005_vendas.sql`
- `eventos`:
  - colunas: `id`, `nome text not null` ("Feira do Sábado"), `data date not null`,
    `custo_fixo numeric not null default 0 check (>= 0)`, `nota`, `criado_por`, `criado_em`,
    `alterado_por`, `alterado_em`, `cancelado_em`, `cancelado_por`;
  - o canal é sempre Feira (não precisa de coluna);
  - o custo fixo é fato do evento, não preço que muda no tempo: corrigir é editar a coluna, com `alterado_por`;
  - cancelar evento com venda ativa → erro "cancele as vendas antes".
- `vendas` (cabeçalho):
  - colunas: `id`, `vendida_em timestamptz not null default now()`, `canal_id not null`,
    `forma_id not null`, `evento_id null`, `taxa_pct numeric null` (snapshot), `imposto_pct numeric not null`
    (snapshot), `nota`, `criado_por`, `criado_em`, `cancelada_em`, `cancelada_por`;
  - `check`: `evento_id` só quando o canal é Feira. Valide na action; um check com subquery não existe,
    então o banco faz o que der.
- `venda_itens`:
  - colunas: `id`, `venda_id references vendas on delete cascade`,
    `produto_id references produtos on delete restrict`, `quantidade int check (1..999)`,
    `preco_un numeric check (>= 0)`, `custo_un numeric not null` (snapshot do custo completo),
    `produto_nome text not null` (snapshot, para a venda antiga ler certo se o produto mudar de nome).
- `produtos.ativo boolean not null default true`:
  - `removerProduto` arquiva (`ativo = false`) quando o produto tem venda e apaga quando não tem;
  - produto arquivado some de Produtos e do Vender, mas continua nas vendas e no mês.
- Índices: `vendas(vendida_em)` filtrado por não cancelada, `venda_itens(venda_id)`, `vendas(evento_id)`.
- Forma aceita pelo canal: a action recusa uma forma que o canal não aceita (`canal_formas`).

## Motor (Forge) — funções puras em `src/lib/vendas.ts`, com testes feitos à mão
1. `resultadoItem({ quantidade, precoUn, custoUn }, taxaPct, impostoPct)` → `{ faturamento, custo, taxas, margem }`:
   - faturamento = q × preço;
   - custo = q × custoUn;
   - taxas = faturamento × ((taxa ?? 0) + imposto)/100;
   - margem = faturamento − custo − taxas.
2. `rateioEvento(custoFixo, itensDoEvento)` → custo fixo por item, proporcional às unidades. Precisa
   somar exatamente o custo fixo: o resto do arredondamento vai no último item.
3. `resumoMes(vendas, eventos)`, só vendas não canceladas, retorna:
   - `totais { faturamento, custo, taxas, custoFeiras, lucro, unidades, vendas, vendasSemTaxa }`;
   - `porProduto[]` e `porCanal[]`, com o custo da feira já rateado;
   - `feiras[]`: por evento, `{ faturamento, unidades, custoFixo, lucro }`;
   - `custoFeiraSemVenda`: evento do mês sem nenhuma venda. Entra no total e no canal Feira, não em produto.
4. Lucro do mês = Σ margem dos itens − Σ custo fixo dos eventos do mês (eventos não cancelados com `data` no mês).

## Contrato para o Quartzo (Forge confirma com o aviso "contrato no disco")
`src/lib/queries.ts`:
- `carregarVender()`:
  - produtos ativos com o preço vigente por canal e o custo/un de hoje;
  - canais com as formas aceitas e as taxas (null = não informada);
  - eventos de hoje e dos próximos 7 dias;
  - imposto vigente.
- `carregarMes(ano, mes)`:
  - `resumoMes` pronto;
  - lista de vendas do mês com itens, ordenada da mais nova para a mais antiga;
  - eventos do mês.
- `carregarHoje()`: lucro do mês corrente (totais) e as vendas de hoje, para o Início.

`src/app/actions.ts` (retorno `Resultado`; `registrarVenda` devolve também `vendaId` e o custo/un gravado):
- `registrarVenda({ canalId, formaId, eventoId?, vendidaEm?, nota?, itens: [{ produtoId, quantidade, precoUn }] })`:
  - `vendidaEm` ausente = agora;
  - aceita data passada até 60 dias e não aceita futura;
  - `precoUn` vem como string e passa pelo parse BR que já existe.
- `cancelarVenda(vendaId)`
- `criarEvento({ nome, data, custoFixo, nota? })`, `salvarEvento(id, {...})`, `cancelarEvento(id)`

## Telas (Quartzo), no padrão do mockup aprovado
1. **Barra inferior:** Início · Produtos · **Vender** (botão central em destaque, como no mockup) · Insumos · Mais.
   Na etapa 4, Insumos dá lugar a Produzir. Não faça isso agora.
2. **Vender** (`/vender`), como a tela 5 do mockup:
   - **1. produto:** grade com o preço do canal escolhido;
   - **2. quantidade:** stepper grande, que também aceita digitar;
   - **3. canal:** Encomenda / Feira. Em Feira, aparece o seletor de evento:
     - pré-seleciona o evento de hoje;
     - "Sem evento (porta a porta)";
     - "+ Nova feira" com nome, data (hoje) e custo fixo, sem sair da tela;
   - **4. pagamento:** só as formas aceitas pelo canal, com a taxa; "taxa não informada" quando null;
   - resumo:
     - preço preenchido, editável (ex.: desconto), via `parseNumeroBR`/`paraCampo`;
     - total;
     - "lucro previsto" com custo do dia, taxa e imposto;
   - **"+ outro sabor"** monta a venda com vários itens antes de confirmar;
   - data: "Hoje", com a opção discreta "outro dia" para lançar a feira de ontem;
   - confirmar → toast "Venda registrada · custo do dia salvo: R$ X/un" e a tela volta limpa.
     O canal e o evento continuam escolhidos, porque na feira ela vende várias seguidas.
3. **Mês** (`/vendas`, com seletor de mês, abre no mês atual):
   - topo: faturamento, lucro e margem %, unidades vendidas;
   - linha "custo das feiras: R$ X";
   - **Por produto** e **Por canal**: faturamento, unidades, lucro e margem %;
   - **Feiras:** cada evento com custo fixo, vendas e lucro, editável (corrigir o custo fixo, cancelar);
   - **Vendas:** lista agrupada por dia, cada uma com itens, forma, total e lucro, e o botão
     **Cancelar venda** com confirmação. Cancelada aparece riscada;
   - aviso "N vendas sem taxa informada", com link para Mais → Formas de pagamento.
4. **Início:**
   - o topo vira o cartão do mockup: "Lucro líquido no mês", vendidos no mês com Encomenda · Feira,
     e o botão **"Registrar venda agora"**;
   - "Últimas vendas de hoje";
   - o "Falta preencher" e o produto que pede atenção continuam;
   - mês sem venda: estado vazio convidando a registrar a primeira.
- Toques ≥ 44 px, `tabular-nums`, contraste AA, celular primeiro (390 px), uso com uma mão.

## Fora do escopo
Produção/lista de compras (etapa 4), gráficos e alertas (etapa 5), estoque, clientes.
Não faça commit nem deploy: o Genesis integra.

## Gate (nesta ordem)
1. Forge e Quartzo terminam e avisam o Genesis.
2. **Tester:**
   - typecheck e todos os `test:*` existentes;
   - testes novos de `vendas.ts` com conta feita à mão:
     - item com taxa null;
     - rateio que não divide exato (R$ 10 ÷ 3 itens soma 10,00);
     - evento sem venda;
     - venda cancelada fora;
     - venda às 23h30 de 31/12 no fuso SP fica em dezembro;
   - `build`, `build:scripts`;
   - **ensaio:** 0000–0004 + o backup mais recente + 0005 → contagens iguais e custo/un dos 4 produtos idêntico;
   - **navegador num banco descartável:**
     - criar feira de R$ 60;
     - vender 2 sabores no Pix e 1 no Crédito sem taxa;
     - cancelar uma;
     - conferir o mês à mão;
     - mudar o preço do cacau e ver que a venda antiga **não** muda.
3. **Smith:** diff inteiro, com atenção a:
   - migração;
   - snapshot calculado no servidor;
   - fuso;
   - rateio;
   - `exigirUsuario` + autoria em toda action nova;
   - `removerProduto` arquivando.

   APPROVE é condição de aceite.

Ao terminar sua parte: `maestri ask "Genesis" "<resumo: o que fez, arquivos, testes, dúvidas>"`.
