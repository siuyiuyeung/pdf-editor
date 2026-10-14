import type { NextConfig } from 'next';

// Baked in at build time (rewrites are compiled into the routes manifest); the Compose service name by default.
const API_URL = process.env.API_URL ?? 'http://api:8000';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // Rewritten requests are proxied through a body clone that Next caps at 10 MB by default.
    // Uploads go up to 50 MB plus multipart overhead.
    middlewareClientMaxBodySize: '55mb',
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  webpack: (config) => {
    // pdfjs-dist references the optional Node "canvas" package; never bundle it.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
