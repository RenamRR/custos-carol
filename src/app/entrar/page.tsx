import { redirect } from "next/navigation";
import { FormEntrar } from "@/components/FormEntrar";
import { usuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PaginaEntrar() {
  const usuario = await usuarioAtual();
  if (usuario) redirect("/");

  return <FormEntrar />;
}
