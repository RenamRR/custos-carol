# Custos Carol

Custeio de produção de brownies. Substitui a planilha original e a calculadora HTML
(`Desktop/custos/calculadora-custos.html`), que ficam como referência.

Documentação e decisões no vault: `11 - custos carol/`.

## Stack

Next.js 15 (App Router) · Postgres · Drizzle · Docker · deploy no Dokploy.

## Regra de ouro do schema

**Preço nunca é coluna mutável.** Preço de insumo e preço de venda vivem só nas tabelas
de histórico (`insumo_precos`, `produto_precos`); o valor atual é o registro mais recente.

Isso dá a série temporal de graça e evita o problema clássico: atualizar o preço do
chocolate em dezembro reescrever a margem de todas as vendas de junho.

## Rodando local

```bash
cp .env.example .env
docker compose up -d db                       # Postgres em localhost:5433
psql "$DATABASE_URL" -f drizzle/0000_init.sql # ou: npm run db:push
npm run db:seed                               # dados da planilha original
npm run dev
```

Sem Docker na máquina, aponte `DATABASE_URL` para um Postgres qualquer — o app não
depende de nada específico do container.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run test:calc` | Confere o motor de cálculo contra a planilha (não precisa de banco) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Aplica o schema no banco |
| `npm run db:seed` | Popula com os dados da planilha (não sobrescreve) |

## Deploy no Dokploy

1. Criar um serviço **Postgres** no Dokploy e anotar a connection string interna.
2. Criar uma **Application** apontando para este repositório, build type **Dockerfile**.
3. Variável de ambiente: `DATABASE_URL` com a string do passo 1.
4. Depois do primeiro deploy, aplicar `drizzle/0000_init.sql` e rodar o seed uma vez.

O `Dockerfile` já sai em modo `standalone` e escuta em `0.0.0.0:3000`; o Traefik do
Dokploy cuida de domínio e HTTPS.

## Verificação

`npm run test:calc` confere contra os números da planilha da Carol:

```
Brownie Tradicional  R$ 3,66/un   3.14x
Brownie Redvelvet    R$ 3,20/un   4.22x
Brownie Cookie       R$ 4,58/un   2.95x
Embalagem            R$ 1,0550 por unidade
```

## Pendência aberta

Quanto de **cacau em gotas meio amargo** entra na receita de 12 unidades? A planilha
lançava custo de 540g mas a tabela de receita dizia 270g. Mantido em 540g, com `alerta`
na linha da receita. Se for 270g: Tradicional cai para R$ 2,96 e Cookie para R$ 3,88.
