import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,

  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8001" },
      {
        protocol: "https",
        hostname: process.env.BACKEND_HOST || "api.example.com",
      },
    ],
  },

  // API proxy for development
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [
          {
            source: "/api/v1/:path*",
            destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001"}/api/v1/:path*`,
          },
        ]
      : [];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },

  // Webpack config for react-pdf PDF.js worker
  webpack: (config) => {
    // Required for react-pdf to work properly with Next.js
    config.resolve.alias.canvas = false;
    
    return config;
  },
};

export default nextConfig;
