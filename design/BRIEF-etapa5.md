# Etapa 5 — Histórico, alertas de margem e Início completo (Custos Carol v2)

Maestro: Genesis. As etapas 1–4 estão no ar desde 26/11; a etapa 4 é o commit 664adcb. Antes de começar, leia:
- `C:\Users\Usuario\Desktop\Form\Obsidian\Renam-AI\11 - custos carol\V2-Plano.md`, seção "Histórico e alertas";
- `design/BRIEF-etapa2.md` (motor de custo e margem por canal);
- `design/mockup-v2.html`.

**Quem faz o backend:** o Forge está sem cota até 14h25. O backend desta etapa fica com o **Smith**,
e o Genesis revisa o código dele (regra do gate: código do Smith, Genesis revisa).

## Objetivo
1. **Gráfico do preço de cada insumo** no tempo, com quem mudou.
2. **Custo/un e margem de cada produto** no tempo.
3. **Alerta de margem:** quando uma mudança derruba a margem de um produto abaixo da meta do canal, o app
   mostra o tamanho do estrago, por exemplo: "Nutella na Feira caiu de 52% para 41% depois do aumento do
   creme de avelã (R$ 55 → R$ 68, Carol, 03/12)". A Carol pode dispensar o alerta.
4. **Início completo:** alertas no topo, mês, vender, vendas de hoje, falta preencher, pede atenção e
   "o que mais subiu".
5. Limpeza que ficou das etapas anteriores:
   - produto que não vai ao forno deixa de ficar pendente para sempre;
   - o `markupAlvo` escondido sai do salvar.

## Decisões do Genesis (o Renam deu OK para a etapa em 26/11)
- **Custo no passado = receita de HOJE × valores vigentes naquela data.** A receita não tem histórico
  (rendimento, linhas, perda e minutos são colunas). Todas as séries têm: insumo_precos, custo_hora,
  forno_custos, forma_pagamento_taxas, configuracao_valores e produto_precos. A tela diz isso numa linha:
  "calculado com a receita atual".
- **Reaproveitar o motor, nunca reescrever fórmula:** monte um `Painel` "como era em T" e passe por
  `calcularProduto` + `resumoCanais`. Teste de consistência: o estado em "agora" tem que dar exatamente os
  números de `carregarPainel()`.
- **Regra do alerta.** Para cada instante de mudança T de qualquer série, nos últimos 90 dias, e para cada
  produto ativo × canal ativo:
  - m0 = margem% em T − 1 ms; m1 = margem% em T;
  - alerta se **m1 < meta do canal** e **(m0 ≥ meta, ou m0 − m1 ≥ 2 p.p.)**;
  - a meta é a `margem_alvo_pct` atual;
  - **primeiro preenchimento não alerta**: quando todas as séries que mudaram em T não tinham valor antes
    (a Carol informando botijão ou hora de trabalho pela 1ª vez), não há alerta. Isso é completar o
    custo, não aumento. O "pede atenção" já cobre o estado atual;
  - mudanças no mesmo instante exato viram um alerta só, com todas as causas.
- **Alerta é calculado, não gravado.** Só o "dispensar" é gravado, numa tabela nova (migração 0006).
- **Não vai ao forno:**
  - coluna `produtos.sem_forno boolean not null default false`;
  - com `sem_forno`, o produto não entra em "falta minutos de forno" e o forno vale 0;
  - toggle no detalhe do produto.

## Divisão de arquivos
| Dono | Arquivos |
|---|---|
| **Smith** (backend) | `drizzle/0006_*.sql`, `src/db/**`, `src/lib/**`, `src/app/actions.ts`, `package.json` |
| **Quartzo** | `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `src/app/globals.css`, `src/components/**` |

## Modelo (Smith) — `drizzle/0006_alertas.sql`, aditiva
- `alertas_dispensados`:
  - colunas: `chave text primary key`, `dispensado_por` (FK para usuarios, on delete set null),
    `dispensado_em timestamptz not null default now()`;
  - formato da chave: `<instante ISO>|<produtoId>|<canalId>`, validado na action.
- `produtos.sem_forno boolean not null default false`.
- Backup: confira se `alertas_dispensados` entra, e acrescente no teste de backup.

## Motor (Smith) — `src/lib/linha-do-tempo.ts`, puro, com testes à mão
- `SeriesCusto`: todas as séries cruas, com `id`, `vigenteDesde`, valor e `alteradoPor` (nome).
- `estadoEm(series, base, T)` → o mesmo formato que o motor usa: insumos com preço, custoHora, forno, taxas,
  imposto e preços por canal vigentes em T.
  - Vigente = maior `vigente_desde ≤ T`, desempate por `id` maior. É a mesma regra das queries de hoje.
  - Série sem valor em T: o motor trata como hoje trata "não informado".
- `instantesDeMudanca(series, desde)` → instantes distintos com as causas
  `{ tipo: 'insumo' | 'hora' | 'forno' | 'taxa' | 'imposto' | 'preco', nome, de: number | null, para, alteradoPor }`.
- `serieProduto(produtoId, series, base, desde)` → pontos `{ instante, custoUn, canais: [{ canalId, preco, margemPct }] }`:
  - um ponto por mudança que afeta o produto, mais o ponto inicial em `desde`;
  - é uma série em degrau.
- `serieInsumo(insumoId, series, desde)` → pontos `{ instante, preco, precoPorUnidade, alteradoPor }`.
- `alertasMargem(series, base, canais, desde, agora)` → lista **ordenada pelo estrago (m0 − m1) decrescente**:
  - campos: `{ chave, instante, produtoId, produto, canalId, canal, de, para, meta, causas[] }`.
- `maisSubiram(series, desde, n)` → insumos com maior alta % entre o valor vigente em `desde` e o de agora.
  Ignora insumo sem valor em `desde`.
- **Testes à mão:**
  - aumento que cruza a meta;
  - queda abaixo da meta de 2 p.p. ou mais, já estando abaixo;
  - queda de 1,9 p.p. abaixo da meta, que não alerta;
  - primeiro preenchimento, que não alerta;
  - duas mudanças no mesmo instante, que viram um alerta;
  - empate de `vigente_desde` desempatado por `id`;
  - preço do produto baixado abaixo da meta, que alerta com causa 'preco';
  - consistência de "agora" com `carregarPainel()` num banco real do seed;
  - `sem_forno`.

## Contrato para o Quartzo (Smith confirma com o aviso "contrato no disco")
`src/lib/queries.ts`, todas com `exigirUsuario()`:
- `carregarAlertas()` → alertas dos últimos 90 dias **não dispensados**.
- `carregarHistoricoInsumo(id)` → `{ insumo, pontos }`, 12 meses.
- `carregarHistoricoProduto(id)` → `{ pontos, canais }`, 12 meses.
- `carregarMaisSubiram()` → top 3, 90 dias.

`src/app/actions.ts`:
- `dispensarAlerta(chave)`:
  - valida o formato;
  - grava com `on conflict do nothing`;
  - autoria do usuário.
- `salvarCustoProduto` aceita `semForno`.
- `salvarProduto` deixa de exigir `markupAlvo`, mas continua aceitando por compatibilidade.

## Telas (Quartzo)
1. **Início**, nesta ordem:
   - **alertas**:
     - cartão vermelho/âmbar por alerta, com o máximo de 3 e "ver todos";
     - cada um diz produto, canal, "de X% para Y%", meta e a causa em linguagem de gente;
     - o botão "Ver produto" leva ao detalhe;
     - o botão "Entendi" dispensa;
   - cartão do mês e "Registrar venda agora" (como hoje);
   - vendas de hoje;
   - falta preencher;
   - pede atenção;
   - **"Subiu nos últimos 90 dias"**: top 3 insumos com a variação %, e um toque leva ao histórico do insumo.
2. **Histórico do insumo** (`/insumos/[id]`, e cada insumo da lista ganha um link):
   - gráfico em degrau do preço;
   - tabela das mudanças: data, de → para, variação %, quem.
3. **Detalhe do produto:**
   - seção **"Custo e margem no tempo"**: gráfico em degrau do custo/un e linhas da margem por canal, com a
     meta tracejada; abaixo, a lista das mudanças que mexeram no produto;
   - toggle **"Não vai ao forno"**.
4. **Gráficos** em **SVG próprio, sem biblioteca nova**:
   - eixo com R$ e datas BR;
   - `tabular-nums`;
   - acessível: `role="img"` com `aria-label` que resume a série e tabela visível abaixo;
   - funciona em 390 px;
   - 1 ponto só = estado "ainda sem histórico".
- Toques ≥ 44 px, contraste AA, 390 px sem overflow.

## Fora do escopo
- Histórico de receita (versão de receita), que é a próxima grande melhoria e fica anotada.
- Notificação por WhatsApp ou e-mail.
- Margem realizada das vendas no tempo.

Não faça commit nem deploy: o Genesis integra.

## Gate (nesta ordem)
1. Smith (backend) e Quartzo terminam e avisam o Genesis.
2. **Genesis revisa o backend do Smith.**
3. **Guardian:** passe rápido na action nova e nas queries (login e injeção pela chave).
4. **Tester:**
   - typecheck, todos os `test:*`, `build`, `build:scripts`;
   - **ensaio:** 0000–0005 + backup real + 0006 → contagens e custo/un dos 4 produtos idênticos;
   - **cenário no banco descartável com o backup real:**
     - subir o creme de avelã (Nutella) até cruzar a meta → alerta com os números certos, conferidos à mão;
     - dispensar → some e não volta depois de recarregar;
     - primeiro preenchimento do botijão → sem alerta;
     - histórico do insumo e do produto com os pontos certos;
     - `sem_forno` tira a pendência;
   - navegador 390 px.

Ao terminar sua parte: `maestri ask "Genesis" "<resumo: o que fez, arquivos, testes, dúvidas>"`.
