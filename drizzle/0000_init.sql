-- Custos Carol — schema inicial
-- Aplicar: psql "$DATABASE_URL" -f drizzle/0000_init.sql
-- (ou `npm run db:push` no desenvolvimento)

create table if not exists insumos (
  id          serial primary key,
  nome        text not null,
  tipo        text not null default 'ingrediente',
  embalagem   text not null default '',
  qtd         numeric(14,4) not null,
  unidade     text not null default 'g',
  por_unidade numeric(14,4),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  constraint insumos_tipo_check check (tipo in ('ingrediente', 'embalagem')),
  constraint insumos_qtd_check check (qtd > 0),
  -- item de embalagem precisa saber quanto entra por unidade produzida
  constraint insumos_por_unidade_check check (
    (tipo = 'embalagem' and por_unidade is not null) or
    (tipo = 'ingrediente')
  )
);

create table if not exists insumo_precos (
  id            serial primary key,
  insumo_id     integer not null references insumos(id) on delete cascade,
  preco         numeric(14,4) not null,
  vigente_desde timestamptz not null default now(),
  nota          text,
  constraint insumo_precos_preco_check check (preco >= 0)
);

create index if not exists idx_insumo_precos_lookup
  on insumo_precos (insumo_id, vigente_desde desc);

create table if not exists produtos (
  id          serial primary key,
  nome        text not null,
  rendimento  numeric(14,4) not null default 12,
  markup_alvo numeric(8,2) not null default 3.50,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  constraint produtos_rendimento_check check (rendimento > 0)
);

create table if not exists produto_precos (
  id            serial primary key,
  produto_id    integer not null references produtos(id) on delete cascade,
  preco         numeric(14,4) not null,
  vigente_desde timestamptz not null default now(),
  nota          text,
  constraint produto_precos_preco_check check (preco >= 0)
);

create index if not exists idx_produto_precos_lookup
  on produto_precos (produto_id, vigente_desde desc);

create table if not exists receita_linhas (
  id         serial primary key,
  produto_id integer not null references produtos(id) on delete cascade,
  insumo_id  integer not null references insumos(id) on delete restrict,
  qtd        numeric(14,4) not null,
  alerta     text,
  ordem      integer not null default 0,
  constraint receita_linhas_qtd_check check (qtd >= 0)
);

create index if not exists idx_receita_linhas_produto
  on receita_linhas (produto_id, ordem);

-- Receita não usa item de embalagem como ingrediente: embalagem é rateada por
-- unidade produzida, não lançada por receita. Garantido no seed e na aplicação.
