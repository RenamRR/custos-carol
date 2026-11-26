-- Etapa 2 / ADR-002: valores monetários e taxas são séries, nunca sobrescritos.
CREATE TABLE forno_custos (
  id serial PRIMARY KEY,
  preco_botijao numeric(14,4) NOT NULL CHECK (preco_botijao >= 0),
  horas_por_botijao numeric(14,4) NOT NULL CHECK (horas_por_botijao > 0),
  vigente_desde timestamptz NOT NULL DEFAULT now(),
  nota text,
  alterado_por integer REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_forno_custos_vigente ON forno_custos(vigente_desde DESC, id DESC);

ALTER TABLE produtos ADD COLUMN minutos_forno numeric(14,2) NOT NULL DEFAULT 0
  CONSTRAINT produtos_minutos_forno_check CHECK (minutos_forno >= 0);
ALTER TABLE produtos ADD COLUMN perda_pct numeric(5,2) NOT NULL DEFAULT 0
  CONSTRAINT produtos_perda_pct_check CHECK (perda_pct >= 0 AND perda_pct < 90);

CREATE TABLE canais (
  id serial PRIMARY KEY, nome text NOT NULL UNIQUE,
  margem_alvo_pct numeric(5,2) NOT NULL DEFAULT 50 CHECK (margem_alvo_pct BETWEEN 0 AND 95),
  ativo boolean NOT NULL DEFAULT true, ordem integer NOT NULL DEFAULT 0,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  alterado_por integer REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE TABLE formas_pagamento (
  id serial PRIMARY KEY, nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true, ordem integer NOT NULL DEFAULT 0
);
CREATE TABLE forma_pagamento_taxas (
  id serial PRIMARY KEY,
  forma_id integer NOT NULL REFERENCES formas_pagamento(id) ON DELETE RESTRICT,
  taxa_pct numeric(5,2) NOT NULL CHECK (taxa_pct BETWEEN 0 AND 30),
  vigente_desde timestamptz NOT NULL DEFAULT now(),
  alterado_por integer REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_forma_taxas_vigente ON forma_pagamento_taxas(forma_id, vigente_desde DESC, id DESC);
CREATE TABLE canal_formas (
  canal_id integer NOT NULL REFERENCES canais(id) ON DELETE CASCADE,
  forma_id integer NOT NULL REFERENCES formas_pagamento(id) ON DELETE CASCADE,
  PRIMARY KEY (canal_id, forma_id)
);
ALTER TABLE produto_precos ADD COLUMN canal_id integer REFERENCES canais(id) ON DELETE RESTRICT;
CREATE INDEX idx_produto_precos_canal ON produto_precos(produto_id, canal_id, vigente_desde DESC, id DESC);

-- ADR-002: imposto é série e fonte única, não configuração mutável.
CREATE TABLE configuracao_valores (
  id serial PRIMARY KEY, chave text NOT NULL CHECK (chave IN ('imposto_pct')), valor numeric(14,4) NOT NULL,
  vigente_desde timestamptz NOT NULL DEFAULT now(),
  alterado_por integer REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT configuracao_imposto_check CHECK (chave <> 'imposto_pct' OR valor BETWEEN 0 AND 50)
);
CREATE INDEX idx_configuracao_valores_vigente ON configuracao_valores(chave, vigente_desde DESC, id DESC);

INSERT INTO canais(nome, ordem) VALUES ('Encomenda', 0), ('Feira', 1);
INSERT INTO formas_pagamento(nome, ordem) VALUES ('Pix', 0), ('Dinheiro', 1), ('Débito', 2), ('Crédito à vista', 3);
INSERT INTO forma_pagamento_taxas(forma_id, taxa_pct)
  SELECT id, 0 FROM formas_pagamento WHERE nome IN ('Pix', 'Dinheiro');
INSERT INTO canal_formas(canal_id, forma_id) SELECT c.id, f.id FROM canais c CROSS JOIN formas_pagamento f;
INSERT INTO configuracao_valores(chave, valor) VALUES ('imposto_pct', 0);
