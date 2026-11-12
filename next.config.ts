import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: { authInterrupts: true },
  outputFileTracingIncludes: {
    "/api/hr/export/vacations": ["./templates/vacation-export/**/*"],
  },
};

export default nextConfig;
