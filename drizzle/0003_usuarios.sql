-- Etapa 1 / ADR-001 v1.1.0. Aditiva: históricos antigos mantêm autor NULL.
CREATE TABLE usuarios (
  id serial PRIMARY KEY,
  login text NOT NULL UNIQUE,
  nome text NOT NULL,
  senha_hash text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  falhas_login integer NOT NULL DEFAULT 0 CONSTRAINT usuarios_falhas_login_check CHECK (falhas_login >= 0),
  bloqueado_ate timestamptz,
  CONSTRAINT usuarios_login_normalizado CHECK (login = lower(btrim(login)) AND length(login) BETWEEN 1 AND 100)
);

CREATE TABLE sessoes (
  id text PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessoes_usuario ON sessoes(usuario_id);

ALTER TABLE insumo_precos ADD COLUMN alterado_por integer REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE produto_precos ADD COLUMN alterado_por integer REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE custo_hora ADD COLUMN alterado_por integer REFERENCES usuarios(id) ON DELETE SET NULL;
