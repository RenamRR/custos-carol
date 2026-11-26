# Etapa 6 — Histórico da receita (Custos Carol v2)

Maestro: Genesis. As etapas 1–5 estão no ar desde 26/11; a etapa 5 é o commit e33656f. Antes de começar, leia:
- `design/BRIEF-etapa5.md`;
- `src/lib/linha-do-tempo.ts` (motor da etapa 5);
- `src/lib/consultas-historico.ts`;
- `src/components/HistoricoProdutoSection.tsx`.

## O problema
Hoje o custo do passado é calculado com a **receita de hoje**. A receita inclui:
- linhas (ingrediente e quantidade);
- embalagens por unidade;
- rendimento, minutos de preparo, acabamento e forno;
- perda e `sem_forno`.

Isso causa dois erros:
- se a Carol muda o cacau de 135 g para 150 g, o gráfico de junho passa a mostrar o custo com 150 g;
- a mudança na receita nunca gera alerta de margem.

O mesmo vale para a **embalagem de compra do insumo** (`insumos.qtd`). Se a Carol troca o pacote de 500 g por um
de 1 kg, o preço antigo passa a ser dividido por 1.000 g.

## Decisões do Genesis (o Renam pediu a etapa em 26/11)
1. **Versão da receita = foto completa (jsonb), gravada por trigger no banco.**
   - Nenhum caminho de escrita esquece de gravar: action, seed, script ou action futura.
   - A autoria vem de `set_config('custos.usuario_id', <id>, true)`, que as actions definem dentro da
     transação. Sem ela, `alterado_por` fica null ("sistema").
2. **Sessão de edição:** a Carol edita campo a campo (autosave), e cada campo salvo não pode virar uma versão.
   - A versão mais recente do produto é **atualizada em vez de criar outra** quando:
     - foi criada na mesma transação; ou
     - é do mesmo usuário (não null) e foi tocada há menos de 10 minutos (janela deslizante).
   - Ao atualizar, `vigente_desde` **não muda**: a chave dos alertas fica estável. Só muda `atualizado_em`.
   - Se a foto nova for igual à versão anterior (ela mudou e voltou atrás), a versão aberta é apagada.
   - Foto igual à última → nada acontece.
3. **Embalagem de compra no tempo:** coluna nova `insumo_precos.qtd_embalagem`. Cada preço passa a ser "R$ X
   por Y unidades".
   - Um trigger BEFORE INSERT sempre copia `insumos.qtd`.
   - Um trigger AFTER UPDATE em `insumos`, quando `qtd` muda de verdade, grava uma linha nova com o
     preço vigente e a qtd nova.
   - Coalescência na action `salvarPrecoInsumo`: se a linha mais recente veio desse trigger
     (`origem = 'embalagem'`), é do mesmo usuário e tem menos de 10 min, a action **atualiza o preço dela**
     em vez de inserir. Assim "troquei o pacote e o preço" vira uma mudança só, sem degrau falso no meio.
4. **Linha de base:** a migração grava, para cada produto (inclusive arquivado), a versão da receita
   como ela está hoje.
   - `vigente_desde = produtos.criado_em`, `alterado_por` null.
   - O passado anterior à migração continua usando a receita atual, que é o melhor dado que existe.
5. **Preencher não é mudar** (mesma regra da etapa 5): uma versão cujas únicas diferenças são campos
   numéricos que estavam em 0 e passaram a ter valor não gera alerta.
   - Exemplos: minutos de forno 0 → 40, preparo 0 → 30.
   - A primeira versão de um produto também não gera alerta.
6. **Insumo com histórico não é apagado.** `removerInsumo` passa a arquivar (`ativo = false`) quando o insumo
   aparece em alguma versão de receita; senão, apaga como hoje. Os preços dele (cascade) somem junto se
   apagar, então arquivar protege a história.

## Divisão de arquivos
| Dono | Arquivos |
|---|---|
| **Forge** (backend) | `drizzle/0007_*.sql`, `src/db/**`, `src/lib/**`, `src/app/actions.ts`, `package.json` |
| **Quartzo** | `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `src/app/globals.css`, `src/components/**` |

## Modelo (Forge) — `drizzle/0007_receita_versoes.sql`, aditiva
**Tabela `receita_versoes`:**
- `id serial pk`;
- `produto_id` → produtos, on delete cascade;
- `vigente_desde timestamptz not null default now()`;
- `atualizado_em timestamptz`;
- `alterado_por` → usuarios, on delete set null;
- `receita jsonb not null`;
- `txid bigint not null default txid_current()`;
- índice `(produto_id, vigente_desde desc, id desc)`.

**Formato da foto**, determinístico para a comparação com `=` funcionar:
```json
{ "rendimento": 12, "minutosPreparo": 30, "minutosAcabamentoUn": 1, "minutosForno": 40,
  "perdaPct": 5, "semForno": false,
  "linhas": [{ "insumoId": 3, "qtd": 135 }],
  "embalagens": [{ "insumoId": 9, "qtdPorUnidade": 1 }] }
```
- Números são números jsonb (numeric → `to_jsonb`).
- `linhas` e `embalagens` ficam ordenadas por `insumo_id, id`, e **não** por `ordem`, para que reordenar não
  crie versão.
- `alerta` e `ordem` ficam fora.

**Função `registrar_versao_receita(p_produto int)`**, em plpgsql:
- produto não existe (por exemplo, numa deleção em cascade) → sai sem fazer nada;
- monta a foto; trava a última versão com `for update`;
- aplica as regras de sessão e coalescência da decisão 2.

**Triggers AFTER ... FOR EACH ROW:**
- `receita_linhas`: insert, delete, e update de `insumo_id`, `qtd` ou `produto_id`. Se o produto mudar,
  registra os dois produtos.
- `produto_embalagens`: insert, delete, e update de `insumo_id`, `qtd_por_unidade` ou `produto_id`.
- `produtos`: insert, e update de rendimento, minutos_*, perda_pct ou sem_forno.

**Embalagem de compra:**
- `insumo_precos` ganha `qtd_embalagem numeric(14,4)` e `origem text not null default 'preco'`, com
  check `in ('preco','embalagem')`.
- Backfill de `qtd_embalagem` com o `insumos.qtd` atual; depois disso, `not null`.
- Triggers da decisão 3.
  - O de `insumos` só dispara se `old.qtd is distinct from new.qtd` e se existir preço anterior.
  - Ele usa `origem = 'embalagem'` e a autoria da setting.

**Linha de base** (decisão 4): na migração, depois de criar os triggers. Cuidado para os triggers não
duplicarem as versões.

**Backup:** confira que `receita_versoes` entra no dump e acrescente no teste de backup.

## Autoria nas actions (Forge)
- Criar o helper `comAutor(usuarioId, fn)`:
  - abre a transação;
  - roda `select set_config('custos.usuario_id', $1::text, true)` parametrizado, nunca interpolado;
  - chama `fn(tx)`.
- Passam a usá-lo todas as actions que tocam receita, produto ou `insumos.qtd`:
  - `salvarProduto`, `criarProduto`, `duplicarProduto`, `salvarCustoProduto`;
  - `criarLinha`, `salvarLinha`, `removerLinha`;
  - `criarEmbalagemProduto`, `salvarEmbalagemProduto`, `removerEmbalagemProduto`;
  - `salvarInsumo`, `salvarPrecoInsumo`, `removerProduto`.
- O comportamento visível e as mensagens das actions não mudam.

## Motor (Forge) — `src/lib/linha-do-tempo.ts`
**Séries novas em `SeriesCusto`:**
- `receitas: (Registro & { produtoId; receita: FotoReceita })[]`;
- `insumos[]` ganha `qtdEmbalagem`.

**`BaseCusto`:**
- `insumos` passa a trazer **todos** os insumos, inclusive arquivados, com `ativo`;
- os cálculos de hoje (`maisSubiram`, alertas) continuam só com os ativos onde já era assim.

**`estadoEm(T)`:**
- a receita de cada produto é a versão vigente em T (maior `vigente_desde ≤ T`, desempate pelo maior `id`),
  aplicada sobre o produto base (id, nome e preços continuam vindo de onde vêm hoje);
- **produto sem versão em T não existe em T** e fica fora do painel;
- a qtd de cada insumo é a `qtdEmbalagem` do preço vigente; sem preço, usa a qtd do catálogo.

**`instantesDeMudanca`** inclui os instantes das versões e da embalagem.
- Causa nova `tipo: 'receita'` com os campos:
  - `nome` = nome do produto;
  - `de`/`para` = custo/un do produto antes e depois (`de` null na primeira versão);
  - `produtoId`;
  - `mudancas: MudancaReceita[]`;
  - `preenchimento: boolean` (decisão 5).
- `MudancaReceita` tem duas formas:
  - campo da receita: `{ campo: 'rendimento'|'minutosPreparo'|'minutosAcabamentoUn'|'minutosForno'|'perdaPct'|'semForno', de, para }`;
  - insumo: `{ campo: 'ingrediente'|'embalagem', insumoId, nome, unidade, de: number|null, para: number|null }`, em que null quer dizer adicionado ou removido.
  - Insumo repetido em duas linhas soma as quantidades.
- Causa `insumo`:
  - ganha `qtdDe`/`qtdPara`;
  - é efetiva se o preço **ou** a qtd mudou.

**Regras que mudam:**
- `afeta`:
  - receita afeta só o próprio produto;
  - insumo afeta o produto se ele usa o insumo antes **ou** depois de T.
- `alertasMargem`:
  - produto sem versão em T − 1 é pulado (está nascendo);
  - a regra "primeiro preenchimento" passa a ser `causas.every(c => c.de === null || c.preenchimento)`.
- `serieProduto`:
  - o primeiro ponto é em `desde` ou no nascimento do produto, o que vier depois;
  - a receita da versão anterior vira causa com o diff.
- `serieInsumo`: `precoPorUnidade` usa a `qtdEmbalagem` do próprio registro, e cada ponto ganha `qtdEmbalagem`.
- `maisSubiram`:
  - compara o **preço por unidade**;
  - `InsumoQueSubiu` ganha `qtdDe`/`qtdPara`;
  - `variacaoPct` é por unidade.

**Query nova** em `queries.ts`, com `exigirUsuario()`: `carregarHistoricoReceita(produtoId)`.
- Devolve a lista de versões, da mais recente para a mais antiga:
  `{ id, vigenteDesde, alteradoPor, receita (linhas com nome/unidade do insumo), custoUn, mudancas, preenchimento }`.
- `custoUn` é o custo/un em `vigente_desde` daquela versão.
- Mesma transação read-only e repeatable-read de `comHistorico`.

**Testes à mão** (`linha-do-tempo.test.ts` e `-db.test.ts` com pglite):
- 10 saves de campos na mesma sessão viram 1 versão;
- outro usuário cria versão nova;
- 11 minutos depois cria versão nova;
- mudar e voltar atrás apaga a versão aberta;
- save idêntico não cria nada;
- `duplicarProduto` dá 1 versão para o produto novo;
- deletar produto em cascade não quebra;
- cacau de 135 para 150 g:
  - o custo antes de T usa 135 e o custo depois usa 150;
  - gera o alerta com a causa `receita` e o diff certo;
- preencher os minutos de forno não gera alerta;
- produto criado depois de `desde` começa no nascimento;
- pacote de 500 g por R$ 20 trocado por 1 kg por R$ 38 na mesma sessão:
  - é **um** registro;
  - o custo por g é o certo antes e depois;
  - não há degrau falso;
- `removerInsumo` arquiva o insumo com história;
- **consistência:** `painelEm(agora)` igual a `carregarPainel()` no banco real do seed **e** depois de uma
  sequência de edições;
- **check:** para cada produto, a última versão é igual à foto montada das tabelas. Acrescente esse check ao
  `db:verify`.

## Contrato para o Quartzo (o Forge confirma com o aviso "contrato no disco")
- Tipos novos exportados de `linha-do-tempo.ts`: `FotoReceita`, `MudancaReceita`, `VersaoReceita`.
- `carregarHistoricoProduto` sai igual; as causas agora podem ser do tipo `receita`.
- `carregarHistoricoReceita(id)` → `VersaoReceita[] | null`.

## Telas (Quartzo)
1. **Detalhe do produto → seção nova "Histórico da receita"**, abaixo de "Custo e margem no tempo":
   - lista da versão mais recente para a mais antiga. Cada versão mostra:
     - data e hora;
     - quem mudou;
     - custo/un ("R$ 4,05 → R$ 4,32");
     - o que mudou, em linguagem de gente: "Cacau em pó: 135 g → 150 g", "+ Nozes 50 g", "− Açúcar
       (era 200 g)", "Rende 12 → 10 un", "Forno: 0 → 40 min (preenchido)", "Não vai mais ao forno";
   - mostra 5 versões e um botão "ver todas";
   - a linha de base aparece como "Receita registrada" com a lista completa;
   - cada versão tem `<details>` "ver a receita como era", com os ingredientes e as embalagens daquela versão;
   - estado com 1 versão só: "Ainda sem mudanças na receita".
2. **"Custo e margem no tempo":**
   - sai a frase "calculado com a receita atual";
   - as mudanças do tipo receita aparecem com o diff resumido (até 2 itens e "+N").
3. **Alerta de margem com causa receita**, por exemplo: "depois da mudança na receita (Cacau em pó 135 g → 150 g,
   Carol, 03/12)".
4. **Histórico do insumo:**
   - a tabela mostra a embalagem quando ela muda: "R$ 20,00 · 500 g → R$ 38,00 · 1.000 g";
   - se a embalagem mudou dentro da janela, o gráfico plota o **preço por kg, L ou un** (g → kg, ml → L)
     e diz isso no título do eixo;
   - se a embalagem não mudou, o gráfico fica como está.
5. **"Subiu nos últimos 90 dias":** mostra a variação por unidade. Quando a embalagem mudou, aparece
   "(embalagem mudou)".
- Toques ≥ 44 px, contraste AA, 390 px sem overflow, `tabular-nums`.

## Fora do escopo
- Venda lançada em "outro dia" usar o custo daquela data. Depois desta etapa vira fácil; fica anotado.
- Mudança de `unidade` do insumo (g → kg), que continua sem histórico.
- Restaurar uma versão antiga da receita (botão "voltar para esta").

Não faça commit nem deploy: o Genesis integra.

## Gate (nesta ordem)
1. Forge e Quartzo terminam e avisam o Genesis.
2. **Smith:** diff inteiro, com atenção a:
   - plpgsql (concorrência, `for update`, cascade);
   - coalescência;
   - determinismo da foto;
   - consistência com `calc.ts`.

   APPROVE é condição de aceite.
3. **Guardian:** `set_config` parametrizado, sem injeção, `exigirUsuario` na query nova, trigger sem
   `security definer`.
4. **Tester:**
   - typecheck, todos os `test:*`, `build`, `build:scripts`, `db:verify`;
   - **ensaio:** 0000–0006 + backup real + 0007, conferindo:
     - contagens iguais;
     - 1 versão de base por produto;
     - custo/un dos 4 produtos idêntico (4,05 / 3,37 / 5,36 / 5,02);
     - check da última versão igual às tabelas OK;
   - **cenário no banco descartável com o backup real:**
     - editar a receita do Nutella em vários campos dentro de 10 min → 1 versão;
     - o gráfico antes e depois está certo;
     - o alerta tem o diff certo;
     - preencher os minutos de forno não gera alerta;
     - trocar o pacote do cacau (500 g → 1 kg + preço novo) gera 1 registro, com o custo por g certo;
   - navegador 390 px.

Ao terminar sua parte: `maestri ask "Genesis" "<resumo: o que fez, arquivos, testes, dúvidas>"`.
