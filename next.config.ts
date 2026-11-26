import type { NextConfig } from "next";

const config: NextConfig = {
  // Dokploy builda a imagem pelo Dockerfile: standalone deixa o runtime mínimo.
  output: "standalone",
  poweredByHeader: false,
  // Cloudflare/Traefik podem encaminhar um Host interno. Só a origem pública
  // exata é aceita nessa exceção; o Next continua validando Origin contra Host.
  // Atualizar esta origem se o domínio público do Dokploy mudar.
  experimental: {
    serverActions: { allowedOrigins: ["custos.renamrr.com.br"] },
  },
};

export default config;
