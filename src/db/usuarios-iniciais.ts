import { hashSenhaValido, normalizarLogin } from "../lib/senhas";

export function lerUsuariosIniciais(valor: string) {
  const vistos = new Set<string>();
  return valor.split(";").map((entrada, i) => {
    const partes = entrada.split("|");
    const login = normalizarLogin(partes[0] ?? "");
    const nome = (partes[1] ?? "").trim();
    const senhaHash = partes[2] ?? "";
    if (partes.length !== 3 || !login || login.length > 100 || !nome || nome.length > 200 ||
        !hashSenhaValido(senhaHash) || vistos.has(login)) {
      // Nunca ecoar a configuração: contém hashes de credenciais.
      throw new Error(`USUARIOS_INICIAIS inválida na entrada ${i + 1}.`);
    }
    vistos.add(login);
    return { login, nome, senhaHash };
  });
}
