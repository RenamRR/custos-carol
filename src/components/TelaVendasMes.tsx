"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelarEvento, cancelarVenda, criarEvento, salvarEvento } from "@/app/actions";
import { brl, parseNumeroBR } from "@/lib/calc";
import { CANAL_FEIRA, diaSaoPaulo, FUSO_VENDAS, type DadosMes, type Evento, type TotaisVenda, type VendaDetalhada } from "@/lib/vendas";
import { paraPreco, useSalvar } from "./useSalvar";

function nomeMesAno(ano: number, mes: number): string {
  const data = new Date(Date.UTC(ano, mes - 1, 15, 12, 0, 0));
  const txt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(data);
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function deslocarMes(ano: number, mes: number, delta: number): string {
  const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatarDiaGrupo(isoDia: string): string {
  const d = new Date(`${isoDia}T15:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_VENDAS,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(d);
}

function formatarHoraSP(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_VENDAS,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatarDataCurta(isoDia: string): string {
  const [, m, d] = isoDia.split("-");
  return `${d}/${m}`;
}

function CartaoFeira({
  evento,
  resumo,
}: {
  evento: Evento;
  resumo?: (Evento & TotaisVenda) | undefined;
}) {
  const router = useRouter();
  const { pendente, erro, limparErro, salvar } = useSalvar();
  const [editando, setEditando] = useState(false);
  const [confirmarCancel, setConfirmarCancel] = useState(false);

  const [nome, setNome] = useState(evento.nome);
  const [data, setData] = useState(evento.data);
  const [custoFixo, setCustoFixo] = useState(paraPreco(evento.custoFixo));

  const cancelado = evento.canceladoEm !== null;

  function aoSalvarEdicao() {
    limparErro();
    salvar(
      () => salvarEvento(evento.id, { nome, data, custoFixo }),
      () => {
        setEditando(false);
        router.refresh();
      },
    );
  }

  function aoCancelarFeira() {
    limparErro();
    salvar(
      () => cancelarEvento(evento.id),
      () => {
        setConfirmarCancel(false);
        router.refresh();
      },
    );
  }

  return (
    <div className={`feira-card${cancelado ? " feira-card--cancelada" : ""}${pendente ? " salvando" : ""}`}>
      <div className="resumo-row-top">
        <div>
          <strong className={cancelado ? "venda-strike" : ""}>{evento.nome}</strong>
          <div className="recent-meta tnum">
            {formatarDataCurta(evento.data)} · fixo {brl(evento.custoFixo)}
          </div>
        </div>
        {cancelado ? (
          <span className="badge badge--crit">Cancelada</span>
        ) : resumo ? (
          <div style={{ textAlign: "right" }}>
            <strong className="tnum" style={{ color: resumo.lucro >= 0 ? "var(--good)" : "var(--crit)" }}>
              {brl(resumo.lucro)}
            </strong>
            <div className="recent-meta tnum">
              {resumo.unidades} un · {brl(resumo.faturamento)}
            </div>
          </div>
        ) : null}
      </div>

      {!cancelado && !editando && !confirmarCancel && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-sugerido"
            style={{ minHeight: 40, padding: "4px 12px" }}
            onClick={() => {
              limparErro();
              setNome(evento.nome);
              setData(evento.data);
              setCustoFixo(paraPreco(evento.custoFixo));
              setEditando(true);
            }}
          >
            Editar feira
          </button>
          <button
            type="button"
            className="btn btn-danger-soft"
            style={{ minHeight: 40, padding: "4px 12px", fontSize: 13 }}
            onClick={() => {
              limparErro();
              setConfirmarCancel(true);
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {editando && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <div className="field-group">
            <label className="field-label" htmlFor={`ev-nome-${evento.id}`}>
              Nome
            </label>
            <input
              id={`ev-nome-${evento.id}`}
              className="field-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="form-grid-2">
            <div className="field-group">
              <label className="field-label" htmlFor={`ev-data-${evento.id}`}>
                Data
              </label>
              <input
                id={`ev-data-${evento.id}`}
                type="date"
                className="field-input tnum"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor={`ev-custo-${evento.id}`}>
                Custo fixo (R$)
              </label>
              <input
                id={`ev-custo-${evento.id}`}
                className="field-input field-input--num"
                inputMode="decimal"
                value={custoFixo}
                onChange={(e) => setCustoFixo(e.target.value)}
                onBlur={() => setCustoFixo(paraPreco(parseNumeroBR(custoFixo)))}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-choco" disabled={pendente} onClick={aoSalvarEdicao}>
              Salvar
            </button>
            <button type="button" className="btn btn-soft" onClick={() => setEditando(false)}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {confirmarCancel && (
        <div className="confirm-box">
          <p>Cancelar a feira &ldquo;{evento.nome}&rdquo;?</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              disabled={pendente}
              onClick={aoCancelarFeira}
            >
              Confirmar
            </button>
            <button type="button" className="btn btn-soft" onClick={() => setConfirmarCancel(false)}>
              Manter
            </button>
          </div>
        </div>
      )}

      {erro && (
        <div className="banner-erro" role="alert">
          {erro}
        </div>
      )}
    </div>
  );
}

function CartaoVenda({
  venda,
  nomeEvento,
}: {
  venda: VendaDetalhada;
  nomeEvento?: string;
}) {
  const router = useRouter();
  const { pendente, erro, limparErro, salvar } = useSalvar();
  const [confirmando, setConfirmando] = useState(false);

  const cancelada = venda.canceladaEm !== null;
  const { faturamento, lucro } = venda.resultado;

  function confirmarCancelamento() {
    limparErro();
    salvar(
      () => cancelarVenda(venda.id),
      () => {
        setConfirmando(false);
        router.refresh();
      },
    );
  }

  return (
    <div className={`venda-card${cancelada ? " venda-card--cancelada" : ""}${pendente ? " salvando" : ""}`}>
      <div className="resumo-row-top">
        <div style={{ minWidth: 0 }}>
          <div className={`recent-main tnum${cancelada ? " venda-strike" : ""}`}>
            {venda.itens.map((i) => `${i.quantidade}× ${i.produtoNome}`).join(" + ")}
          </div>
          <div className="recent-meta tnum">
            {formatarHoraSP(venda.vendidaEm)} ·{" "}
            {venda.canalNome === CANAL_FEIRA
              ? nomeEvento || "Feira · porta a porta"
              : venda.canalNome}{" "}
            · {venda.formaNome}
            {venda.taxaPct === null ? " (sem taxa)" : ""}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className={`recent-val tnum${cancelada ? " venda-strike" : ""}`}>
            {brl(faturamento)}
          </div>
          {cancelada ? (
            <span className="badge badge--crit">Cancelada</span>
          ) : (
            <div className="recent-meta tnum">lucro {brl(lucro)}</div>
          )}
        </div>
      </div>

      {!cancelada && !confirmando && (
        <div>
          <button
            type="button"
            className="btn btn-danger-soft"
            style={{ minHeight: 40, padding: "4px 12px", fontSize: 12.5 }}
            onClick={() => {
              limparErro();
              setConfirmando(true);
            }}
          >
            Cancelar venda
          </button>
        </div>
      )}

      {confirmando && (
        <div className="confirm-box">
          <p>Cancelar esta venda? Ela sairá das contas do mês e não pode ser desfeita.</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              disabled={pendente}
              onClick={confirmarCancelamento}
            >
              {pendente ? "Cancelando..." : "Sim, cancelar"}
            </button>
            <button type="button" className="btn btn-soft" onClick={() => setConfirmando(false)}>
              Manter
            </button>
          </div>
        </div>
      )}

      {erro && (
        <div className="banner-erro" role="alert">
          {erro}
        </div>
      )}
    </div>
  );
}

export function TelaVendasMes({ dados }: { dados: DadosMes }) {
  const router = useRouter();
  const novaFeiraSave = useSalvar();
  const [criandoFeira, setCriandoFeira] = useState(false);
  const [feiraNome, setFeiraNome] = useState("");
  const [feiraData, setFeiraData] = useState(
    `${dados.ano}-${String(dados.mes).padStart(2, "0")}-01`,
  );
  const [feiraCusto, setFeiraCusto] = useState("0,00");

  const { totais, porProduto, porCanal, feiras, custoFeiraSemVenda } = dados.resumo;
  const mesAnterior = deslocarMes(dados.ano, dados.mes, -1);
  const mesProximo = deslocarMes(dados.ano, dados.mes, 1);

  const eventoPorId = new Map(dados.eventos.map((e) => [e.id, e]));
  const feiraResumoPorId = new Map(feiras.map((f) => [f.id, f]));

  // Agrupa vendas por dia no fuso America/Sao_Paulo preservando a ordem mais nova -> antiga
  const diasOrdenados: { dia: string; vendas: VendaDetalhada[] }[] = [];
  for (const venda of dados.vendas) {
    const dia = diaSaoPaulo(venda.vendidaEm);
    const ultimo = diasOrdenados[diasOrdenados.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.vendas.push(venda);
    else diasOrdenados.push({ dia, vendas: [venda] });
  }

  function aoCriarFeira() {
    novaFeiraSave.limparErro();
    novaFeiraSave.salvar(
      () => criarEvento({ nome: feiraNome, data: feiraData, custoFixo: feiraCusto || "0" }),
      () => {
        setCriandoFeira(false);
        setFeiraNome("");
        setFeiraCusto("0,00");
        router.refresh();
      },
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Vendas do mês</h1>
          <p className="page-sub">Faturamento, custo salvo no dia, taxas e lucro</p>
        </div>
        <Link href="/vender" className="btn btn-mustard">
          + Vender
        </Link>
      </div>

      <div className="month-switcher" aria-label="Selecionar mês">
        <Link href={`/vendas?mes=${mesAnterior}`} className="month-nav-btn">
          &lsaquo; Anterior
        </Link>
        <h2 className="month-nav-title">{nomeMesAno(dados.ano, dados.mes)}</h2>
        <Link href={`/vendas?mes=${mesProximo}`} className="month-nav-btn">
          Próximo &rsaquo;
        </Link>
      </div>

      {totais.vendasSemTaxa > 0 && (
        <div className="banner-aviso" role="status">
          <b className="tnum">
            {totais.vendasSemTaxa}{" "}
            {totais.vendasSemTaxa === 1 ? "venda sem taxa informada" : "vendas sem taxa informada"}
          </b>
          : ela entra com taxa zero.{" "}
          <Link href="/mais#formas-pagamento" style={{ color: "inherit", fontWeight: 800 }}>
            Informar taxas em Mais &rarr;
          </Link>
        </div>
      )}

      {totais.vendas === 0 && dados.eventos.length === 0 ? (
        <div className="estado-vazio">
          <h2>Nenhuma venda neste mês</h2>
          <p>Quando você registrar vendas ou feiras em {nomeMesAno(dados.ano, dados.mes)}, os totais aparecem aqui.</p>
          <Link href="/vender" className="btn btn-mustard">
            Registrar primeira venda
          </Link>
        </div>
      ) : (
        <>
          <section className="hero-card" aria-label="Resumo financeiro do mês">
            <div className="hero-top">
              <span className="hero-kicker">Lucro líquido no mês</span>
              <span className="hero-pill tnum">Margem {totais.margemPct.toFixed(0)}%</span>
            </div>
            <div className="hero-profit tnum">{brl(totais.lucro)}</div>
            <div className="hero-grid">
              <div>
                <div className="hero-stat-label">Faturamento</div>
                <div className="hero-stat-val tnum">{brl(totais.faturamento)}</div>
                <div className="hero-stat-sub tnum">
                  Custo {brl(totais.custo)} · taxas {brl(totais.taxas)}
                </div>
              </div>
              <div>
                <div className="hero-stat-label">Vendidos no mês</div>
                <div className="hero-stat-val tnum">{totais.unidades} un</div>
                <div className="hero-stat-sub tnum">
                  {totais.vendas} {totais.vendas === 1 ? "venda" : "vendas"}
                </div>
              </div>
            </div>
            <div className="hero-stat-sub tnum" style={{ paddingTop: 4 }}>
              Custo das feiras: <b>{brl(totais.custoFeiras)}</b>
              {custoFeiraSemVenda > 0 ? ` (inclui ${brl(custoFeiraSemVenda)} sem venda)` : ""}
            </div>
          </section>

          {porCanal.length > 0 && (
            <section className="card" aria-label="Por canal">
              <h2 className="section-heading" style={{ marginBottom: 10 }}>
                Por canal
              </h2>
              <div className="resumo-list">
                {porCanal.map((g) => (
                  <div key={`${g.id}-${g.nome}`} className="resumo-row">
                    <div className="resumo-row-top">
                      <strong>{g.nome}</strong>
                      <strong className="tnum" style={{ color: g.lucro >= 0 ? "var(--good)" : "var(--crit)" }}>
                        {brl(g.lucro)} ({g.margemPct.toFixed(0)}%)
                      </strong>
                    </div>
                    <div className="resumo-row-sub tnum">
                      <span>
                        {g.unidades} un · faturamento {brl(g.faturamento)}
                      </span>
                      <span>
                        {g.custoFeiras > 0 ? `feiras ${brl(g.custoFeiras)}` : `${g.vendas} vendas`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {porProduto.length > 0 && (
            <section className="card" aria-label="Por produto">
              <h2 className="section-heading" style={{ marginBottom: 10 }}>
                Por produto
              </h2>
              <div className="resumo-list">
                {porProduto.map((g) => (
                  <div key={g.id} className="resumo-row">
                    <div className="resumo-row-top">
                      <strong>{g.nome}</strong>
                      <strong className="tnum" style={{ color: g.lucro >= 0 ? "var(--good)" : "var(--crit)" }}>
                        {brl(g.lucro)} ({g.margemPct.toFixed(0)}%)
                      </strong>
                    </div>
                    <div className="resumo-row-sub tnum">
                      <span>
                        {g.unidades} un · {brl(g.faturamento)}
                      </span>
                      <span>
                        custo {brl(g.custo + g.custoFeiras)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card" aria-label="Feiras do mês">
            <div className="section-row" style={{ marginBottom: 10 }}>
              <h2 className="section-heading">Feiras</h2>
              <button
                type="button"
                className="btn-sugerido"
                style={{ minHeight: 40, padding: "4px 12px" }}
                onClick={() => setCriandoFeira((v) => !v)}
              >
                {criandoFeira ? "Fechar" : "+ Nova feira"}
              </button>
            </div>

            {criandoFeira && (
              <div className="canal-config-card" style={{ marginBottom: 10 }}>
                <div className="field-group">
                  <label className="field-label" htmlFor="mes-nova-feira-nome">
                    Nome
                  </label>
                  <input
                    id="mes-nova-feira-nome"
                    className="field-input"
                    placeholder="Ex.: Feira de Domingo"
                    value={feiraNome}
                    onChange={(e) => setFeiraNome(e.target.value)}
                  />
                </div>
                <div className="form-grid-2">
                  <div className="field-group">
                    <label className="field-label" htmlFor="mes-nova-feira-data">
                      Data
                    </label>
                    <input
                      id="mes-nova-feira-data"
                      type="date"
                      className="field-input tnum"
                      value={feiraData}
                      onChange={(e) => setFeiraData(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="mes-nova-feira-custo">
                      Custo fixo (R$)
                    </label>
                    <input
                      id="mes-nova-feira-custo"
                      className="field-input field-input--num"
                      inputMode="decimal"
                      value={feiraCusto}
                      onChange={(e) => setFeiraCusto(e.target.value)}
                    />
                  </div>
                </div>
                {novaFeiraSave.erro && (
                  <div className="banner-erro" role="alert">
                    {novaFeiraSave.erro}
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-choco"
                  disabled={novaFeiraSave.pendente}
                  onClick={aoCriarFeira}
                >
                  {novaFeiraSave.pendente ? "Criando..." : "Criar feira"}
                </button>
              </div>
            )}

            {dados.eventos.length === 0 ? (
              <p className="section-note">Nenhuma feira cadastrada neste mês.</p>
            ) : (
              <div className="resumo-list">
                {dados.eventos.map((ev) => (
                  <CartaoFeira
                    key={ev.id}
                    evento={ev}
                    resumo={feiraResumoPorId.get(ev.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <section aria-label="Lista de vendas">
            <div className="section-row" style={{ marginBottom: 8 }}>
              <h2 className="section-heading">Vendas ({dados.vendas.length})</h2>
            </div>

            {diasOrdenados.length === 0 ? (
              <div className="card">
                <p className="section-note">Nenhuma venda registrada neste mês.</p>
              </div>
            ) : (
              <div className="stack-list">
                {diasOrdenados.map((grupo) => (
                  <div key={grupo.dia} className="venda-day-group">
                    <div className="venda-day-title tnum">{formatarDiaGrupo(grupo.dia)}</div>
                    {grupo.vendas.map((v) => (
                      <CartaoVenda
                        key={v.id}
                        venda={v}
                        nomeEvento={v.eventoId ? eventoPorId.get(v.eventoId)?.nome : undefined}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
