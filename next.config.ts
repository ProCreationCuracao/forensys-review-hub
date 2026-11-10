import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "portal.anexxt.com" }], destination: "/portal/index.html" },
        { source: "/", has: [{ type: "host", value: "forensysdispatch.anexxt.com" }], destination: "/dispatch/index.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
