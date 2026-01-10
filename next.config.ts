import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/cliente/:path*',
        destination: `https://frontend-client-six-orpin.vercel.app/:path*`, // URL do Vercel no screenshot
      },
    ];
  },
};

export default nextConfig;
