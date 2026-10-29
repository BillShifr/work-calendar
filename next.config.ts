import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: { authInterrupts: true },
};

export default nextConfig;
