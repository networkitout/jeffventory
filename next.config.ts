import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: process.env.JEFFVENTORY_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
