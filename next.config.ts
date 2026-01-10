import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/cliente/:path*',
        destination: `https://frontend-client-carloramon-creators-projects.vercel.app/:path*`, // Substitua pela URL real do Vercel
      },
    ];
  },
};

export default nextConfig;
