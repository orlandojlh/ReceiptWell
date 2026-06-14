import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // sharp es un módulo nativo — debe correr en Node.js puro, no en el edge
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
