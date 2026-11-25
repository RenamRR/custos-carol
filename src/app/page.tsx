import { BotaoAcao } from "@/components/BotaoAcao";
import { CustoHoraEditor } from "@/components/CustoHoraEditor";
import { EditorReceita } from "@/components/EditorReceita";
import { LinhaInsumo } from "@/components/LinhaInsumo";
import { Resumo } from "@/components/Resumo";
import { Tabs, type Aba } from "@/components/Tabs";
import { criarInsumo, criarProduto } from "@/app/actions";
import {
  brl,
  calcularProduto,
  formatarMinutos,
  type Insumo,
  type Produto,
} from "@/lib/calc";
import { carregarCustoHora, carregarInsumos, carregarProdutos } from "@/lib/queries";

// Lê do banco a cada requisição: cache estático mostraria custo velho depois de
// uma alteração de preço, que é exatamente o erro que este sistema existe para evitar.
export const dynamic = "force-dynamic";

function PainelReceitas({
  produtos,
  insumos,
  custoHora,
}: {
  produtos: Produto[];
  insumos: Insumo[];
  custoHora: number;
}) {
  return (
    <>
      <div className="panel-head panel-head--acao">
        <div>
          <h2>Receitas</h2>
          <p>
            Cada produto tem três escalas: ingrediente é lançado <b>por lote</b>, embalagem{" "}
            <b>por unidade produzida</b>, e mão de obra se divide entre preparo (lote) e
            acabamento (unidade). Só entra no custo o que o produto declara.
          </p>
        </div>
        <BotaoAcao acao={criarProduto}>+ Produto</BotaoAcao>
      </div>

      <div className="recipes">
        {produtos.map((p) => (
          <EditorReceita key={p.id} produto={p} insumos={insumos} custoHora={custoHora} />
        ))}
      </div>
    </>
  );
}

function PainelMaoDeObra({
  produtos,
  insumos,
  custoHora,
}: {
  produtos: Produto[];
  insumos: Insumo[];
  custoHora: number;
}) {
  return (
    <>
      <div className="panel-head">
        <h2>Mão de obra</h2>
        <p>
          Um valor por hora para tudo, e cada receita declara quanto tempo leva. Mudou o valor
          da hora, todos os produtos recalculam — e o custo do passado continua o que era,
          porque a hora também tem histórico.
        </p>
      </div>

      <CustoHoraEditor valor={custoHora} />

      <div className="scroller" style={{ marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Preparo</th>
              <th className="num">Acabam./un</th>
              <th className="num">Tempo do lote</th>
              <th className="num">Custo no lote</th>
              <th className="num">Por unidade</th>
              <th className="num">% do custo</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => {
              const r = calcularProduto(p, insumos, custoHora);
              const parte = r.custoTotal > 0 ? (r.custoMaoDeObra / r.custoTotal) * 100 : 0;
              return (
                <tr key={p.id}>
                  <td>{p.nome}</td>
                  <td className="num">{formatarMinutos(p.minutosPreparo)}</td>
                  <td className="num">{formatarMinutos(p.minutosAcabamentoUn)}</td>
                  <td className="num">{formatarMinutos(r.minutosLote)}</td>
                  <td className="num">{brl(r.custoMaoDeObra)}</td>
                  <td className="num strong">{brl(r.custoMaoDeObra / r.rendimento)}</td>
                  <td className="num">{parte.toFixed(0)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="rodape-nota">
        Os tempos são editados dentro de cada receita, na aba Receitas. Aqui é só a comparação.
      </p>
    </>
  );
}

function PainelInsumos({ insumos }: { insumos: Insumo[] }) {
  const ingredientes = insumos.filter((i) => i.tipo === "ingrediente");

  return (
    <>
      <div className="panel-head">
        <h2>Insumos</h2>
        <p>
          Catálogo de ingredientes: o que vem na embalagem de compra e por quanto. Cada um
          existe em um lugar só — mudou o fornecedor, todas as receitas recalculam. Alterar
          preço não sobrescreve: vira registro novo no histórico.
        </p>
      </div>

      <div className="scroller">
        <table>
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Embalagem de compra</th>
              <th className="num">Qtd</th>
              <th>Unidade</th>
              <th className="num">Preço pago</th>
              <th className="num">Custo unitário</th>
              <th className="row-actions" />
            </tr>
          </thead>
          <tbody>
            {ingredientes.map((i) => (
              <LinhaInsumo key={i.id} insumo={i} />
            ))}
          </tbody>
        </table>
        <div className="add-row">
          <BotaoAcao acao={criarInsumo.bind(null, "ingrediente")}>+ Insumo</BotaoAcao>
        </div>
      </div>
    </>
  );
}

function PainelEmbalagem({ insumos }: { insumos: Insumo[] }) {
  const materiais = insumos.filter((i) => i.tipo === "embalagem");

  return (
    <>
      <div className="panel-head">
        <h2>Embalagem</h2>
        <p>
          Catálogo de materiais, com o custo unitário de cada um. Isto aqui é só cadastro —
          <b> nada daqui entra em custo sozinho</b>. Quem usa cada material, e quanto, é
          definido dentro de cada produto, na aba Receitas.
        </p>
      </div>

      <div className="scroller">
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Embalagem de compra</th>
              <th className="num">Qtd</th>
              <th>Unidade</th>
              <th className="num">Preço pago</th>
              <th className="num">Custo unitário</th>
              <th className="row-actions" />
            </tr>
          </thead>
          <tbody>
            {materiais.length === 0 ? (
              <tr>
                <td colSpan={7} className="vazio">
                  Nenhum material cadastrado.
                </td>
              </tr>
            ) : (
              materiais.map((i) => <LinhaInsumo key={i.id} insumo={i} />)
            )}
          </tbody>
        </table>
        <div className="add-row">
          <BotaoAcao acao={criarInsumo.bind(null, "embalagem")}>+ Material</BotaoAcao>
        </div>
      </div>
    </>
  );
}

function BancoIndisponivel({ erro }: { erro: string }) {
  return (
    <div className="aviso">
      <h2>Banco não disponível</h2>
      <p>
        O app carregou, mas não conseguiu ler do Postgres. Confira o <code>DATABASE_URL</code> e
        se o schema e o seed já foram aplicados:
      </p>
      <pre>
        {`npm run db:check
npm run db:migrate
npm run db:seed`}
      </pre>
      <p style={{ marginTop: 10, color: "var(--muted)" }}>{erro}</p>
    </div>
  );
}

function Cabecalho() {
  return (
    <header className="masthead">
      <div className="brand">
        <span className="brand__mark">CC</span>
        <div>
          <h1>Custo Carol</h1>
          <p>Calculadora de custo de produção</p>
        </div>
      </div>
    </header>
  );
}

export default async function Pagina() {
  let insumos: Insumo[];
  let produtos: Produto[];
  let custoHora: number;

  try {
    [insumos, produtos, custoHora] = await Promise.all([
      carregarInsumos(),
      carregarProdutos(),
      carregarCustoHora(),
    ]);
  } catch (err) {
    return (
      <main className="wrap">
        <Cabecalho />
        <BancoIndisponivel erro={err instanceof Error ? err.message : String(err)} />
      </main>
    );
  }

  const resultados = produtos.map((p) => calcularProduto(p, insumos, custoHora));

  const abas: Aba[] = [
    {
      id: "receitas",
      rotulo: "Receitas",
      conteudo: (
        <PainelReceitas produtos={produtos} insumos={insumos} custoHora={custoHora} />
      ),
    },
    { id: "insumos", rotulo: "Insumos", conteudo: <PainelInsumos insumos={insumos} /> },
    { id: "embalagem", rotulo: "Embalagem", conteudo: <PainelEmbalagem insumos={insumos} /> },
    {
      id: "mao-de-obra",
      rotulo: "Mão de obra",
      conteudo: (
        <PainelMaoDeObra produtos={produtos} insumos={insumos} custoHora={custoHora} />
      ),
    },
  ];

  return (
    <main className="wrap">
      <Cabecalho />
      <Resumo resultados={resultados} />
      <Tabs abas={abas} />

      <section className="notes">
        <div>
          <h4>Como a margem é lida</h4>
          <p>
            A etiqueta colorida é quanto sobra do preço depois de insumo, embalagem e mão de
            obra: <b>50% ou mais</b> passa, <b>35% a 50%</b> merece atenção, <b>abaixo de 35%</b>{" "}
            aperta. O corte é exigente porque o que sobra ainda paga o que não está aqui. Passe
            o mouse na etiqueta para ver o markup sobre custo direto.
          </p>
        </div>
        <div>
          <h4>Ainda fora do custo</h4>
          <p>
            Gás e energia, perda e quebra, taxa de cartão e delivery, imposto e rateio de custo
            fixo. O custo real por brownie continua sendo maior que o mostrado aqui.
          </p>
        </div>
        <div>
          <h4>Como salva</h4>
          <p>
            Cada campo salva ao sair dele. Preço nunca é sobrescrito: toda alteração vira um
            registro novo no histórico, com data — é isso que vai permitir ver o custo subindo
            ao longo do tempo.
          </p>
        </div>
      </section>
    </main>
  );
}
