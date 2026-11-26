-- Aditiva: ativo já existe desde 0000. Autoria específica do arquivamento (ADR-003).
alter table produtos add column arquivado_em timestamptz;
alter table produtos add column arquivado_por integer references usuarios(id) on delete set null;

create table eventos (
  id serial primary key, nome text not null, data date not null,
  custo_fixo numeric not null default 0 check (custo_fixo >= 0), nota text,
  criado_por integer references usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  alterado_por integer references usuarios(id) on delete set null, alterado_em timestamptz,
  cancelado_em timestamptz, cancelado_por integer references usuarios(id) on delete set null
);
create table vendas (
  id serial primary key, vendida_em timestamptz not null default now(),
  canal_id integer not null references canais(id) on delete restrict,
  forma_id integer not null references formas_pagamento(id) on delete restrict,
  evento_id integer references eventos(id) on delete restrict,
  taxa_pct numeric check (taxa_pct between 0 and 30),
  imposto_pct numeric not null check (imposto_pct between 0 and 50), nota text,
  criado_por integer references usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  cancelada_em timestamptz, cancelada_por integer references usuarios(id) on delete set null
);
create table venda_itens (
  id serial primary key,
  venda_id integer not null references vendas(id) on delete cascade,
  produto_id integer not null references produtos(id) on delete restrict,
  quantidade integer not null check (quantidade between 1 and 999),
  preco_un numeric not null check (preco_un >= 0),
  custo_un numeric not null check (custo_un >= 0), produto_nome text not null
);
create index idx_vendas_vendida_em on vendas(vendida_em) where cancelada_em is null;
create index idx_venda_itens_venda on venda_itens(venda_id);
create index idx_venda_itens_produto on venda_itens(produto_id);
create index idx_vendas_evento on vendas(evento_id);
