# Etapa 1 — Base do Custos Carol v2

Maestro: Genesis. Leia antes: `C:\Users\Usuario\Desktop\Form\Obsidian\Renam-AI\11 - custos carol\V2-Plano.md`
(decisões fechadas) e `design/mockup-v2.html` (visual **aprovado pelo Renam** em 25/11).

## Objetivo
O app atual (uma página de tabelas de desktop) vira o app de celular do mockup, com login próprio,
**sem perder nenhum dado** da Carol. Paridade de funções com a v1: produtos, receitas (ingrediente por
lote, embalagem por unidade, tempos de preparo/acabamento), insumos, embalagens, valor da hora,
duplicar/remover produto. Vendas, produção, forno, perda e canais **não** entram nesta etapa — vêm
nas etapas 2–5. Não deixe botão que não faz nada: o que não existe ainda não aparece.

## Regras que não mudam
- Preço nunca é coluna mutável: `insumo_precos`, `produto_precos`, `custo_hora` guardam a série.
- O motor `src/lib/calc.ts` e `calc.test.ts` continuam a fonte dos números. Os custos de hoje
  não podem mudar com a etapa 1 (só a interface e o login mudam).
- Migração nova é **aditiva** (0003+). Nunca editar 0000–0002: já rodaram em produção.
- Next 16: leia `node_modules/next/dist/docs/` depois de atualizar — params são async e o layout
  NÃO protege navegação. A checagem de login vai no acesso aos dados (queries e actions).

## Divisão de arquivos (para Forge e Quartzo não pisarem um no outro)

| Dono | Arquivos |
|---|---|
| **Forge** | `package.json`/lockfile, `next.config.ts`, `Dockerfile`, `drizzle/**`, `src/db/**`, `src/lib/**`, `src/app/actions.ts`, `src/lib/auth.ts` (novo), `src/app/entrar/actions.ts` (novo) |
| **Quartzo** | `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `src/app/globals.css` (ou CSS por módulo), `src/components/**`, `public/**` |

Quartzo precisa de dependência ou de dado novo? Pede ao Forge via `maestri ask "Forge" ...` — não
edita arquivo do Forge. Forge precisa mudar uma assinatura do contrato abaixo? Avisa o Quartzo.

## Contrato entre os dois

Continua valendo tudo que existe hoje em `src/app/actions.ts` (mesmas assinaturas, retorno
`Resultado`) e em `src/lib/queries.ts` (`carregarInsumos`, `carregarProdutos`, `carregarCustoHora`,
`carregarHistoricoPrecos`). O Forge acrescenta:

```ts
// src/app/entrar/actions.ts
export async function entrar(estado: unknown, form: FormData): Promise<{ erro?: string }>; // campos "login" e "senha"; em sucesso faz redirect("/")
export async function sair(): Promise<void>;                                                 // apaga a sessão e redirect("/entrar")

// src/lib/auth.ts
export interface Usuario { id: number; login: string; nome: string }
export async function usuarioAtual(): Promise<Usuario | null>; // lê o cookie, sem redirecionar
export async function exigirUsuario(): Promise<Usuario>;       // redirect("/entrar") se não houver sessão
```

Toda query de `queries.ts` e toda action de `actions.ts` chama `exigirUsuario()` primeiro.
Toda escrita de preço grava `alterado_por` com o id do usuário. `PontoHistorico` ganha
`alteradoPor: string | null` (nome de quem mudou).

## Forge
1. Next 15 → 16 (e o que vier junto). Build, typecheck e `test:calc` verdes. Avise o Quartzo quando
   o upgrade estiver no disco.
2. Migração `drizzle/0003_usuarios.sql`:
   - `usuarios (id serial pk, login text unique not null, nome text not null, senha_hash text not null, ativo boolean default true, criado_em timestamptz default now())`
   - `sessoes (id text pk  -- sha256 do token, usuario_id int not null references usuarios on delete cascade, expira_em timestamptz not null, criado_em timestamptz default now())`
   - `alterado_por int references usuarios(id) on delete set null` (nullable) em `insumo_precos`, `produto_precos`, `custo_hora`. Linhas antigas ficam null.
   - Atualize `schema.ts` junto.
3. Auth sem dependência nova: senha com `crypto.scrypt` (salt aleatório de 16 bytes), formato
   `scrypt:<salt_hex>:<hash_hex>` — **sem `$`** (valor com `$` quebra no env do Dokploy).
   Token de sessão = 32 bytes aleatórios; no banco só o sha256. Cookie `httpOnly`, `secure`,
   `sameSite=lax`, 30 dias (Carol usa no celular, não queremos login toda hora). Comparação
   em tempo constante. Limite de tentativas: 5 erros seguidos por login → espera de 5 min.
   Mensagem de erro única ("usuário ou senha incorretos").
4. Criação dos usuários sem shell no container: no `seed.ts`, se `usuarios` estiver vazia e a env
   `USUARIOS_INICIAIS` existir (formato `login|Nome|scrypt:salt:hash;login2|Nome2|scrypt:...`),
   cria os usuários. Gere também `npm run hash-senha -- <senha>` que imprime o hash nesse formato.
   O seed atual (insumos/produtos) continua só agindo com banco vazio — não pode duplicar nada.
5. `exigirUsuario()` em todas as queries e actions; `alterado_por` nas escritas de preço.
6. Testes: `test:calc` intacto; teste novo de hash/verificação de senha e de expiração de sessão.

## Quartzo
Telas do mockup, celular primeiro, mesmas cores/fontes (tokens do mockup viram o CSS do app).
Fontes via `next/font/google` (Fraunces + Plus Jakarta Sans), não por `<link>`.
1. `/entrar` — login. Saudação neutra (ainda não sabemos quem é): nada de "Bom trabalho, Carol!".
   Usa `useActionState(entrar, ...)`. Logo de `design/logo-carol.jpeg` → copie para `public/`.
2. Casca do app: cabeçalho com logo + "Olá, {nome}"; barra inferior **Início · Produtos · Insumos · Mais**
   (Vender e Produzir entram nas etapas 3–4 — não mostre agora).
3. `/` Início — o que dá para mostrar com os dados de hoje: produtos com custo/un, preço, margem e
   etiqueta (≥50% verde, 35–50% âmbar, <35% vermelho — `nivelMargem`), e qual produto está pior.
4. `/produtos` — cards como no mockup (sem colunas de canal: canais são etapa 2; mostre o preço atual).
5. `/produtos/[id]` — detalhe: de onde vem o custo (ingredientes, embalagem, mão de obra) e a edição
   da receita no celular: trocar insumo, quantidade, embalagens por unidade, rendimento, preço,
   tempos. Menu: duplicar, remover (com confirmação na própria página — `confirm()` não serve).
6. `/insumos` — ingredientes e embalagens (duas seções ou abas), editar quantidade/preço/compra,
   adicionar, remover. Mudar preço mostra que vira histórico.
7. `/mais` — valor da hora de trabalho, quem está logado, botão Sair.
- Toques grandes (≥44 px), números com `tabular-nums`, contraste AA (o Quartzo já mediu na etapa 0).
- Estados: carregando, vazio, erro de gravação (mensagem clara do que falhou).

## Fora do escopo
Vendas, produção, forno, perda, canais, alertas, gráficos, tema escuro. Deploy (é do Genesis).
Não faça commit — o Genesis integra e commita depois do gate.

## Gate (nesta ordem)
1. Forge e Quartzo terminam e avisam o Genesis.
2. **Tester:** typecheck, `test:calc`, testes novos, `npm run build`, e **ensaio da migração** em
   PGlite com os dados reais do backup
   `C:\Users\Usuario\Desktop\Form\GIT\custos-carol-backups\backup-2026-11-25T21-29-43-250Z.json`
   (JSON `{ tabelas: { nome: linhas[] } }`, cópia de 25/11 21:29 — **fora do repo, não versionar**): 0000–0002 + dados + 0003 →
   mesmas contagens, e `calcularProduto` dá o mesmo custo/un para cada produto antes e depois.
3. **Guardian:** revisão de segurança do login/sessão/cookies/limite de tentativas.
4. **Smith:** revisão do diff inteiro (migração em especial). APPROVE é condição de aceite.

Ao terminar sua parte, reporte com `maestri ask "Genesis" "<resumo: o que fez, arquivos, testes, dúvidas>"`.
