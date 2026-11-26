-- Etapa 5: aditiva. O alerta de margem é calculado; só o "dispensar" é gravado.
create table alertas_dispensados (
  -- `<instante ISO>|<produtoId>|<canalId>`, validado na action.
  chave text primary key check (length(chave) <= 60),
  dispensado_por integer references usuarios(id) on delete set null,
  dispensado_em timestamptz not null default now()
);

-- Produto que não vai ao forno: forno vale 0 e não fica pendente em "minutos de forno".
alter table produtos add column sem_forno boolean not null default false;
