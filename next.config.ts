import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray package-lock.json in $HOME otherwise makes
  // Next infer the wrong root and mangle asset paths.
  turbopack: { root: __dirname },
};

export default nextConfig;
