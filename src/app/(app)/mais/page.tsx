import Link from "next/link";
import { Suspense } from "react";
import { sair } from "@/app/entrar/actions";
import { CanaisEditor } from "@/components/CanaisEditor";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { CustoHoraEditor } from "@/components/CustoHoraEditor";
import { EstadoErro } from "@/components/EstadoErro";
import { FormasPagamentoEditor } from "@/components/FormasPagamentoEditor";
import { FornoEditor } from "@/components/FornoEditor";
import { ImpostoEditor } from "@/components/ImpostoEditor";
import { exigirUsuario, type Usuario } from "@/lib/auth";
import {
  carregarCanais,
  carregarConfig,
  carregarCustoHora,
  carregarFormasPagamento,
  carregarForno,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

async function ConteudoMais({ usuario }: { usuario: Usuario }) {
  let custoHora: number;
  let forno;
  let canais;
  let formasPagamento;
  let config;
  try {
    [custoHora, forno, canais, formasPagamento, config] = await Promise.all([
      carregarCustoHora(),
      carregarForno(),
      carregarCanais(),
      carregarFormasPagamento(),
      carregarConfig(),
    ]);
  } catch (err) {
    return (
      <EstadoErro
        titulo="Não foi possível carregar as configurações"
        mensagem={err instanceof Error ? err.message : "Erro ao consultar o banco."}
      />
    );
  }

  const inicial = usuario.nome.trim().slice(0, 1).toUpperCase() || "C";

  return (
    <>
      <div>
        <h1 className="page-title">Mais</h1>
        <p className="page-sub">
          Insumos, mão de obra, forno e gás, canais, taxas, imposto e conta conectada.
        </p>
      </div>

      <Link href="/insumos" className="mais-atalho-card">
        <div className="mais-atalho-main">
          <span className="mais-atalho-title">Insumos e embalagens</span>
          <span className="mais-atalho-sub">
            Preços de ingredientes e materiais de embalagem
          </span>
        </div>
        <span className="falta-item-arrow" aria-hidden="true">
          &rarr;
        </span>
      </Link>

      <section className="card" aria-label="Conta conectada">
        <div className="conta-row">
          <div className="conta-info">
            <div className="conta-avatar" aria-hidden="true">
              {inicial}
            </div>
            <div>
              <h2 className="conta-nome">{usuario.nome}</h2>
              <span className="conta-login">@{usuario.login}</span>
            </div>
          </div>

          <form action={sair}>
            <button type="submit" className="btn btn-outline">
              Sair
            </button>
          </form>
        </div>

        <p className="page-sub" style={{ marginTop: 12 }}>
          Todas as alterações de preço de insumos, produtos e hora de trabalho ficam registradas
          com o seu usuário.
        </p>
      </section>

      <CustoHoraEditor valor={custoHora} />
      <FornoEditor forno={forno} />
      <CanaisEditor canais={canais} formasPagamento={formasPagamento} />
      <FormasPagamentoEditor formas={formasPagamento} />
      <ImpostoEditor impostoPct={config.impostoPct} />
    </>
  );
}

export default async function PaginaMais() {
  const usuario = await exigirUsuario();

  return (
    <Suspense fallback={<CarregandoPainel />}>
      <ConteudoMais usuario={usuario} />
    </Suspense>
  );
}
