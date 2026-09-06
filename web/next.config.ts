import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const backendOrigin = process.env.HOLDFAST_BACKEND_ORIGIN?.trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The repository has a separate root application and lockfile. Pinning the
  // Turbopack root here prevents Next from treating the repository root as this
  // application's workspace.
  turbopack: {
    root: webRoot,
  },
  // In local live mode the root API normally runs on :3001. Keeping browser
  // requests same-origin avoids requiring CORS support in the frozen backend.
  async rewrites() {
    if (!backendOrigin) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
  // `typedRoutes` is deliberately off for now: it makes `tsc --noEmit` depend on
  // generated route types, so typecheck would only pass after a build.
};

export default nextConfig;
