import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@despacho/shared'],
  reactStrictMode: true,
  // packages/shared importa './x.js' desde fuentes .ts (estilo ESM).
  webpack: (config) => {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};

export default config;
