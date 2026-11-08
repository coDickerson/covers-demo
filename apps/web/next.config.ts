import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@covers/contract', '@covers/live-service', '@covers/engine'],
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
