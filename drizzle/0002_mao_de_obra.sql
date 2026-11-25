-- Mão de obra entra no custo.
--
-- O valor da hora segue a mesma regra dos outros preços do sistema: nunca é coluna
-- mutável. Vive em histórico e o vigente é o registro mais recente — senão reajustar
-- a hora em dezembro reescreveria o custo de junho.
--
-- Dois tempos por produto, porque eles escalam diferente:
--   preparo    → por LOTE   (bater massa e assar leva o mesmo tempo para 12 ou 16)
--   acabamento → por UNIDADE (cortar, embalar e etiquetar cresce com a quantidade)
-- É isso que faz lote maior sair mais barato por unidade.

create table if not exists custo_hora (
  id            serial primary key,
  valor         numeric(14,4) not null,
  vigente_desde timestamptz not null default now(),
  nota          text,
  constraint custo_hora_valor_check check (valor >= 0)
);

create index if not exists idx_custo_hora_lookup
  on custo_hora (vigente_desde desc, id desc);

-- Começa em zero de propósito: sem valor definido, mão de obra não entra no cálculo
-- e nenhum custo muda. Melhor não custear do que custear com número inventado.
insert into custo_hora (valor, nota)
select 0, 'Valor inicial — definir o custo real da hora'
where not exists (select 1 from custo_hora);

alter table produtos
  add column if not exists minutos_preparo numeric(14,2) not null default 0;

alter table produtos
  add column if not exists minutos_acabamento_un numeric(14,2) not null default 0;

alter table produtos drop constraint if exists produtos_minutos_preparo_check;
alter table produtos
  add constraint produtos_minutos_preparo_check check (minutos_preparo >= 0);

alter table produtos drop constraint if exists produtos_minutos_acabamento_check;
alter table produtos
  add constraint produtos_minutos_acabamento_check check (minutos_acabamento_un >= 0);
