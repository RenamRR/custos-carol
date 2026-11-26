-- Etapa 6: aditiva. Histórico da receita (foto jsonb gravada por trigger) e embalagem de compra no tempo.
-- Nenhuma função aqui é `security definer`: tudo roda com o papel de quem escreveu.

-- Autoria: as actions fazem `set_config('custos.usuario_id', $1, true)` dentro da transação.
-- Sem a setting (seed, script, psql) o autor fica null ("sistema").
create function custos_usuario_atual() returns integer
language sql stable as $$
  select nullif(current_setting('custos.usuario_id', true), '')::integer
$$;

/* ---------------- embalagem de compra no tempo ---------------- */

-- Cada preço passa a ser "R$ X por Y unidades".
alter table insumo_precos add column qtd_embalagem numeric(14,4);
alter table insumo_precos add column origem text not null default 'preco';
update insumo_precos ip set qtd_embalagem = i.qtd from insumos i where i.id = ip.insumo_id;
alter table insumo_precos alter column qtd_embalagem set not null;
alter table insumo_precos add constraint insumo_precos_qtd_embalagem_check check (qtd_embalagem > 0);
alter table insumo_precos add constraint insumo_precos_origem_check check (origem in ('preco', 'embalagem'));

-- O app nunca informa qtd_embalagem: ela é sempre a do catálogo no momento do registro.
create function insumo_precos_copiar_qtd() returns trigger
language plpgsql as $$
begin
  select i.qtd into new.qtd_embalagem from insumos i where i.id = new.insumo_id;
  return new;
end $$;
create trigger insumo_precos_copiar_qtd before insert on insumo_precos
  for each row execute function insumo_precos_copiar_qtd();

-- Trocou a embalagem de compra: grava o preço vigente com a qtd nova (o BEFORE INSERT copia a qtd).
-- Sem preço anterior não há o que repetir.
create function insumos_embalagem_mudou() returns trigger
language plpgsql as $$
declare
  v_preco numeric;
begin
  select ip.preco into v_preco from insumo_precos ip
    where ip.insumo_id = new.id and ip.vigente_desde <= now()
    order by ip.vigente_desde desc, ip.id desc limit 1;
  if found then
    insert into insumo_precos (insumo_id, preco, origem, alterado_por)
      values (new.id, v_preco, 'embalagem', custos_usuario_atual());
  end if;
  return null;
end $$;
create trigger insumos_embalagem_mudou after update of qtd on insumos
  for each row when (old.qtd is distinct from new.qtd) execute function insumos_embalagem_mudou();

/* ---------------- versões da receita ---------------- */

create table receita_versoes (
  id serial primary key,
  produto_id integer not null references produtos(id) on delete cascade,
  vigente_desde timestamptz not null default now(),
  atualizado_em timestamptz,
  alterado_por integer references usuarios(id) on delete set null,
  receita jsonb not null,
  txid bigint not null default txid_current()
);
create index idx_receita_versoes_lookup on receita_versoes (produto_id, vigente_desde desc, id desc);

-- Foto determinística: linhas e embalagens por (insumo_id, id), nunca por `ordem` (reordenar não é
-- mudança); `alerta` e `ordem` ficam fora. null se o produto não existe.
create function foto_receita(p_produto integer) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'rendimento', p.rendimento,
    'minutosPreparo', p.minutos_preparo,
    'minutosAcabamentoUn', p.minutos_acabamento_un,
    'minutosForno', p.minutos_forno,
    'perdaPct', p.perda_pct,
    'semForno', p.sem_forno,
    'linhas', coalesce((
      select jsonb_agg(jsonb_build_object('insumoId', rl.insumo_id, 'qtd', rl.qtd) order by rl.insumo_id, rl.id)
      from receita_linhas rl where rl.produto_id = p.id), '[]'::jsonb),
    'embalagens', coalesce((
      select jsonb_agg(jsonb_build_object('insumoId', pe.insumo_id, 'qtdPorUnidade', pe.qtd_por_unidade) order by pe.insumo_id, pe.id)
      from produto_embalagens pe where pe.produto_id = p.id), '[]'::jsonb)
  )
  from produtos p where p.id = p_produto
$$;

-- Sessão de edição: a versão mais recente é atualizada (sem mudar vigente_desde) em vez de criar
-- outra quando foi criada nesta transação, ou é do mesmo usuário (não null) e foi tocada há menos
-- de 10 min. Se a foto voltar a ser igual à versão anterior, a versão aberta é apagada.
create function registrar_versao_receita(p_produto integer) returns void
language plpgsql as $$
declare
  v_usuario integer := custos_usuario_atual();
  v_foto jsonb;
  v_ultima receita_versoes%rowtype;
  v_anterior jsonb;
begin
  -- Serializa as edições do mesmo produto: quem chega depois lê a foto e a última versão já com o
  -- que o outro gravou. Produto que não existe (deleção em cascade) não tem o que registrar.
  perform 1 from produtos where id = p_produto for no key update;
  if not found then return; end if;

  v_foto := foto_receita(p_produto);
  select * into v_ultima from receita_versoes
    where produto_id = p_produto order by vigente_desde desc, id desc limit 1 for update;

  if not found then
    -- Primeira versão: o produto nasce com ela.
    insert into receita_versoes (produto_id, vigente_desde, alterado_por, receita)
      select p_produto, p.criado_em, v_usuario, v_foto from produtos p where p.id = p_produto;
    return;
  end if;

  if v_ultima.receita = v_foto then return; end if;

  if v_ultima.txid = txid_current()
     or (v_usuario is not null and v_ultima.alterado_por = v_usuario
         and coalesce(v_ultima.atualizado_em, v_ultima.vigente_desde) > now() - interval '10 minutes') then
    select rv.receita into v_anterior from receita_versoes rv
      where rv.produto_id = p_produto and (rv.vigente_desde, rv.id) < (v_ultima.vigente_desde, v_ultima.id)
      order by rv.vigente_desde desc, rv.id desc limit 1;
    if v_anterior = v_foto then
      delete from receita_versoes where id = v_ultima.id;
    else
      update receita_versoes set receita = v_foto, atualizado_em = now() where id = v_ultima.id;
    end if;
    return;
  end if;

  -- greatest: uma transação que começou antes da última versão e gravou depois dela não pode
  -- virar "passado" (o desempate pelo id, maior, a põe por último).
  insert into receita_versoes (produto_id, vigente_desde, alterado_por, receita)
    values (p_produto, greatest(now(), v_ultima.vigente_desde), v_usuario, v_foto);
end $$;

create function receita_linha_mudou() returns trigger
language plpgsql as $$
begin
  if tg_op <> 'DELETE' then perform registrar_versao_receita(new.produto_id); end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.produto_id is distinct from new.produto_id) then
    perform registrar_versao_receita(old.produto_id);
  end if;
  return null;
end $$;
create trigger receita_linhas_versao after insert or delete or update of insumo_id, qtd, produto_id on receita_linhas
  for each row execute function receita_linha_mudou();
create trigger produto_embalagens_versao after insert or delete or update of insumo_id, qtd_por_unidade, produto_id on produto_embalagens
  for each row execute function receita_linha_mudou();

create function produto_receita_mudou() returns trigger
language plpgsql as $$
begin
  perform registrar_versao_receita(new.id);
  return null;
end $$;
create trigger produtos_versao after insert or update of rendimento, minutos_preparo, minutos_acabamento_un, minutos_forno, perda_pct, sem_forno on produtos
  for each row execute function produto_receita_mudou();

-- Linha de base: a receita de hoje vale desde a criação do produto (inclusive arquivado), sem autor.
-- Insert direto: nenhum trigger acima dispara em receita_versoes, então não há duplicata.
insert into receita_versoes (produto_id, vigente_desde, receita)
  select p.id, p.criado_em, foto_receita(p.id) from produtos p
  where not exists (select 1 from receita_versoes rv where rv.produto_id = p.id)
  order by p.id;
