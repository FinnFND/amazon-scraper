import type { NextConfig } from "next";


const nextConfig: NextConfig = {
  experimental: {
    // Ensure env is exposed properly when referenced
  },
  env: {
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  },
};

export default nextConfig;
