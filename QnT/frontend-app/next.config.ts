import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow cross-origin requests from development environments
  allowedDevOrigins: [
    '192.168.146.1',
    'localhost',
    '127.0.0.1',
  ],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:4000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
