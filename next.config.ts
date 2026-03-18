import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "files.roxorgroup.com",
        pathname: "/**",
      },
    ],
  },
  async rewrites() {
    // Only proxy to the backend when Next.js doesn't already have a matching
    // route handler (e.g. keep NextAuth's `/api/auth/*` working).
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination: `${backendUrl}/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
