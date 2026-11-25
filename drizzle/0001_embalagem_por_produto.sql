-- Embalagem deixa de ser global e passa a ser escolhida por produto.
--
-- Antes: todo item com tipo='embalagem' era somado e aplicado a TODOS os produtos.
-- Uma marmita pagava tag, caixa, saquinho e sizal mesmo sem usar nenhum deles.
--
-- Agora: `insumos` (tipo='embalagem') é só catálogo, com o custo unitário.
-- Cada produto declara em `produto_embalagens` o que usa e quanto por unidade produzida.

create table if not exists produto_embalagens (
  id              serial primary key,
  produto_id      integer not null references produtos(id) on delete cascade,
  insumo_id       integer not null references insumos(id) on delete restrict,
  qtd_por_unidade numeric(14,4) not null default 1,
  ordem           integer not null default 0,
  constraint produto_embalagens_qtd_check check (qtd_por_unidade >= 0),
  constraint produto_embalagens_unico unique (produto_id, insumo_id)
);

create index if not exists idx_produto_embalagens_produto
  on produto_embalagens (produto_id, ordem);

-- Preserva o estado atual: como o cálculo antigo aplicava todo item de embalagem
-- a todo produto, o equivalente exato é ligar todos a todos com o `por_unidade` vigente.
-- Os custos por unidade não mudam com esta migração.
insert into produto_embalagens (produto_id, insumo_id, qtd_por_unidade, ordem)
select
  p.id,
  i.id,
  coalesce(i.por_unidade, 1),
  (row_number() over (partition by p.id order by i.id)) - 1
from produtos p
cross join insumos i
where i.tipo = 'embalagem'
  and i.ativo
  and p.ativo
on conflict (produto_id, insumo_id) do nothing;

-- `por_unidade` era propriedade do catálogo; agora é da relação produto↔embalagem.
alter table insumos drop constraint if exists insumos_por_unidade_check;
alter table insumos drop column if exists por_unidade;
