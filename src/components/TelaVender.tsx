"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { criarEvento, registrarVenda } from "@/app/actions";
import { brl, parseNumeroBR } from "@/lib/calc";
import { CANAL_FEIRA, resultadoItem, somarDias, type DadosVender, type Evento } from "@/lib/vendas";
import { desfocarNoEnter, paraCampo, paraPreco, useSalvar } from "./useSalvar";

interface ItemSacola {
  uid: number;
  produtoId: number;
  nome: string;
  quantidade: number;
  precoCampo: string;
  custoUn: number;
}

function formatarDiaCurto(isoDia: string): string {
  const [, mes, dia] = isoDia.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${Number(dia)} ${meses[Number(mes) - 1] ?? ""}`.trim();
}

export function TelaVender({ dados }: { dados: DadosVender }) {
  const router = useRouter();
  const vendaSave = useSalvar();
  const feiraSave = useSalvar();
  const proxUid = useRef(1);

  const [eventosLocais, setEventosLocais] = useState<Evento[]>(dados.eventos);
  useEffect(() => {
    setEventosLocais(dados.eventos);
  }, [dados.eventos]);

  useEffect(() => {
    function aoVoltarFoco() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", aoVoltarFoco);
    return () => document.removeEventListener("visibilitychange", aoVoltarFoco);
  }, [router]);

  const canaisAtivos = dados.canais.filter((c) => c.ativo);
  const canalInicial = canaisAtivos[0] ?? null;

  const [canalId, setCanalId] = useState<number>(canalInicial?.id ?? 0);
  const [formaId, setFormaId] = useState<number>(
    canalInicial?.formas.find((f) => f.ativo)?.id ?? 0,
  );
  const [dataVenda, setDataVenda] = useState<string>(dados.hoje);
  const [editarData, setEditarData] = useState(false);

  const [produtoId, setProdutoId] = useState<number>(dados.produtos[0]?.id ?? 0);
  const [qtdCampo, setQtdCampo] = useState<string>("1");
  const [precoEditado, setPrecoEditado] = useState<string | null>(null);
  const [sacola, setSacola] = useState<ItemSacola[]>([]);

  const canalAtual = canaisAtivos.find((c) => c.id === canalId) ?? canalInicial;
  const ehFeira = canalAtual?.nome === CANAL_FEIRA;
  const eventosDoDia = eventosLocais.filter((e) => !e.canceladoEm && e.data === dataVenda);

  const [eventoId, setEventoId] = useState<number | null>(() => {
    if (!canalAtual || canalAtual.nome !== CANAL_FEIRA) return null;
    return dados.eventos.find((e) => !e.canceladoEm && e.data === dados.hoje)?.id ?? null;
  });

  // Se virou meia-noite em São Paulo após visibilitychange + refresh, atualiza 'Hoje' e a feira do dia.
  const hojeAnterior = useRef(dados.hoje);
  useEffect(() => {
    if (hojeAnterior.current !== dados.hoje) {
      const estavaEmHoje = dataVenda === hojeAnterior.current;
      hojeAnterior.current = dados.hoje;
      if (estavaEmHoje) {
        setDataVenda(dados.hoje);
        setFeiraData(dados.hoje);
        if (ehFeira) {
          const evNovoDia = dados.eventos.find((e) => !e.canceladoEm && e.data === dados.hoje);
          setEventoId(evNovoDia?.id ?? null);
        }
      }
    }
  }, [dados.hoje, dados.eventos, dataVenda, ehFeira]);

  // Criação inline de feira ("+ Nova feira")
  const [criandoFeira, setCriandoFeira] = useState(false);
  const [feiraNome, setFeiraNome] = useState("");
  const [feiraData, setFeiraData] = useState(dados.hoje);
  const [feiraCusto, setFeiraCusto] = useState("0,00");

  const [toast, setToast] = useState<string | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  if (dados.produtos.length === 0 || canaisAtivos.length === 0) {
    return (
      <div className="estado-vazio">
        <h2>Cadastre um produto antes de vender</h2>
        <p>Assim que houver receitas ativas e canais configurados, você registra vendas por aqui.</p>
        <Link href="/produtos" className="btn btn-mustard">
          Ir para Produtos
        </Link>
      </div>
    );
  }

  const produtoAtual = dados.produtos.find((p) => p.id === produtoId) ?? dados.produtos[0];
  const precoCanalNumero =
    produtoAtual.precosPorCanal.find((p) => p.canalId === canalAtual?.id)?.preco ?? 0;
  const precoCampoAtual = precoEditado ?? paraPreco(precoCanalNumero);
  const precoNumeroAtual = Math.max(0, parseNumeroBR(precoCampoAtual));
  const qtdTexto = qtdCampo.trim();
  const qtdValida = /^[1-9]\d{0,2}$/.test(qtdTexto);
  const qtdNumero = qtdValida ? Number(qtdTexto) : null;

  const formasCanal = canalAtual?.formas.filter((f) => f.ativo) ?? [];
  const formaAtual = formasCanal.find((f) => f.id === formaId) ?? formasCanal[0] ?? null;
  const taxaEfetiva = formaAtual?.taxaPct ?? null;

  const itensCombinados = [
    ...sacola.map((i) => ({
      produtoId: i.produtoId,
      nome: i.nome,
      quantidade: i.quantidade,
      precoCampo: i.precoCampo,
      precoNum: Math.max(0, parseNumeroBR(i.precoCampo)),
      custoUn: i.custoUn,
    })),
    ...(qtdNumero !== null
      ? [
          {
            produtoId: produtoAtual.id,
            nome: produtoAtual.nome,
            quantidade: qtdNumero,
            precoCampo: precoCampoAtual,
            precoNum: precoNumeroAtual,
            custoUn: produtoAtual.custoUn,
          },
        ]
      : []),
  ];

  const resumoPrevisto = itensCombinados.reduce(
    (acc, item) => {
      const res = resultadoItem(
        { quantidade: item.quantidade, precoUn: item.precoNum, custoUn: item.custoUn },
        taxaEfetiva,
        dados.impostoPct,
      );
      acc.faturamento += res.faturamento;
      acc.custo += res.custo;
      acc.taxas += res.taxas;
      acc.margem += res.margem;
      return acc;
    },
    { faturamento: 0, custo: 0, taxas: 0, margem: 0 },
  );

  const eventoSelecionado = ehFeira
    ? eventosDoDia.find((e) => e.id === eventoId) ?? null
    : null;

  const minData = somarDias(dados.hoje, -60);

  function selecionarCanal(novoCanalId: number) {
    setToast(null);
    setErroLocal(null);
    setCanalId(novoCanalId);
    setPrecoEditado(null);

    const proxCanal = canaisAtivos.find((c) => c.id === novoCanalId);
    const formasProx = proxCanal?.formas.filter((f) => f.ativo) ?? [];
    if (!formasProx.some((f) => f.id === formaId)) {
      setFormaId(formasProx[0]?.id ?? 0);
    }

    if (proxCanal?.nome === CANAL_FEIRA) {
      const ev = eventosLocais.find((e) => !e.canceladoEm && e.data === dataVenda);
      setEventoId(ev?.id ?? null);
    } else {
      setEventoId(null);
      setCriandoFeira(false);
    }
  }

  function trocarData(novaData: string) {
    if (!novaData) return;
    setToast(null);
    setErroLocal(null);
    setDataVenda(novaData);
    setFeiraData(novaData);
    if (ehFeira) {
      const doDia = eventosLocais.filter((e) => !e.canceladoEm && e.data === novaData);
      setEventoId((atual) => (atual && doDia.some((e) => e.id === atual) ? atual : doDia[0]?.id ?? null));
    }
  }

  function ajustarQtd(delta: number) {
    setToast(null);
    setErroLocal(null);
    const base = qtdNumero ?? (delta > 0 ? 0 : 2);
    const prox = Math.min(999, Math.max(1, base + delta));
    setQtdCampo(String(prox));
  }

  function adicionarOutroSabor() {
    setToast(null);
    setErroLocal(null);
    if (qtdNumero === null) {
      setErroLocal("Informe uma quantidade inteira entre 1 e 999.");
      return;
    }

    setSacola((prev) => [
      ...prev,
      {
        uid: proxUid.current++,
        produtoId: produtoAtual.id,
        nome: produtoAtual.nome,
        quantidade: qtdNumero,
        precoCampo: paraPreco(precoNumeroAtual),
        custoUn: produtoAtual.custoUn,
      },
    ]);

    const proximoOutro = dados.produtos.find((p) => p.id !== produtoAtual.id);
    if (proximoOutro) setProdutoId(proximoOutro.id);
    setQtdCampo("1");
    setPrecoEditado(null);
  }

  function confirmarNovaFeira() {
    feiraSave.limparErro();
    const nomeLimpo = feiraNome.trim();
    const dataAlvo = feiraData;
    const custoStr = feiraCusto || "0";

    feiraSave.salvar(
      () =>
        criarEvento({
          nome: nomeLimpo,
          data: dataAlvo,
          custoFixo: custoStr,
        }).then((res) => {
          if (res.ok) {
            const criado: Evento = {
              id: res.eventoId,
              nome: nomeLimpo,
              data: dataAlvo,
              custoFixo: Math.max(0, parseNumeroBR(custoStr)),
              nota: null,
              criadoPor: null,
              criadoEm: new Date().toISOString(),
              alteradoPor: null,
              alteradoEm: null,
              canceladoEm: null,
              canceladoPor: null,
            };
            setEventosLocais((prev) => [...prev, criado]);
            if (dataAlvo <= dados.hoje && dataAlvo >= minData) {
              setDataVenda(dataAlvo);
              setEventoId(res.eventoId);
            } else {
              setToast(`Feira "${nomeLimpo}" salva para ${formatarDiaCurto(dataAlvo)}.`);
            }
            setCriandoFeira(false);
            setFeiraNome("");
            setFeiraCusto("0,00");
            router.refresh();
          }
          return res;
        }),
    );
  }

  function confirmarVenda() {
    setToast(null);
    setErroLocal(null);
    vendaSave.limparErro();

    if (!canalAtual || !formaAtual) {
      setErroLocal("Escolha o canal e a forma de pagamento.");
      return;
    }
    if (qtdNumero === null) {
      setErroLocal("Informe uma quantidade inteira entre 1 e 999.");
      return;
    }

    vendaSave.salvar(
      () =>
        registrarVenda({
          canalId: canalAtual.id,
          formaId: formaAtual.id,
          eventoId: ehFeira ? eventoId : undefined,
          vendidaEm: dataVenda === dados.hoje ? undefined : dataVenda,
          itens: itensCombinados.map((i) => ({
            produtoId: i.produtoId,
            quantidade: i.quantidade,
            precoUn: i.precoCampo,
          })),
        }).then((res) => {
          if (res.ok) {
            const sufixoSabores =
              itensCombinados.length > 1 ? ` (${itensCombinados.length} sabores)` : "";
            setToast(
              `Venda registrada · custo do dia salvo: ${brl(res.custoUnMedio)}/un${sufixoSabores}`,
            );
            setSacola([]);
            setQtdCampo("1");
            setPrecoEditado(null);
            router.refresh();
          }
          return res;
        }),
    );
  }

  return (
    <>
      <div className="sell-head">
        <div>
          <h1 className="page-title">Registrar venda</h1>
          <p className="page-sub">Toques grandes · custo do dia salvo na hora</p>
        </div>

        <button
          type="button"
          className="sell-date-btn tnum"
          onClick={() => setEditarData((v) => !v)}
        >
          {dataVenda === dados.hoje ? `Hoje (${formatarDiaCurto(dataVenda)})` : formatarDiaCurto(dataVenda)}
          {" · "}
          {editarData ? "fechar" : "outro dia"}
        </button>
      </div>

      {editarData && (
        <div className="card" style={{ padding: 12 }}>
          <div className="field-group">
            <label className="field-label" htmlFor="venda-data">
              Data da venda (até 60 dias atrás)
            </label>
            <input
              id="venda-data"
              type="date"
              className="field-input tnum"
              value={dataVenda}
              min={minData}
              max={dados.hoje}
              onChange={(e) => trocarData(e.target.value)}
            />
          </div>
          {dataVenda !== dados.hoje && (
            <button
              type="button"
              className="btn btn-soft"
              style={{ marginTop: 8, minHeight: 44 }}
              onClick={() => trocarData(dados.hoje)}
            >
              Voltar para hoje ({formatarDiaCurto(dados.hoje)})
            </button>
          )}
        </div>
      )}

      <div>
        <div className="sell-step-label">1. Produto</div>
        <div className="sell-product-grid" id="sell-products">
          {dados.produtos.map((prod) => {
            const ativo = prod.id === produtoAtual.id;
            const precoNoCanal =
              prod.precosPorCanal.find((p) => p.canalId === canalAtual?.id)?.preco ?? 0;
            return (
              <button
                key={prod.id}
                type="button"
                className={`sell-prod-btn${ativo ? " is-selected" : ""}`}
                onClick={() => {
                  setToast(null);
                  setErroLocal(null);
                  setProdutoId(prod.id);
                  setPrecoEditado(null);
                }}
              >
                <span className="sell-prod-name">
                  <span>{prod.nome}</span>
                  {ativo && <span aria-hidden="true">&#10003;</span>}
                </span>
                <span className="sell-prod-price tnum">{brl(precoNoCanal)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="sell-step-label">2. Quantidade</div>
        <div className="big-stepper">
          <button
            type="button"
            className="stepper-btn stepper-btn--minus"
            aria-label="Diminuir quantidade"
            onClick={() => ajustarQtd(-1)}
          >
            &minus;
          </button>
          <div className="stepper-input-wrap">
            <input
              aria-label="Quantidade de unidades"
              className="stepper-input tnum"
              inputMode="numeric"
              value={qtdCampo}
              onChange={(e) => {
                setToast(null);
                setErroLocal(null);
                setQtdCampo(e.target.value);
              }}
              onKeyDown={desfocarNoEnter}
              onBlur={() => setQtdCampo(qtdCampo.trim())}
            />
            <span className="stepper-unit-label">{qtdNumero === 1 ? "unidade" : "unidades"}</span>
          </div>
          <button
            type="button"
            className="stepper-btn stepper-btn--plus"
            aria-label="Aumentar quantidade"
            onClick={() => ajustarQtd(1)}
          >
            +
          </button>
        </div>
        {!qtdValida && (
          <p className="alerta-linha" role="alert" style={{ marginTop: 6 }}>
            Quantidade precisa ser um número inteiro de 1 a 999.
          </p>
        )}
      </div>

      <div>
        <div className="sell-step-label">3. Canal</div>
        <div className="choice-2">
          {canaisAtivos.map((c) => {
            const ativo = c.id === canalAtual?.id;
            return (
              <button
                key={c.id}
                type="button"
                className={`choice-btn${ativo ? " is-selected" : ""}`}
                onClick={() => selecionarCanal(c.id)}
              >
                <span>{c.nome}</span>
                <small>
                  {c.nome === CANAL_FEIRA
                    ? eventoSelecionado?.nome ?? "Porta a porta"
                    : "Direto"}
                </small>
              </button>
            );
          })}
        </div>
      </div>

      {ehFeira && (
        <div className="sell-events-box" aria-label="Selecionar feira">
          <div className="section-row">
            <span className="field-label">Feira de {formatarDiaCurto(dataVenda)}</span>
            <button
              type="button"
              className="btn-sugerido"
              style={{ minHeight: 40, padding: "4px 10px" }}
              onClick={() => {
                setFeiraData(dataVenda);
                setCriandoFeira((v) => !v);
              }}
            >
              {criandoFeira ? "Fechar" : "+ Nova feira"}
            </button>
          </div>

          <div className="sell-event-chips">
            {eventosDoDia.map((ev) => (
              <button
                key={ev.id}
                type="button"
                className={`sell-event-chip tnum${eventoId === ev.id ? " is-selected" : ""}`}
                onClick={() => {
                  setToast(null);
                  setEventoId(ev.id);
                }}
              >
                {ev.nome} · fixo {brl(ev.custoFixo)}
              </button>
            ))}

            <button
              type="button"
              className={`sell-event-chip${eventoId === null ? " is-selected" : ""}`}
              onClick={() => {
                setToast(null);
                setEventoId(null);
              }}
            >
              Sem evento (porta a porta)
            </button>
          </div>

          {criandoFeira && (
            <div className="canal-config-card" style={{ marginTop: 4 }}>
              <div className="field-group">
                <label className="field-label" htmlFor="nova-feira-nome">
                  Nome da feira
                </label>
                <input
                  id="nova-feira-nome"
                  className="field-input"
                  placeholder="Ex.: Feira do Sábado"
                  value={feiraNome}
                  onChange={(e) => setFeiraNome(e.target.value)}
                />
              </div>

              <div className="form-grid-2">
                <div className="field-group">
                  <label className="field-label" htmlFor="nova-feira-data">
                    Data
                  </label>
                  <input
                    id="nova-feira-data"
                    type="date"
                    className="field-input tnum"
                    value={feiraData}
                    onChange={(e) => setFeiraData(e.target.value)}
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="nova-feira-custo">
                    Custo fixo (R$)
                  </label>
                  <input
                    id="nova-feira-custo"
                    className="field-input field-input--num"
                    inputMode="decimal"
                    value={feiraCusto}
                    onChange={(e) => setFeiraCusto(e.target.value)}
                    onBlur={() => setFeiraCusto(paraPreco(parseNumeroBR(feiraCusto)))}
                  />
                </div>
              </div>

              {feiraSave.erro && (
                <div className="banner-erro" role="alert">
                  {feiraSave.erro}
                </div>
              )}

              <button
                type="button"
                className="btn btn-choco"
                disabled={feiraSave.pendente}
                onClick={confirmarNovaFeira}
              >
                {feiraSave.pendente ? "Criando..." : "Salvar feira"}
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="sell-step-label">4. Pagamento</div>
        <div className="choice-pay-grid">
          {formasCanal.map((f) => {
            const ativa = f.id === formaAtual?.id;
            return (
              <button
                key={f.id}
                type="button"
                className={`choice-btn${ativa ? " is-selected" : ""}`}
                onClick={() => {
                  setToast(null);
                  setFormaId(f.id);
                }}
              >
                <span>{f.nome}</span>
                <small className="tnum">
                  {f.taxaPct === null ? "taxa não informada" : `${paraCampo(f.taxaPct, 2)}%`}
                </small>
              </button>
            );
          })}
        </div>
        {formasCanal.length === 0 && (
          <div className="banner-aviso" style={{ marginTop: 8 }}>
            Nenhuma forma aceita neste canal.{" "}
            <Link href="/mais#canais" style={{ color: "inherit", fontWeight: 800 }}>
              Configurar em Mais &rarr;
            </Link>
          </div>
        )}
      </div>

      {sacola.length > 0 && (
        <div className="sell-cart-box" aria-label="Sabores já adicionados">
          <div className="sell-step-label" style={{ marginTop: 0 }}>
            Sabores nesta venda ({itensCombinados.length})
          </div>
          <div className="sell-cart-list">
            {sacola.map((item) => (
              <div key={item.uid} className="sell-cart-item">
                <div>
                  <strong className="tnum">
                    {item.quantidade} &times; {item.nome}
                  </strong>
                  <div className="recent-meta tnum">
                    {brl(parseNumeroBR(item.precoCampo))}/un · sub{" "}
                    {brl(item.quantidade * parseNumeroBR(item.precoCampo))}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remover ${item.nome} da venda`}
                  onClick={() => setSacola((prev) => prev.filter((x) => x.uid !== item.uid))}
                >
                  &times;
                </button>
              </div>
            ))}
            {qtdNumero !== null && (
              <div className="recent-meta tnum" style={{ paddingLeft: 2 }}>
                + atual acima: {qtdNumero} &times; {produtoAtual.nome} ({brl(precoNumeroAtual)}/un)
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sell-summary">
        <div className="sell-summary-main">
          <div className="sell-unit-box">
            <label className="field-label" htmlFor="venda-preco-un">
              Preço preenchido ({produtoAtual.nome})
            </label>
            <div className="field-with-suffix" style={{ marginTop: 4 }}>
              <input
                id="venda-preco-un"
                className="field-input field-input--num"
                style={{ minHeight: 44, background: "var(--surface)" }}
                inputMode="decimal"
                value={precoCampoAtual}
                onChange={(e) => {
                  setToast(null);
                  setPrecoEditado(e.target.value);
                }}
                onKeyDown={desfocarNoEnter}
                onBlur={() => setPrecoEditado(paraPreco(precoNumeroAtual))}
              />
              <span className="field-suffix">/un</span>
            </div>
          </div>

          <div className="sell-total-box">
            <div className="sell-total-val tnum">{brl(resumoPrevisto.faturamento)}</div>
            <div
              className={`sell-profit-tag tnum${resumoPrevisto.margem < 0 ? " sell-profit-tag--neg" : ""}`}
            >
              Lucro prev. {brl(resumoPrevisto.margem)}
            </div>
            <div className="recent-meta tnum" style={{ marginTop: 2 }}>
              Custo total {brl(resumoPrevisto.custo)}
              {resumoPrevisto.taxas > 0 ? ` · taxas ${brl(resumoPrevisto.taxas)}` : ""}
            </div>
          </div>
        </div>

        {formaAtual?.taxaPct === null && (
          <p className="section-note" style={{ fontSize: 12 }}>
            Taxa de <b>{formaAtual.nome}</b> não informada: o lucro previsto não desconta essa taxa
            {dados.impostoPct > 0 ? ` (imposto ${paraCampo(dados.impostoPct, 4)}% incluído)` : ""}.
          </p>
        )}

        {eventoSelecionado && eventoSelecionado.custoFixo > 0 && (
          <p className="section-note" style={{ fontSize: 12 }}>
            <b>{eventoSelecionado.nome}</b>: custo fixo de{" "}
            <b className="tnum">{brl(eventoSelecionado.custoFixo)}</b> será rateado entre tudo que
            vender no evento.
          </p>
        )}

        <button
          type="button"
          className="btn btn-outline"
          style={{ minHeight: 44 }}
          onClick={adicionarOutroSabor}
        >
          + Outro sabor
        </button>
      </div>

      {(erroLocal || vendaSave.erro) && (
        <div className="banner-erro" role="alert">
          {erroLocal ?? vendaSave.erro}
        </div>
      )}

      <button
        type="button"
        className="btn btn-mustard btn-full"
        disabled={vendaSave.pendente || formasCanal.length === 0 || !qtdValida}
        onClick={confirmarVenda}
      >
        {vendaSave.pendente
          ? "Registrando venda..."
          : `Confirmar venda · ${brl(resumoPrevisto.faturamento)}`}
      </button>

      {toast && (
        <div className="sell-toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
