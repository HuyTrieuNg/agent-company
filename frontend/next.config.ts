import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    'retributively-iodometric-max.ngrok-free.dev',
  ],
  // Tăng timeout proxy để RAG (Qdrant + Gemini) có đủ thời gian xử lý
  experimental: {
    proxyTimeout: 120_000, // 120 giây
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
