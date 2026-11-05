import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @studio/seo-harness ships TS source (no build step).
  transpilePackages: ["@studio/seo-harness"],
  // Separate output dir lets a production build run beside `next dev` (which owns .next).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { optimizePackageImports: ["@phosphor-icons/react"] },
};

export default nextConfig;
