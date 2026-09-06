import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `typedRoutes` is deliberately off for now: it makes `tsc --noEmit` depend on
  // generated route types, so typecheck would only pass after a build.
};

export default nextConfig;
