import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Allow deploy.sh to build into a staging directory and atomically swap,
  // so an interrupted build can't leave the live .next/ in a partial state.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ]
  },
}

export default nextConfig
