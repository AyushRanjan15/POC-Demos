import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables a self-contained Node.js server output for Docker deployment
  output: "standalone",
  async headers() {
    return [
      {
        // Required for SharedArrayBuffer — Kokoro/ONNX/WASM won't load without these
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy",  value: "same-origin"   },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin"  },
        ],
      },
    ];
  },
};

export default nextConfig;
