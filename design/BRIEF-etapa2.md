# Etapa 2 — Custo completo (Custos Carol v2)

Maestro: Genesis. A etapa 1 está no ar desde 26/11 (commit 18e1e29). Leia antes:
`C:\Users\Usuario\Desktop\Form\Obsidian\Renam-AI\11 - custos carol\V2-Plano.md` e `design/mockup-v2.html`.

## Objetivo
Hoje o custo é só ingrediente + embalagem (+ mão de obra, que está zerada). A etapa 2 fecha o custo
de verdade e mostra **quanto sobra em cada canal de venda**:
- **forno** (gás por tempo de forno);
- **perda** (quebra, aparas, prova);
- **canais** Encomenda e Feira, com **preço próprio por canal**;
- **formas de pagamento** com taxa (as mesmas nos dois canais, uma maquininha só);
- **preço sugerido por canal**, a partir de uma margem alvo;
- **imposto** como % sobre a venda, em 0 (Carol é informal).

Princípio da v1 que continua: **não custear com número inventado**. O que a Carol ainda não
informou fica em zero/vazio, e o app mostra uma lista do que falta preencher.

## Decisões do Renam (26/11)
- Preço **próprio por canal**. O preço atual vale para os dois até ela mudar.
- Taxas de pagamento **iguais nos dois canais**. Cada canal escolhe quais formas aceita.

## Regras que não mudam
- Preço e taxa nunca são colunas mutáveis: tudo que é valor em R$ ou % de custo/venda vira série
  com `vigente_desde` + `alterado_por`.
- Migração **aditiva** (`0004_*.sql`); não editar 0000–0003, que já rodaram em produção.
- **Com forno = 0, perda = 0, taxa = 0 e imposto = 0, o custo/un de hoje NÃO muda.**
  `test:calc` continua verde sem editar os valores esperados.
- `exigirUsuario()` em toda query e action nova; `alterado_por` em toda escrita de série.
- Feira com custo fixo do evento (barraca/inscrição) é da **etapa 3** (eventos), não desta.

## Divisão de arquivos (a mesma da etapa 1)
| Dono | Arquivos |
|---|---|
| **Forge** | `package.json`/lockfile, `next.config.ts`, `Dockerfile`, `drizzle/**`, `src/db/**`, `src/lib/**`, `src/app/actions.ts`, `src/app/entrar/actions.ts` |
| **Quartzo** | `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `src/app/globals.css`, `src/components/**`, `public/**`, `src/app/icon.*` |

## Modelo (Forge) — `drizzle/0004_custo_completo.sql`
- `forno_custos` (série): `preco_botijao numeric`, `horas_por_botijao numeric`, `vigente_desde`,
  `nota`, `alterado_por`. Custo por minuto de forno = preço ÷ (horas × 60). Sem linha → 0 e
  "falta preencher".
- `produtos`: `minutos_forno numeric not null default 0` (por **lote**) e
  `perda_pct numeric not null default 0` com `check (perda_pct >= 0 and perda_pct < 90)`.
  São atributos da receita, como os tempos que já existem. A etapa 3 grava o custo da venda
  como snapshot, então mudar a perda não reescreve venda passada.
- `canais`: `id`, `nome unique`, `margem_alvo_pct numeric not null default 50`, `ativo`, `ordem`.
  A migração insere **Encomenda** e **Feira**.
- `formas_pagamento`: `id`, `nome unique`, `ativo`, `ordem`. Insere Pix, Dinheiro, Débito e
  Crédito à vista.
- `forma_pagamento_taxas` (série): `forma_id`, `taxa_pct`, `vigente_desde`, `alterado_por`.
  Insere **0 só para Pix e Dinheiro** (zero de verdade). Débito e Crédito ficam **sem linha**:
  taxa desconhecida, o app pede para preencher.
- `canal_formas` (`canal_id`, `forma_id`, pk composta): quais formas cada canal aceita.
  Insere as 4 nos 2 canais.
- `produto_precos`: nova coluna `canal_id int null references canais(id)`. As linhas antigas ficam
  `null`, que significa "preço geral". **Preço vigente de um produto num canal** = a linha mais
  recente com aquele `canal_id`; se não houver, a mais recente com `canal_id null`.
  Nada é reescrito na migração (nada de histórico falso).
- ~~`configuracoes` mutável~~ → **`configuracao_valores` (série: `chave`, `valor`, `vigente_desde`,
  `alterado_por`)**, desvio do Forge aprovado pelo Genesis (ADR-002 do Atlas): imposto também é
  histórico. Insere `imposto_pct = 0`. Imposto é % sobre o preço de venda (validação 0–50).
- Índices para as buscas de "vigente".

## Motor (Forge) — `src/lib/calc.ts`, funções puras, com testes
1. **Perda divide só o que é do lote.** Unidades boas = rendimento × (1 − perda/100). Embalagem e
   acabamento entram só nas unidades boas, porque brownie quebrado não é embalado.
   - custo do lote = ingredientes + mão de obra do preparo + forno
   - custo/un = custo do lote ÷ unidades boas + embalagem/un + mão de obra do acabamento/un
   - forno = minutos_forno × custo por minuto
   - Com perda 0 e forno 0, o resultado é **idêntico** à fórmula atual. Prove com teste.
2. `segmentos` ganham "Forno" e "Perda". Perda = quanto do custo/un vem das unidades perdidas,
   para aparecer em "De onde vem o custo".
3. `margemNoCanal(custoUn, preco, taxaPct, impostoPct)` → `{ margem, margemPct, nivel }`.
   Margem = preço − custoUn − preço × (taxa + imposto)/100.
4. `precoSugerido(custoUn, margemAlvoPct, taxaPct, impostoPct)` = custoUn ÷ (1 − (margem + taxa + imposto)/100).
   Se o divisor for ≤ 0, retorna `null` ("margem impossível").
5. **Taxa do canal** = a **maior** taxa entre as formas que o canal aceita (conta conservadora:
   a margem mostrada vale até no crédito). Forma aceita sem taxa informada conta como 0 e entra
   em `faltaPreencher`.
6. `resumoCanais(...)` → por canal: `{ canalId, nome, preco, precoHerdado, taxaPct, margem,
   margemPct, nivel, precoSugerido, formaMaisCara }`.
7. `faltaPreencher(...)` → lista de pendências com um link de destino:
   - valor da hora = 0;
   - botijão não informado;
   - produto sem minutos de forno;
   - forma aceita sem taxa.

## Contrato para o Quartzo (Forge confirma no aviso de "contrato no disco")
`src/lib/queries.ts`:
- `carregarProdutos()`: cada produto ganha `minutosForno`, `perdaPct` e
  `precosPorCanal: { canalId, preco, herdado }[]`.
- `carregarForno()`, `carregarCanais()` (com as formas e as taxas vigentes),
  `carregarFormasPagamento()`, `carregarConfig()` → `{ impostoPct }`.
- `carregarPainel()`: o que Início e Produtos precisam já calculado: `ResultadoProduto` + `resumoCanais`
  por produto e `faltaPreencher`. A interface não refaz conta.

`src/app/actions.ts` (retorno `Resultado`, como as atuais):
- `salvarForno(precoBotijao, horasPorBotijao)`
- `salvarPrecoCanal(produtoId, canalId, preco)`
- `salvarMargemAlvoCanal(canalId, pct)`
- `salvarTaxaForma(formaId, pct)`
- `alternarFormaCanal(canalId, formaId, aceita)`
- `salvarImposto(pct)`
- Minutos de forno e perda entram na action que já salva os tempos/rendimento do produto, ou numa
  nova; o Forge decide e avisa.

Validação no servidor (nunca só na tela):
- perda entre 0 e 89,99;
- taxa entre 0 e 30;
- margem alvo entre 0 e 95;
- horas do botijão > 0;
- preços ≥ 0.

## Telas (Quartzo), no padrão do mockup aprovado
1. **Produtos:** os cards ganham as colunas por canal, como no mockup (Encomenda | Feira): preço,
   margem % e etiqueta. Preço herdado do geral aparece discreto, com "igual ao geral".
2. **Detalhe do produto:**
   - "De onde vem o custo" mostra Forno e Perda;
   - campos novos: minutos de forno (por lote) e perda %;
   - bloco **Preço por canal**: preço editável, margem, taxa considerada ("pior caso: Crédito 4,99%"),
     preço sugerido e o botão **"Usar sugerido"**, que preenche o campo e não salva sozinho.
3. **Mais:**
   - Forno e gás: preço do botijão e quantas horas ele dura → mostra o custo da hora de forno;
   - Canais: margem alvo e as formas que cada um aceita;
   - Formas de pagamento: taxa %; mudar a taxa vira histórico, como nos preços;
   - Imposto %, com a nota "informal: 0%".
4. **Início:**
   - o produto que pede atenção passa a ser a **pior margem entre todos os canais**;
   - cartão **"Falta preencher"** com os itens de `faltaPreencher`, cada um levando à tela certa;
   - some quando não falta nada.
5. **Favicon / ícone** a partir de `public/logo-carol.jpeg` (`src/app/icon.png` ou `.jpg` + `apple-icon`).
   Hoje `/favicon.ico` dá 404.
- Toques ≥ 44 px, `tabular-nums`, contraste AA, campos numéricos via `paraCampo`/`parseNumeroBR`
  (o bug "1000 → 1" da etapa 1 não pode voltar).

## Fora do escopo
Vendas, eventos de feira e custo fixo do evento, produção, lista de compras, alertas, gráficos.
Não faça commit nem deploy: o Genesis integra.

## Gate (nesta ordem)
1. Forge e Quartzo terminam e avisam o Genesis.
2. **Tester:**
   - typecheck, `test:calc` sem mudar valores esperados, testes novos do motor com conta feita à mão
     (perda, forno, taxa, imposto, sugerido, `null` quando impossível), `test:auth`, `test:backup`,
     `test:campos`, `test:historico`, `build`, `build:scripts`;
   - **ensaio**: 0000–0003 + dados do backup
     `C:\Users\Usuario\Desktop\Form\GIT\custos-carol-backups\backup-2026-11-25T21-29-43-250Z.json` + 0004
     → mesmas contagens; custo/un dos 4 produtos idêntico (4,047833 / 3,368000 / 5,363000 / 5,019628);
     preço por canal herdado = preço atual; 2 canais, 4 formas, 2 taxas (Pix e Dinheiro);
   - navegador num banco descartável: preencher botijão, minutos, perda e taxas, e conferir os números à mão.
3. **Smith:** diff inteiro, migração e motor em especial. APPROVE é condição de aceite.
   Inclui conferir `exigirUsuario` + `alterado_por` em toda action nova.

Ao terminar sua parte: `maestri ask "Genesis" "<resumo: o que fez, arquivos, testes, dúvidas>"`.
