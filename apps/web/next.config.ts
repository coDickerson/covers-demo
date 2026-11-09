import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@covers/contract', '@covers/live-service', '@covers/engine', '@covers/integrations'],
  // Live replay mode (COVERS_CACHE=1) reads recorded responses from the repo's cache/ folder at runtime.
  outputFileTracingIncludes: { '/api/**': ['../../cache/**/*'] },
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
