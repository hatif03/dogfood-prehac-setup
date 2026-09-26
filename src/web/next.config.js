const API = process.env.API_INTERNAL_URL || "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Lets several dev servers share this folder (NEXT_DIST_DIR=.next-a next dev -p 3101).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: __dirname,
  // Large imports and exports run longer than the proxy's 30 s default.
  experimental: { proxyTimeout: 300_000 },
  async rewrites() {
    return [
      { source: "/v1/:path*", destination: `${API}/v1/:path*` },
      { source: "/docs", destination: `${API}/docs` },
      { source: "/openapi.json", destination: `${API}/openapi.json` },
      { source: "/redoc", destination: `${API}/redoc` },
      { source: "/health", destination: `${API}/health` },
      { source: "/.well-known/:path*", destination: `${API}/.well-known/:path*` },
    ];
  },
};

module.exports = nextConfig;
