"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { brl, parseNumeroBR } from "@/lib/calc";
import {
  listaCompras,
  parsePlano,
  serializarPlano,
  type DadosProduzir,
  type ItemCompra,
  type ItemPlano,
  type ListaCompras,
  type ProdutoProducao,
} from "@/lib/producao";
import { paraCampo } from "./useSalvar";

interface EstadoLocalPlano {
  jaTenho: Record<number, string>;
  comprados: number[];
}

const STORAGE_PREFIX = "cc:produzir:v1:";
const MAX_CHAVES_STORAGE = 10;
const PASSO_FORNADA = 0.5;
const MAX_FORNADAS = 50;

function formatarQtdBR(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function chaveStorage(chavePlano: string): string {
  return `${STORAGE_PREFIX}${chavePlano}`;
}

function limparEstadoLocal(chavePlano: string) {
  if (!chavePlano || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(chaveStorage(chavePlano));
  } catch {
    // Armazenamento indisponível não impede usar a tela.
  }
}

function lerEstadoLocal(chavePlano: string): EstadoLocalPlano {
  const vazio: EstadoLocalPlano = { jaTenho: {}, comprados: [] };
  if (!chavePlano || typeof window === "undefined") return vazio;
  try {
    const bruto = window.localStorage.getItem(chaveStorage(chavePlano));
    if (!bruto) return vazio;
    const parsed: unknown = JSON.parse(bruto);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return vazio;

    const reg = parsed as Record<string, unknown>;
    const jaTenho: Record<number, string> = {};
    if (reg.jaTenho && typeof reg.jaTenho === "object" && !Array.isArray(reg.jaTenho)) {
      for (const [chave, valor] of Object.entries(reg.jaTenho as Record<string, unknown>)) {
        if (!/^\d+$/.test(chave) || typeof valor !== "string") continue;
        const id = Number(chave);
        if (Number.isSafeInteger(id) && id > 0) jaTenho[id] = valor;
      }
    }

    const compradosSet = new Set<number>();
    if (Array.isArray(reg.comprados)) {
      for (const item of reg.comprados) {
        if (typeof item === "number" && Number.isSafeInteger(item) && item > 0) {
          compradosSet.add(item);
        }
      }
    }

    return { jaTenho, comprados: [...compradosSet] };
  } catch {
    return vazio;
  }
}

function limitarChavesStorage(chaveAtual: string) {
  if (typeof window === "undefined") return;
  try {
    const entradas: { key: string; ts: number }[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX) || key === chaveAtual) continue;
      let ts = 0;
      try {
        const bruto = window.localStorage.getItem(key);
        const parsed = bruto ? (JSON.parse(bruto) as { ts?: unknown }) : null;
        if (parsed && typeof parsed.ts === "number" && Number.isFinite(parsed.ts)) {
          ts = parsed.ts;
        }
      } catch {
        ts = 0;
      }
      entradas.push({ key, ts });
    }
    const limiteOutras = Math.max(0, MAX_CHAVES_STORAGE - 1);
    if (entradas.length <= limiteOutras) return;
    entradas.sort((a, b) => a.ts - b.ts);
    const excesso = entradas.length - limiteOutras;
    for (let i = 0; i < excesso; i++) {
      window.localStorage.removeItem(entradas[i].key);
    }
  } catch {
    // Armazenamento indisponível não impede usar a tela.
  }
}

function gravarEstadoLocal(chavePlano: string, estado: EstadoLocalPlano) {
  if (!chavePlano || typeof window === "undefined") return;
  try {
    const temJaTenho = Object.keys(estado.jaTenho).length > 0;
    const temComprados = estado.comprados.length > 0;
    if (!temJaTenho && !temComprados) {
      window.localStorage.removeItem(chaveStorage(chavePlano));
      return;
    }
    const keyAtual = chaveStorage(chavePlano);
    window.localStorage.setItem(
      keyAtual,
      JSON.stringify({ ...estado, ts: Date.now() }),
    );
    limitarChavesStorage(keyAtual);
  } catch {
    // Armazenamento indisponível não impede usar a tela.
  }
}

function unidadesPorFornada(p: ProdutoProducao): number {
  return Math.floor(p.rendimento * (1 - p.perdaPct / 100));
}

function montarTextoWhatsApp(
  plano: ItemPlano[],
  produtos: ProdutoProducao[],
  res: ListaCompras,
): string {
  const prodNome = new Map(produtos.map((p) => [p.id, p.nome]));
  const linhas: string[] = ["*Lista de compras — Carol Brownie*", ""];
  linhas.push("Produção planejada:");
  for (const item of plano) {
    const nome = prodNome.get(item.produtoId) ?? `Produto #${item.produtoId}`;
    linhas.push(`- ${formatarQtdBR(item.fornadas)}× ${nome}`);
  }
  linhas.push(`Total estimado: ${formatarQtdBR(res.totais.unidadesBoas)} brownies`);

  const escreverGrupo = (titulo: string, itens: ItemCompra[]) => {
    const pendentes = itens.filter((i) => i.comprar > 0);
    if (pendentes.length === 0) return;
    linhas.push("", `*${titulo}:*`);
    for (const i of pendentes) {
      if (i.pacotes !== null && i.gasto !== null) {
        const desc = i.embalagem || `${formatarQtdBR(i.qtdEmbalagem)} ${i.unidade}`;
        linhas.push(`• ${i.nome}: ${i.pacotes} × ${desc} (${brl(i.gasto)})`);
      } else {
        linhas.push(`• ${i.nome}: ${formatarQtdBR(i.comprar)} ${i.unidade} (sem preço)`);
      }
    }
  };

  escreverGrupo("Ingredientes", res.ingredientes);
  escreverGrupo("Embalagens", res.embalagens);

  linhas.push(
    "",
    `Gasto no mercado: ${res.totais.incompleto ? "pelo menos " : ""}${brl(res.totais.gastoMercado)}`,
  );
  return linhas.join("\n");
}

function LinhaCompra({
  item,
  comprado,
  jaTenhoCampo,
  onAlternarComprado,
  onMudarJaTenho,
  onDesfocarJaTenho,
}: {
  item: ItemCompra;
  comprado: boolean;
  jaTenhoCampo: string;
  onAlternarComprado: () => void;
  onMudarJaTenho: (valor: string) => void;
  onDesfocarJaTenho: () => void;
}) {
  const descricaoEmbalagem =
    item.embalagem || `${formatarQtdBR(item.qtdEmbalagem)} ${item.unidade}`;

  return (
    <div className={`shop-row${comprado ? " shop-row--comprado" : ""}`}>
      <div className="shop-row-main">
        <label className="shop-check-wrap">
          <span className="shop-check-hit">
            <input
              type="checkbox"
              className="shop-check-input"
              checked={comprado}
              onChange={onAlternarComprado}
              aria-label={`Marcar ${item.nome} como comprado`}
            />
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="shop-item-name">{item.nome}</span>
            <span className="shop-item-pack tnum">
              {item.comprar <= 0
                ? "Nada a comprar (já tem em casa)"
                : item.pacotes !== null
                  ? `${item.pacotes} × ${descricaoEmbalagem}`
                  : `Falta ${formatarQtdBR(item.comprar)} ${item.unidade} · sem preço`}
            </span>
            <span className="shop-item-meta tnum">
              precisa {formatarQtdBR(item.necessario)} {item.unidade}
              {item.jaTenho > 0 && item.comprar > 0
                ? ` · falta ${formatarQtdBR(item.comprar)} ${item.unidade}`
                : ""}
              {item.sobra !== null && item.sobra > 0
                ? ` · sobra ${formatarQtdBR(item.sobra)} ${item.unidade}`
                : ""}
              {item.usadoPor.length > 0 ? ` · ${item.usadoPor.join(", ")}` : ""}
            </span>
          </span>
        </label>

        <span className="shop-item-price tnum">
          {item.comprar <= 0
            ? brl(0)
            : item.gasto !== null
              ? brl(item.gasto)
              : "Sem preço"}
        </span>
      </div>

      <div className="shop-jatenho-row">
        <label className="shop-jatenho-label" htmlFor={`jatenho-${item.insumoId}`}>
          Já tenho em casa
        </label>
        <div className="shop-jatenho-input-box">
          <div className="field-with-suffix">
            <input
              id={`jatenho-${item.insumoId}`}
              className="field-input field-input--num"
              inputMode="decimal"
              placeholder="0"
              value={jaTenhoCampo}
              onChange={(e) => onMudarJaTenho(e.target.value)}
              onBlur={onDesfocarJaTenho}
            />
            <span className="field-suffix">{item.unidade}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TelaProduzir({
  dados,
  planoQuery,
}: {
  dados: DadosProduzir;
  planoQuery: string;
}) {
  const router = useRouter();

  const [plano, setPlano] = useState<ItemPlano[]>(() => parsePlano(planoQuery));
  const [jaTenhoCampos, setJaTenhoCampos] = useState<Record<number, string>>({});
  const [comprados, setComprados] = useState<number[]>([]);
  const [copiado, setCopiado] = useState(false);
  const [textoParaCopiar, setTextoParaCopiar] = useState<string | null>(null);
  const copiadoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiadoTimerRef.current !== null) window.clearTimeout(copiadoTimerRef.current);
    };
  }, []);

  const ultimaQueryProp = useRef(planoQuery);
  useEffect(() => {
    if (ultimaQueryProp.current !== planoQuery) {
      ultimaQueryProp.current = planoQuery;
      setPlano(parsePlano(planoQuery));
    }
  }, [planoQuery]);

  const chavePlano = useMemo(() => serializarPlano(plano), [plano]);

  // Carrega "já tenho" e "comprado" do localStorage vinculados a este plano
  const chaveCarregada = useRef<string>("");
  const preservandoJaTenho = useRef(false);
  useEffect(() => {
    chaveCarregada.current = "";
    const temSalvo =
      Boolean(chavePlano) &&
      typeof window !== "undefined" &&
      window.localStorage.getItem(chaveStorage(chavePlano)) !== null;

    if (temSalvo || !preservandoJaTenho.current) {
      const salvo = lerEstadoLocal(chavePlano);
      setJaTenhoCampos(salvo.jaTenho);
      setComprados(salvo.comprados);
    } else {
      setComprados([]);
    }
    preservandoJaTenho.current = false;
    chaveCarregada.current = chavePlano;
  }, [chavePlano]);

  useEffect(() => {
    if (!chavePlano || chaveCarregada.current !== chavePlano) return;
    gravarEstadoLocal(chavePlano, { jaTenho: jaTenhoCampos, comprados });
  }, [chavePlano, jaTenhoCampos, comprados]);

  const jaTenhoNumeros = useMemo(() => {
    const mapa: Record<number, number> = {};
    for (const [idStr, txt] of Object.entries(jaTenhoCampos)) {
      if (typeof txt !== "string") continue;
      const val = Math.max(0, parseNumeroBR(txt));
      if (val > 0) mapa[Number(idStr)] = val;
    }
    return mapa;
  }, [jaTenhoCampos]);

  const resultado = useMemo(
    () => listaCompras(plano, dados.produtos, dados.insumos, jaTenhoNumeros),
    [plano, dados.produtos, dados.insumos, jaTenhoNumeros],
  );

  const planejadoPorProduto = useMemo(
    () => new Map(resultado.produtos.map((p) => [p.produtoId, p])),
    [resultado.produtos],
  );

  const fornadasPorProduto = useMemo(
    () => new Map(plano.map((p) => [p.produtoId, p.fornadas])),
    [plano],
  );

  const compradosSet = useMemo(() => new Set(comprados), [comprados]);

  function atualizarPlano(novoPlano: ItemPlano[]) {
    setCopiado(false);
    setTextoParaCopiar(null);
    const serial = serializarPlano(novoPlano);
    if (chavePlano && chavePlano !== serial && comprados.length === 0) {
      limparEstadoLocal(chavePlano);
    }
    setPlano(novoPlano);
    ultimaQueryProp.current = serial;
    router.replace(serial ? `/produzir?p=${serial}` : "/produzir", { scroll: false });
  }

  function alterarFornadas(produtoId: number, delta: number) {
    const atual = fornadasPorProduto.get(produtoId) ?? 0;
    const prox = Math.min(MAX_FORNADAS, Math.max(0, Math.round((atual + delta) * 2) / 2));
    if (prox === atual) return;

    preservandoJaTenho.current = true;
    const semProduto = plano.filter((p) => p.produtoId !== produtoId);
    const proximo = prox > 0 ? [...semProduto, { produtoId, fornadas: prox }] : semProduto;
    atualizarPlano(proximo);
  }

  function limparPlano() {
    setCopiado(false);
    setTextoParaCopiar(null);
    setJaTenhoCampos({});
    setComprados([]);
    limparEstadoLocal(chavePlano);
    atualizarPlano([]);
  }

  function alternarComprado(insumoId: number) {
    setComprados((prev) =>
      prev.includes(insumoId) ? prev.filter((id) => id !== insumoId) : [...prev, insumoId],
    );
  }

  function atualizarJaTenho(insumoId: number, valor: string) {
    setCopiado(false);
    setTextoParaCopiar(null);
    setJaTenhoCampos((prev) => ({ ...prev, [insumoId]: valor }));
  }

  function normalizarJaTenho(insumoId: number) {
    const bruto = (jaTenhoCampos[insumoId] ?? "").trim();
    if (!bruto) {
      setJaTenhoCampos((prev) => {
        const copia = { ...prev };
        delete copia[insumoId];
        return copia;
      });
      return;
    }
    const n = Math.max(0, parseNumeroBR(bruto));
    setJaTenhoCampos((prev) => ({ ...prev, [insumoId]: n > 0 ? paraCampo(n, 4) : "" }));
  }

  function confirmarCopiado() {
    setCopiado(true);
    setTextoParaCopiar(null);
    if (copiadoTimerRef.current !== null) window.clearTimeout(copiadoTimerRef.current);
    copiadoTimerRef.current = window.setTimeout(() => setCopiado(false), 2600);
  }

  async function copiarLista() {
    const texto = montarTextoWhatsApp(plano, dados.produtos, resultado);
    setCopiado(false);
    setTextoParaCopiar(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API indisponível");
      await navigator.clipboard.writeText(texto);
      confirmarCopiado();
    } catch {
      let ok = false;
      try {
        const ta = document.createElement("textarea");
        ta.value = texto;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, texto.length);
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
      if (ok) {
        confirmarCopiado();
      } else {
        setTextoParaCopiar(texto);
      }
    }
  }

  if (dados.produtos.length === 0) {
    return (
      <div className="estado-vazio">
        <h2>Nenhum produto ativo para planejar</h2>
        <p>Cadastre uma receita em Produtos para montar a lista de compras por fornadas.</p>
        <Link href="/produtos" className="btn btn-mustard">
          Ir para Produtos
        </Link>
      </div>
    );
  }

  const ordenarComCompradosNoFim = (itens: ItemCompra[]) => [
    ...itens.filter((i) => !compradosSet.has(i.insumoId)),
    ...itens.filter((i) => compradosSet.has(i.insumoId)),
  ];

  const ingredientesOrdenados = ordenarComCompradosNoFim(resultado.ingredientes);
  const embalagensOrdenadas = ordenarComCompradosNoFim(resultado.embalagens);
  const totalFornadas = resultado.produtos.reduce((acc, p) => acc + p.fornadas, 0);
  const temProdutosPlanejados = resultado.produtos.length > 0;
  const usaEstoqueEmCasa =
    resultado.totais.custoConsumido > resultado.totais.gastoMercado + 0.005 ||
    [...resultado.ingredientes, ...resultado.embalagens].some((item) => item.jaTenho > 0);

  return (
    <>
      <div className="produce-head">
        <div>
          <h1 className="page-title">Produzir</h1>
          <p className="page-sub">Quantas fornadas de cada sabor?</p>
        </div>
        {totalFornadas > 0 && (
          <span className="badge badge--cream tnum">
            {formatarQtdBR(totalFornadas)} fornadas · {formatarQtdBR(resultado.totais.unidadesBoas)} un
          </span>
        )}
      </div>

      <section aria-label="Planejar fornadas">
        <div className="batch-list">
          {dados.produtos.map((prod) => {
            const fornadas = fornadasPorProduto.get(prod.id) ?? 0;
            const infoProd = planejadoPorProduto.get(prod.id);
            const unFornada = unidadesPorFornada(prod);

            return (
              <div key={prod.id} className="batch-row">
                <div className="batch-info">
                  <strong>{prod.nome}</strong>
                  <span className="tnum">
                    {fornadas > 0 && infoProd
                      ? `rende ~${formatarQtdBR(infoProd.unidadesBoas)} brownies · ${
                          infoProd.incompleto ? "pelo menos " : ""
                        }${brl(infoProd.custoConsumido)}`
                      : `~${formatarQtdBR(unFornada)} brownies/fornada`}
                  </span>
                </div>

                <div className="mini-stepper">
                  <button
                    type="button"
                    className="mini-step-btn mini-step-btn--minus"
                    aria-label={`Diminuir fornadas de ${prod.nome}`}
                    disabled={fornadas <= 0}
                    onClick={() => alterarFornadas(prod.id, -PASSO_FORNADA)}
                  >
                    &minus;
                  </button>
                  <span className="mini-step-val tnum">{formatarQtdBR(fornadas)}</span>
                  <button
                    type="button"
                    className="mini-step-btn mini-step-btn--plus"
                    aria-label={`Aumentar fornadas de ${prod.nome}`}
                    disabled={fornadas >= MAX_FORNADAS}
                    onClick={() => alterarFornadas(prod.id, PASSO_FORNADA)}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {resultado.pendencias.length > 0 && (
        <section className="banner-aviso" role="status" aria-label="Pendências na lista de compras">
          <strong style={{ display: "block", marginBottom: 4 }}>Atenção na lista de compras</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {resultado.pendencias.map((p) => (
              <Link
                key={p.id}
                href={p.href}
                style={{ color: "inherit", fontWeight: 700, fontSize: 13 }}
              >
                {p.mensagem} &rarr;
              </Link>
            ))}
          </div>
        </section>
      )}

      {!temProdutosPlanejados ? (
        <div className="estado-vazio">
          <h2>Escolha quantas fornadas de cada sabor</h2>
          <p>
            Toque em + acima para montar a produção de 0,5 em 0,5 fornada e gerar a lista de
            compras arredondada por embalagem.
          </p>
          {plano.length > 0 && (
            <button type="button" className="btn btn-outline" onClick={limparPlano}>
              Limpar plano
            </button>
          )}
        </div>
      ) : (
        <>
          <section className="produce-total-banner" aria-label="Resumo do gasto previsto">
            <div className="produce-total-top">
              <span className="produce-total-label">Gasto no mercado</span>
              <strong className="produce-total-val tnum">
                {resultado.totais.incompleto && (
                  <span className="produce-total-prefixo">pelo menos </span>
                )}
                {brl(resultado.totais.gastoMercado)}
              </strong>
            </div>
            <div className="produce-total-sub tnum">
              {usaEstoqueEmCasa ? (
                <>
                  Custo dos insumos usados:{" "}
                  {resultado.totais.incompleto ? "pelo menos " : ""}
                  <b>{brl(resultado.totais.custoConsumido)}</b> (considera o que já tem em casa).
                </>
              ) : (
                <>
                  Consome {resultado.totais.incompleto ? "pelo menos " : ""}
                  <b>{brl(resultado.totais.custoConsumido)}</b> desta compra; o resto fica em
                  casa.
                </>
              )}
            </div>
            <div className="produce-total-sub tnum">
              Saem <b>{formatarQtdBR(resultado.totais.unidadesBoas)} brownies</b> ·{" "}
              {resultado.totais.pacotes}{" "}
              {resultado.totais.pacotes === 1 ? "pacote" : "pacotes"} no carrinho
            </div>
          </section>

          <div className="produce-actions-row">
            <button type="button" className="btn btn-mustard" onClick={copiarLista}>
              {copiado ? "Lista copiada!" : "Copiar lista"}
            </button>
            <button type="button" className="btn btn-outline" onClick={limparPlano}>
              Limpar plano
            </button>
          </div>

          {textoParaCopiar !== null && (
            <div className="banner-aviso produce-copy-fallback" role="status">
              <strong>Não consegui copiar automaticamente.</strong>
              <span>Copie a lista abaixo manualmente:</span>
              <textarea
                className="field-input produce-copy-textarea"
                readOnly
                rows={7}
                value={textoParaCopiar}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Lista de compras para copiar manualmente"
              />
            </div>
          )}

          {(ingredientesOrdenados.length > 0 || embalagensOrdenadas.length > 0) && (
            <section aria-label="Lista de compras">
              <div className="section-row" style={{ marginBottom: 8 }}>
                <h2 className="section-heading">Lista de compras</h2>
                <span className="badge badge--cream">Arredondada p/ embalagem</span>
              </div>

              <div className="shopping-card">
                {ingredientesOrdenados.length > 0 && (
                  <div>
                    <div className="shopping-subhead">Ingredientes</div>
                    {ingredientesOrdenados.map((item) => (
                      <LinhaCompra
                        key={item.insumoId}
                        item={item}
                        comprado={compradosSet.has(item.insumoId)}
                        jaTenhoCampo={jaTenhoCampos[item.insumoId] ?? ""}
                        onAlternarComprado={() => alternarComprado(item.insumoId)}
                        onMudarJaTenho={(v) => atualizarJaTenho(item.insumoId, v)}
                        onDesfocarJaTenho={() => normalizarJaTenho(item.insumoId)}
                      />
                    ))}
                  </div>
                )}

                {embalagensOrdenadas.length > 0 && (
                  <div>
                    <div className="shopping-subhead">
                      Embalagens ({formatarQtdBR(resultado.totais.unidadesBoas)} un)
                    </div>
                    {embalagensOrdenadas.map((item) => (
                      <LinhaCompra
                        key={item.insumoId}
                        item={item}
                        comprado={compradosSet.has(item.insumoId)}
                        jaTenhoCampo={jaTenhoCampos[item.insumoId] ?? ""}
                        onAlternarComprado={() => alternarComprado(item.insumoId)}
                        onMudarJaTenho={(v) => atualizarJaTenho(item.insumoId, v)}
                        onDesfocarJaTenho={() => normalizarJaTenho(item.insumoId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
