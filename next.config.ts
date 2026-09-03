import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Fabric photos are hosted on Cloudinary (see POST /api/uploads) —
    // next/image needs the host whitelisted before it will render them.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
