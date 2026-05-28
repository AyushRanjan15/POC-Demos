import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for S3 + CloudFront (no Node.js runtime required).
  output: "export",
  // Required for `next/image` in static export mode.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
