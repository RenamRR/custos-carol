import type { NextConfig } from "next";

const config: NextConfig = {
  // Dokploy builda a imagem pelo Dockerfile: standalone deixa o runtime mínimo.
  output: "standalone",
  poweredByHeader: false,
};

export default config;
