import { Suspense } from "react";
import { sair } from "@/app/entrar/actions";
import { CarregandoPainel } from "@/components/CarregandoPainel";
import { CustoHoraEditor } from "@/components/CustoHoraEditor";
import { EstadoErro } from "@/components/EstadoErro";
import { exigirUsuario, type Usuario } from "@/lib/auth";
import { carregarCustoHora } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function ConteudoMais({ usuario }: { usuario: Usuario }) {
  let custoHora: number;
  try {
    custoHora = await carregarCustoHora();
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
        <p className="page-sub">Configurações de mão de obra e conta conectada.</p>
      </div>

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
