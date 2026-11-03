import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Photos/barcodes use authenticated handlers and plain <img>. There is no
  // reason to expose Next's unauthenticated image optimizer in this app.
  images: { unoptimized: true },
  output: process.env.JEFFVENTORY_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
